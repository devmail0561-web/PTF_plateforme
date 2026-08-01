import { Command } from "commander";
import { execSync } from "child_process";
import chalk from "chalk";
import { loadUserConfig } from "../utils/config.js";
import { PtfApiClient } from "../utils/api.js";
import { resolveTaskFromCwd, getAllTrackedTasks } from "../utils/tracker.js";
import { gitCmd, shellEscape } from "../utils/shell.js";
import { printError, printInfo, formatDeadlineCountdown } from "../utils/display.js";

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

      console.log(chalk.bold("\n  Tâches actives :\n"));
      for (const t of all) {
        console.log(
          `  ${chalk.cyan(t.taskId)}\n` +
            `    Branche  : ${t.branch}\n` +
            `    Repo     : ${chalk.dim(t.repoPath)}\n` +
            `    Commits  : ${t.commits.length}\n` +
            `    Claimée  : ${new Date(t.claimedAt).toLocaleDateString("fr-FR")}\n`
        );
      }
      return;
    }

    // --- Detailed status for current task ---
    const userConfig = loadUserConfig();
    const client = new PtfApiClient(userConfig);
    const { task } = await client.getTask(tracked.taskId);

    console.log(
      "\n" +
        chalk.bold.cyan("━━━ PTF Task Status ━━━") +
        "\n\n" +
        `  ${chalk.bold("Tâche")}       : ${task?.title ?? tracked.taskId}\n` +
        `  ${chalk.bold("ID")}          : ${chalk.dim(tracked.taskId)}\n` +
        `  ${chalk.bold("Branche")}     : ${chalk.cyan(tracked.branch)}\n` +
        `  ${chalk.bold("Repo")}        : ${chalk.dim(tracked.repoPath)}\n`
    );

    // Deadline
    if (task?.deadline) {
      console.log(`  ${chalk.bold("Deadline")}    : ${formatDeadlineCountdown(task.deadline)}`);
    }

    // Commits
    console.log(`\n  ${chalk.bold("Commits")} (${tracked.commits.length}) :`);
    if (tracked.commits.length === 0) {
      console.log(chalk.dim("    Aucun commit — utilisez ptf commit pour commiter."));
    } else {
      const recent = tracked.commits.slice(-5);
      for (const c of recent) {
        console.log(
          `    ${chalk.dim(c.hash.slice(0, 7))} ${c.message} ${chalk.dim("(" + c.filesChanged + " files)")}`
        );
      }
      if (tracked.commits.length > 5) {
        console.log(chalk.dim(`    ... et ${tracked.commits.length - 5} de plus`));
      }
    }

    // Verifications
    if (task && task.verificationSteps.length > 0) {
      console.log(`\n  ${chalk.bold("Vérifications")} :`);
      for (const step of task.verificationSteps) {
        const lastRun = tracked.verifications
          .filter((v) => v.step === step.type)
          .pop();

        if (!lastRun) {
          console.log(`    ${chalk.dim("○")} ${step.type} — ${chalk.dim("pas encore exécuté")}`);
        } else if (lastRun.passed) {
          console.log(`    ${chalk.green("✓")} ${step.type} — ${chalk.dim(lastRun.ranAt)}`);
        } else {
          console.log(`    ${chalk.red("✗")} ${step.type} — ${chalk.red("échoué")} ${chalk.dim(lastRun.ranAt)}`);
        }
      }
    }

    // Diff stats (compare task branch vs base)
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
        console.log(`\n  ${chalk.bold("Diff")} :`);
        console.log(chalk.dim("    " + diffStat.split("\n").pop()));
      }
    } catch {
      // Ignore
    }

    // Push status
    console.log(
      `\n  ${chalk.bold("Push")}        : ${tracked.pushed ? chalk.green("oui") : chalk.yellow("non poussé")}`
    );

    // Next step hint
    console.log(
      "\n" +
        chalk.dim("  Prochaine étape : ") +
        (tracked.commits.length === 0
          ? chalk.cyan("ptf commit -am \"votre message\"")
          : chalk.cyan("ptf submit"))
    );
  });
