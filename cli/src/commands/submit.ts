import { Command } from "commander";
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { loadUserConfig } from "../utils/config.js";
import { PtfApiClient } from "../utils/api.js";
import { resolveTaskFromCwd, getTrackedTaskById, getAllTrackedTasks, addVerification, untrackTask, type TrackedTask } from "../utils/tracker.js";
import { gitCmd, shellEscape } from "../utils/shell.js";
import { printError, printInfo, printSuccess, printWarning, printOfflineBanner } from "../utils/display.js";

export const submitCommand = new Command("submit")
  .description("Soumettre une tâche (tout automatique — détection, switch, vérifications, push)")
  .argument("[taskId]", "ID de la tâche (optionnel)")
  .option("--skip-checks", "Skip les vérifications pré-soumission")
  .option("--commit <hash>", "Override le commit à soumettre")
  .action(async (taskIdArg?: string, options?: { skipChecks?: boolean; commit?: string }) => {
    const { default: inquirer } = await import("inquirer");

    // --- 1. Resolve which task to submit ---
    let tracked: TrackedTask | null = null;

    if (taskIdArg) {
      tracked = getTrackedTaskById(taskIdArg);
      if (!tracked) {
        printError(`Aucune tâche trackée avec l'ID ${taskIdArg}.`);
        process.exit(1);
      }
    }

    if (!tracked) {
      tracked = resolveTaskFromCwd();
    }

    if (!tracked) {
      const all = getAllTrackedTasks();

      if (all.length === 0) {
        printError(
          "Aucune tâche active.\n" +
            chalk.dim("Claim d'abord : ptf task claim <taskId>")
        );
        process.exit(1);
      }

      if (all.length === 1) {
        tracked = all[0];
      } else {
        // Multiple active tasks — let the user pick
        const { choice } = await inquirer.prompt<{ choice: string }>([
          {
            type: "list",
            name: "choice",
            message: "Quelle tâche soumettre ?",
            choices: all.map((t) => ({
              name: `${t.taskId} (${t.branch} — ${t.commits.length} commits)`,
              value: t.taskId,
            })),
          },
        ]);
        tracked = all.find((t) => t.taskId === choice)!;
      }
    }

    const taskId = tracked.taskId;
    const repoPath = tracked.repoPath;
    const branch = tracked.branch;

    // --- 2. Ensure we're on the right branch ---
    let currentBranch: string;
    try {
      currentBranch = execSync(gitCmd(repoPath, "rev-parse --abbrev-ref HEAD"), { encoding: "utf-8" }).trim();
    } catch {
      printError(`Impossible de lire la branche dans ${repoPath}`);
      process.exit(1);
    }

    if (currentBranch !== branch) {
      printInfo(`Switch vers ${chalk.cyan(branch)}...`);
      try {
        execSync(gitCmd(repoPath, `checkout ${shellEscape(branch)}`), { stdio: "pipe" });
      } catch {
        printError(
          `Impossible de switcher sur ${branch}.\n` +
            chalk.dim("Des changements non commités bloquent peut-être le switch.")
        );
        process.exit(1);
      }
    }

    // --- 3. Handle uncommitted changes ---
    const status = execSync(gitCmd(repoPath, "status --porcelain"), { encoding: "utf-8" }).trim();
    if (status) {
      printWarning("Changements non commités :");
      console.log(chalk.dim(status));

      const { action } = await inquirer.prompt<{ action: string }>([
        {
          type: "list",
          name: "action",
          message: "Que faire ?",
          choices: [
            { name: "Commiter et continuer", value: "commit" },
            { name: "Annuler la soumission", value: "cancel" },
          ],
        },
      ]);

      if (action === "cancel") {
        printInfo("Annulé.");
        return;
      }

      const SENSITIVE_PATTERNS = [".env", ".env.*", "*.key", "*.pem", "credentials*", ".ptf/secrets"];
      execSync(gitCmd(repoPath, "add -A"), { stdio: "pipe" });
      // Unstage sensitive files if accidentally staged
      for (const pattern of SENSITIVE_PATTERNS) {
        try {
          execSync(gitCmd(repoPath, `reset HEAD -- ${pattern}`), { stdio: "pipe" });
        } catch {
          // Pattern not matched — fine
        }
      }
      // Check if there's still something to commit after unstaging
      const remaining = execSync(gitCmd(repoPath, "diff --cached --stat"), { encoding: "utf-8" }).trim();
      if (!remaining) {
        printWarning("Aucun fichier à commiter après exclusion des fichiers sensibles.");
        return;
      }
      execSync(gitCmd(repoPath, `commit -m ${shellEscape(`[${taskId}] final changes`)}`), { stdio: "pipe" });
      printSuccess("Changements commités.");
    }

    // Resolve final commit
    const commitHash = options?.commit ??
      execSync(gitCmd(repoPath, "rev-parse HEAD"), { encoding: "utf-8" }).trim();

    // --- 4. Run verification steps ---
    const userConfig = loadUserConfig();
    const client = new PtfApiClient(userConfig);
    const { task } = await client.getTask(taskId);

    let allChecksPassed = true;

    if (task && task.verificationSteps.length > 0 && !options?.skipChecks) {
      console.log(chalk.bold("\n  Vérifications :\n"));

      for (const step of task.verificationSteps) {
        process.stdout.write(`  ○ ${step.type}: ${chalk.dim(step.command)}...`);
        try {
          const output = execSync(step.command, {
            cwd: repoPath,
            encoding: "utf-8",
            timeout: 120000,
          });

          let passed = true;
          if (step.expectedOutput && !output.includes(step.expectedOutput)) {
            passed = false;
          }
          if (step.threshold != null) {
            const coverageMatch = output.match(/(\d+(?:\.\d+)?)%/);
            if (coverageMatch && parseFloat(coverageMatch[1]) < step.threshold) {
              passed = false;
            }
          }

          addVerification(tracked.projectId, {
            step: step.type,
            command: step.command,
            passed,
            output: output.slice(0, 500),
            ranAt: new Date().toISOString(),
          });

          if (passed) {
            process.stdout.write(`\r  ${chalk.green("✓")} ${step.type}\n`);
          } else {
            process.stdout.write(`\r  ${chalk.red("✗")} ${step.type} — seuil non atteint\n`);
            allChecksPassed = false;
          }
        } catch (err) {
          const error = err as { stdout?: string; stderr?: string };
          const output = (error.stdout ?? "") + (error.stderr ?? "");
          addVerification(tracked.projectId, {
            step: step.type,
            command: step.command,
            passed: false,
            output: output.slice(0, 500),
            ranAt: new Date().toISOString(),
          });
          process.stdout.write(`\r  ${chalk.red("✗")} ${step.type}\n`);
          allChecksPassed = false;
        }
      }

      if (!allChecksPassed) {
        printWarning("Certaines vérifications ont échoué.");
        const { force } = await inquirer.prompt<{ force: boolean }>([
          {
            type: "confirm",
            name: "force",
            message: "Soumettre quand même ? (les checks seront re-run côté serveur)",
            default: false,
          },
        ]);
        if (!force) {
          printInfo("Corrigez et relancez ptf submit.");
          return;
        }
      }
    }

    // --- 5. Generate submission artifact ---
    const artifact = generateArtifact(tracked, task, commitHash, allChecksPassed);
    const artifactPath = join(repoPath, ".ptf", "submission.md");
    writeFileSync(artifactPath, artifact, "utf-8");

    // --- 6. Confirm, push, submit ---
    console.log(
      "\n" +
        chalk.bold("  Soumission :\n") +
        `    Tâche    : ${task?.title ?? taskId}\n` +
        `    Branche  : ${chalk.cyan(branch)}\n` +
        `    Commit   : ${chalk.dim(commitHash.slice(0, 12))}\n` +
        `    Commits  : ${tracked.commits.length}\n` +
        `    Checks   : ${allChecksPassed ? chalk.green("OK") : chalk.yellow("partiels")}\n`
    );

    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        message: "Confirmer la soumission ?",
        default: true,
      },
    ]);

    if (!confirm) {
      printInfo("Annulé.");
      return;
    }

    const { default: ora } = await import("ora");

    // Push
    const pushSpinner = ora("Push...").start();
    try {
      execSync(gitCmd(repoPath, `push -u origin ${shellEscape(branch)}`), { stdio: "pipe" });
      pushSpinner.succeed("Push OK.");
    } catch {
      pushSpinner.fail("Échec du push.");
      printError("Vérifiez votre accès au remote.");
      process.exit(1);
    }

    // Submit
    const submitSpinner = ora("Soumission...").start();
    const { result, offline } = await client.submitTask(taskId, branch, commitHash);
    submitSpinner.stop();

    if (offline) printOfflineBanner();

    untrackTask(tracked.projectId);

    printSuccess(
      `Soumission enregistrée !\n` +
        `  Job validation : ${chalk.dim(result.validationJobId)}\n` +
        `  Soumis à       : ${new Date(result.submittedAt).toLocaleString("fr-FR")}\n`
    );

    printInfo(
      "Pipeline :\n" +
        chalk.dim(
          "  1. Validation auto (tests, lint, contraintes)\n" +
            "  2. Peer review (3 Expert ≥ 2000 pts)\n" +
            "  3. Validation client (auto-approuvé après 72h)\n" +
            "  4. Reward libéré"
        )
    );
  });

function detectBaseBranch(repoPath: string): string {
  for (const candidate of ["main", "master", "develop"]) {
    try {
      execSync(gitCmd(repoPath, `rev-parse --verify origin/${candidate}`), { stdio: "pipe" });
      return candidate;
    } catch {
      // Branch doesn't exist
    }
  }
  return "main";
}

function generateArtifact(
  tracked: TrackedTask,
  task: { title?: string; objective?: string; deliverable?: string; verificationSteps?: { type: string; command: string }[] } | null,
  commitHash: string,
  allChecksPassed: boolean,
): string {
  const lines: string[] = [
    `# PTF Submission`,
    ``,
    `- **Task:** ${task?.title ?? tracked.taskId}`,
    `- **ID:** ${tracked.taskId}`,
    `- **Project:** ${tracked.projectId}`,
    `- **Branch:** ${tracked.branch}`,
    `- **Commit:** ${commitHash}`,
    `- **Date:** ${new Date().toISOString()}`,
    `- **Checks passed:** ${allChecksPassed ? "Yes" : "Partial"}`,
    ``,
    `## Commits (${tracked.commits.length})`,
  ];

  for (const c of tracked.commits) {
    lines.push(`- \`${c.hash.slice(0, 7)}\` ${c.message}`);
  }

  lines.push(``);
  lines.push(`## Verifications`);
  lines.push(`| Step | Passed |`);
  lines.push(`|------|--------|`);

  const lastByStep = new Map<string, boolean>();
  for (const v of tracked.verifications) {
    lastByStep.set(v.step, v.passed);
  }
  for (const [step, passed] of lastByStep) {
    lines.push(`| ${step} | ${passed ? "Yes" : "No"} |`);
  }

  try {
    const baseBranch = detectBaseBranch(tracked.repoPath);
    const diffStat = execSync(
      gitCmd(tracked.repoPath, `diff --stat origin/${baseBranch}...${shellEscape(tracked.branch)}`),
      { encoding: "utf-8" }
    ).trim();
    if (diffStat) {
      lines.push(``);
      lines.push(`## Diff`);
      lines.push("```");
      lines.push(diffStat);
      lines.push("```");
    }
  } catch {
    // Ignore
  }

  return lines.join("\n");
}
