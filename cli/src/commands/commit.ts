import { Command } from "commander";
import { execSync } from "child_process";
import chalk from "chalk";
import { loadUserConfig } from "../utils/config.js";
import { resolveTaskFromCwd, addCommit, addVerification, type TrackedTask } from "../utils/tracker.js";
import { gitCmd, shellEscape } from "../utils/shell.js";
import { printError, printInfo, printSuccess, printWarning } from "../utils/display.js";
import { PtfApiClient } from "../utils/api.js";

export const commitCommand = new Command("commit")
  .description("Commiter les changements liés à la tâche active (wrapper git + tracking PTF)")
  .option("-m, --message <msg>", "Message de commit")
  .option("-a, --all", "Stage tous les fichiers modifiés (git add -A)")
  .option("--no-check", "Skip la vérification rapide pré-commit")
  .action(async (options: { message?: string; all?: boolean; check?: boolean }) => {
    const tracked = resolveTaskFromCwd();

    if (!tracked) {
      printError(
        "Aucune tâche active détectée.\n" +
          chalk.dim(
            "Vous devez être sur une branche ptf/<taskId> ou dans un repo avec une tâche claimée.\n" +
              "Claim une tâche : ptf task claim <taskId>"
          )
      );
      return;
    }

    const repoPath = tracked.repoPath;

    // Verify we're on the right branch
    const currentBranch = execSync(gitCmd(repoPath, "rev-parse --abbrev-ref HEAD"), { encoding: "utf-8" }).trim();
    if (currentBranch !== tracked.branch) {
      printError(
        `Vous êtes sur ${chalk.cyan(currentBranch)} mais la tâche est sur ${chalk.cyan(tracked.branch)}.\n` +
          chalk.dim(`Switch : git checkout ${tracked.branch}`)
      );
      return;
    }

    // Stage files
    if (options.all) {
      const SENSITIVE_PATTERNS = [".env", ".env.*", "*.key", "*.pem", "credentials*", ".ptf/secrets"];
      execSync(gitCmd(repoPath, "add -A"), { stdio: "pipe" });
      for (const pattern of SENSITIVE_PATTERNS) {
        try {
          execSync(gitCmd(repoPath, `reset HEAD -- ${pattern}`), { stdio: "pipe" });
        } catch {
          // Pattern not matched
        }
      }
    }

    // Check there's something to commit
    const staged = execSync(gitCmd(repoPath, "diff --cached --stat"), { encoding: "utf-8" }).trim();
    if (!staged) {
      const unstaged = execSync(gitCmd(repoPath, "status --porcelain"), { encoding: "utf-8" }).trim();
      if (unstaged) {
        printWarning("Rien en staging. Fichiers non-staged détectés :");
        console.log(chalk.dim(unstaged));
        printInfo("Utilisez --all pour tout stager, ou git add manuellement.");
      } else {
        printInfo("Rien à commiter — working tree clean.");
      }
      return;
    }

    // Get commit message
    let message = options.message;
    if (!message) {
      const { default: inquirer } = await import("inquirer");
      const { msg } = await inquirer.prompt<{ msg: string }>([
        {
          type: "input",
          name: "msg",
          message: `Commit message [${tracked.taskId}]:`,
          validate: (v: string) => v.trim().length > 0 || "Le message ne peut pas être vide",
        },
      ]);
      message = msg;
    }

    const fullMessage = `[${tracked.taskId}] ${message}`;

    // Quick pre-commit check (unless --no-check)
    if (options.check !== false) {
      await runQuickChecks(tracked, repoPath);
    }

    // shellEscape (single-quotes) instead of JSON.stringify (double-quotes) to
    // prevent backtick / $() shell injection from user-supplied commit messages.
    try {
      execSync(gitCmd(repoPath, `commit -m ${shellEscape(fullMessage)}`), { stdio: "pipe" });
    } catch (err) {
      const error = err as { stderr?: Buffer };
      printError("Commit échoué.");
      if (error.stderr) {
        console.log(chalk.dim(error.stderr.toString()));
      }
      return;
    }

    // Track the commit
    const hash = execSync(gitCmd(repoPath, "rev-parse HEAD"), { encoding: "utf-8" }).trim();
    // The last line of git diff --stat is a summary ("N files changed…") — exclude it.
    const filesChanged = staged.split("\n").filter((l, i, arr) => l && i < arr.length - 1).length;

    addCommit(tracked.projectId, {
      hash,
      message: fullMessage,
      timestamp: new Date().toISOString(),
      filesChanged,
    });

    printSuccess(`Commit ${chalk.dim(hash.slice(0, 8))} enregistré et lié à ${chalk.cyan(tracked.taskId)}`);

    const totalCommits = tracked.commits.length + 1;
    console.log(
      chalk.dim(`  ${totalCommits} commit(s) sur cette tâche | branche: ${tracked.branch}`)
    );
  });

async function runQuickChecks(tracked: TrackedTask, repoPath: string): Promise<void> {
  const userConfig = loadUserConfig();
  const client = new PtfApiClient(userConfig);
  const { task } = await client.getTask(tracked.taskId);

  if (!task || task.verificationSteps.length === 0) return;

  const quickSteps = task.verificationSteps.filter(
    (s) => s.type === "type_check" || s.type === "lint"
  );

  if (quickSteps.length === 0) return;

  console.log(chalk.dim("  Pre-commit checks..."));

  for (const step of quickSteps) {
    try {
      execSync(step.command, { cwd: repoPath, stdio: "pipe", timeout: 30000 });
      addVerification(tracked.projectId, {
        step: step.type,
        command: step.command,
        passed: true,
        output: "",
        ranAt: new Date().toISOString(),
      });
      console.log(chalk.green("  ✓ ") + chalk.dim(step.type));
    } catch (err) {
      const error = err as { stdout?: Buffer; stderr?: Buffer };
      const output = (error.stdout?.toString() ?? "") + (error.stderr?.toString() ?? "");
      addVerification(tracked.projectId, {
        step: step.type,
        command: step.command,
        passed: false,
        output: output.slice(0, 500),
        ranAt: new Date().toISOString(),
      });
      printWarning(`${step.type} failed — commit quand même enregistré`);
      console.log(chalk.dim("  " + output.split("\n").slice(0, 5).join("\n  ")));
    }
  }
}
