import { Command } from "commander";
import { execSync } from "child_process";
import chalk from "chalk";
import { loadUserConfig } from "../utils/config.js";
import { PtfApiClient } from "../utils/api.js";
import { resolveTaskFromCwd, getAllTrackedTasks } from "../utils/tracker.js";
import { gitCmd, shellEscape } from "../utils/shell.js";
import { printError, printInfo, formatDeadlineCountdown, printSectionHeader, colorStatus, truncate } from "../utils/display.js";

export const statusCommand = new Command("status")
  .description("Afficher l'état de la tâche active (progression, deadline, checks)")
  .action(async () => {
    const tracked = resolveTaskFromCwd();

    if (!tracked) {
      // Show all tracked tasks globally
      const all = getAllTrackedTasks();
      if (all.length === 0) {
        printInfo("Aucune tâche active. Claim une tâche : ptf task claim <taskId>");
        return;
      }

      printSectionHeader(`${all.length} tâche(s) active(s)`);
      for (const t of all) {
        console.log(
          `   ${chalk.cyan("▶")} ${chalk.bold(t.taskId.slice(0, 10) + "…" + t.taskId.slice(-6))}\n` +
          `     ${chalk.dim("Branche  :")} ${chalk.cyan(t.branch)}\n` +
          `     ${chalk.dim("Commits  :")} ${chalk.bold(String(t.commits.length))}\n` +
          `     ${chalk.dim("Claimée  :")} ${new Date(t.claimedAt).toLocaleDateString("fr-FR")}\n` +
          `     ${chalk.dim("Repo     :")} ${chalk.dim(t.repoPath)}\n`
        );
      }
      return;
    }

    // --- Detailed status for current task ---
    const userConfig = loadUserConfig();
    const client = new PtfApiClient(userConfig);
    const { task } = await client.getTask(tracked.taskId);

    printSectionHeader("PTF Task Status");
    console.log(
      `   ${chalk.dim("Tâche   :")} ${chalk.bold(truncate(task?.title ?? tracked.taskId, 52))}\n` +
      `   ${chalk.dim("ID      :")} ${chalk.dim(tracked.taskId)}\n` +
      `   ${chalk.dim("Statut  :")} ${task ? colorStatus(task.status) : chalk.dim("inconnu")}\n` +
      `   ${chalk.dim("Branche :")} ${chalk.cyan(tracked.branch)}\n` +
      `   ${chalk.dim("Repo    :")} ${chalk.dim(tracked.repoPath)}`
    );

    // Deadline
    if (task?.deadline) {
      console.log(`  ${chalk.bold("Deadline")}    : ${formatDeadlineCountdown(task.deadline)}`);
    }

    // Commits
    console.log(`\n   ${chalk.bold("Commits")} ${chalk.dim("(" + tracked.commits.length + ")")}`);
    if (tracked.commits.length === 0) {
      console.log(chalk.dim("     ○  Aucun commit — ") + chalk.cyan("ptf commit -am \"message\""));
    } else {
      const recent = tracked.commits.slice(-7);
      for (const c of recent) {
        console.log(
          `     ${chalk.dim(c.hash.slice(0, 7))}  ${truncate(c.message, 52)}  ${chalk.dim("(" + c.filesChanged + " files)")}`
        );
      }
      if (tracked.commits.length > 7) {
        console.log(chalk.dim(`     … et ${tracked.commits.length - 7} commit(s) plus anciens`));
      }
    }

    // Verifications
    if (task && task.verificationSteps.length > 0) {
      console.log(`\n   ${chalk.bold("Vérifications")}`);
      for (const step of task.verificationSteps) {
        const lastRun = tracked.verifications.filter((v) => v.step === step.type).pop();
        if (!lastRun) {
          console.log(`     ${chalk.dim("○")}  ${chalk.dim(step.type + " — pas encore exécuté")}`);
        } else if (lastRun.passed) {
          console.log(`     ${chalk.green("✓")}  ${step.type}  ${chalk.dim(lastRun.ranAt)}`);
        } else {
          console.log(`     ${chalk.red("✗")}  ${step.type}  ${chalk.red("échoué")}  ${chalk.dim(lastRun.ranAt)}`);
        }
      }
    }

    // Diff stats
    try {
      let baseBranch = "main";
      for (const candidate of ["main", "master", "develop"]) {
        try {
          execSync(gitCmd(tracked.repoPath, `rev-parse --verify origin/${candidate}`), { stdio: "pipe" });
          baseBranch = candidate;
          break;
        } catch { /* try next */ }
      }
      const diffStat = execSync(
        gitCmd(tracked.repoPath, `diff --stat origin/${baseBranch}...${shellEscape(tracked.branch)}`),
        { encoding: "utf-8" }
      ).trim();
      if (diffStat) {
        console.log(`\n   ${chalk.bold("Diff vs " + baseBranch)}`);
        const summary = diffStat.split("\n").pop() ?? "";
        console.log("     " + chalk.dim(summary));
      }
    } catch { /* Ignore */ }

    // Push + next step
    console.log(
      `\n   ${chalk.dim("Push     : ")}` +
      (tracked.pushed ? chalk.green("✓ poussé") : chalk.yellow("⚠ non poussé"))
    );
    console.log(
      `\n   ${chalk.dim("Prochaine étape → ")}` +
      (tracked.commits.length === 0
        ? chalk.cyan("ptf commit -am \"message\"")
        : chalk.cyan("ptf submit"))
    );
  });
