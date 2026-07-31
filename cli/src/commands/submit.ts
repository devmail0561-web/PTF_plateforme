import { Command } from "commander";
import { execSync } from "child_process";
import chalk from "chalk";
import { loadUserConfig } from "../utils/config.js";
import { PtfApiClient } from "../utils/api.js";
import { printError, printInfo, printSuccess, printWarning, printOfflineBanner } from "../utils/display.js";

export const submitCommand = new Command("submit")
  .description("Soumettre une tâche terminée")
  .argument("<taskId>", "ID de la tâche à soumettre")
  .requiredOption("--branch <branch>", "Branche Git contenant l'implémentation")
  .option("--commit <hash>", "Hash de commit (détecté automatiquement si absent)")
  .action(async (taskId: string, options: { branch: string; commit?: string }) => {
    const userConfig = loadUserConfig();

    const protectedBranches = ["main", "master", "develop", "prod"];
    if (protectedBranches.includes(options.branch)) {
      printError(
        `Impossible de soumettre depuis la branche ${options.branch}.\n` +
          chalk.dim(
            "Créez une branche feature : git checkout -b feat/" + taskId.slice(0, 8)
          )
      );
      process.exit(1);
    }

    let commitHash = options.commit;
    if (!commitHash) {
      try {
        commitHash = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
      } catch {
        printWarning(
          "Impossible de détecter le commit Git automatiquement.\n" +
            "Passez le hash manuellement : --commit <hash>"
        );
        commitHash = "0x" + "0".repeat(40);
      }
    }

    console.log(
      "\n" +
        chalk.bold("Soumission de tâche\n") +
        `  Tâche ID  : ${chalk.dim(taskId)}\n` +
        `  Branche   : ${chalk.cyan(options.branch)}\n` +
        `  Commit    : ${chalk.dim(commitHash.slice(0, 16) + "...")}\n`
    );

    const { default: inquirer } = await import("inquirer");
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        message: "Confirmer la soumission ?",
        default: true,
      },
    ]);

    if (!confirm) {
      printInfo("Soumission annulée.");
      return;
    }

    const client = new PtfApiClient(userConfig);
    const { default: ora } = await import("ora");
    const spinner = ora("Soumission en cours...").start();

    const { result, offline } = await client.submitTask(
      taskId,
      options.branch,
      commitHash
    );

    await new Promise((r) => setTimeout(r, 1000));
    spinner.stop();

    if (offline) printOfflineBanner();

    printSuccess(
      `Soumission enregistrée.\n` +
        `  Hash commit     : ${chalk.dim(result.commitHash.slice(0, 16) + "...")}\n` +
        `  Job validation  : ${chalk.dim(result.validationJobId)}\n` +
        `  Soumis à        : ${new Date(result.submittedAt).toLocaleString("fr-FR")}\n`
    );

    printInfo(
      "La validation automatique est en cours (tests, lint, contraintes).\n" +
        chalk.dim(
          "Ensuite : peer review (3 reviewers Expert ≥ 2000 pts) → validation client (timeout 72h auto-approbation)"
        )
    );
  });
