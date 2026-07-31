import { Command } from "commander";
import chalk from "chalk";
import { loadUserConfig } from "../utils/config.js";
import { PtfApiClient } from "../utils/api.js";
import {
  printTask,
  printError,
  printInfo,
  printSuccess,
  printWarning,
  printOfflineBanner,
  formatDeadlineCountdown,
} from "../utils/display.js";
import { hashConditions, isValidAddress } from "../utils/crypto.js";

export const taskCommand = new Command("task").description(
  "Opérations sur une tâche spécifique"
);

taskCommand
  .command("show <taskId>")
  .description("Afficher le détail d'une tâche (conditions, pénalités, reward)")
  .action(async (taskId: string) => {
    const userConfig = loadUserConfig();
    const client = new PtfApiClient(userConfig);

    const { task, offline } = await client.getTask(taskId);
    if (offline) printOfflineBanner();

    if (!task) {
      printError(`Tâche non trouvée : ${taskId}`);
      process.exit(1);
    }

    if (task.reward && task.reward.amount > 0) {
      const ptfBalance = 0;
      if (ptfBalance < 10) {
        printError(
          `Solde PTF insuffisant (${ptfBalance} PTF). Minimum 10 PTF requis pour réclamer une tâche paid.\n` +
            chalk.dim("Rechargez votre compte : ptf wallet deposit")
        );
      }
    }

    printTask(task, true);
  });

taskCommand
  .command("claim <taskId>")
  .description("Réclamer une tâche (vérification wallet + conditions + confirmation)")
  .action(async (taskId: string) => {
    const userConfig = loadUserConfig();
    const client = new PtfApiClient(userConfig);

    const { task, offline } = await client.getTask(taskId);
    if (offline) printOfflineBanner();

    if (!task) {
      printError(`Tâche non trouvée : ${taskId}`);
      process.exit(1);
    }

    if (task.status !== "open") {
      printError(
        `Cette tâche n'est pas disponible (statut : ${task.status}).\n` +
          chalk.dim("Cherchez d'autres tâches : ptf tasks list")
      );
      process.exit(1);
    }

    const walletAddress =
      userConfig.walletAddress ?? "0x0000000000000000000000000000000000000000";

    if (!userConfig.walletAddress) {
      printWarning(
        "Aucun wallet configuré. Mode offline — claim simulé.\n" +
          chalk.dim("Configurez votre wallet : ptf config set-wallet <address>")
      );
    }

    if (task.reward && task.reward.amount > 0) {
      const { status } = await client.getWalletStatus(walletAddress);
      if (status.ptfBalance < 10) {
        printError(
          `Solde PTF insuffisant : ${status.ptfBalance} PTF (minimum 10 PTF requis pour les projets paid).\n` +
            chalk.dim("Rechargez : ptf wallet deposit --chain polygon --amount 10 --token USDC")
        );
        process.exit(1);
      }
    }

    const walletValid = !userConfig.walletAddress || isValidAddress(walletAddress);
    if (!walletValid) {
      printError(`Adresse wallet invalide : ${walletAddress}`);
      process.exit(1);
    }

    const { default: inquirer } = await import("inquirer");

    const deadline = new Date(Date.now() + parseDuration(task.duration)).toISOString();

    const isPaid = task.reward && task.reward.amount > 0;
    const projectMode = isPaid ? "Projet rémunéré" : "Projet public (non-rémunéré)";

    console.log(
      "\n" +
        chalk.bold(`Conditions de la tâche [${taskId.slice(0, 12)}...] — ${projectMode} :\n`) +
        `  - Durée     : ${task.duration} (deadline : ${new Date(deadline).toLocaleDateString("fr-FR")})\n` +
        (isPaid
          ? `  - Reward    : ${chalk.green.bold(task.reward!.amount + " " + task.reward!.token)} (libéré à validation)\n` +
            `  - Garantie  : 10 PTF soft-locked pendant la tâche\n`
          : `  - Reward    : ${chalk.dim("aucun (contribution open source)")}\n`) +
        `  - Pénalités :\n` +
        `      Retard          : -${isPaid ? task.punishments.lateDelivery.credits + " crédits / " : ""}${task.punishments.lateDelivery.reputation} pts réputation\n` +
        `      Bug critique    : -${isPaid ? task.punishments.criticalBug.credits + " crédits / " : ""}${task.punishments.criticalBug.reputation} pts réputation\n` +
        `      Bug mineur      : -${isPaid ? task.punishments.nonCriticalBug.credits + " crédits / " : ""}${task.punishments.nonCriticalBug.reputation} pts réputation\n` +
        `      Code malveillant: -${isPaid ? task.punishments.maliciousCode.credits + " crédits / " : ""}${task.punishments.maliciousCode.reputation} pts réputation\n` +
        `  - Langues requises  : ${task.constraints.languages.join(", ")}\n` +
        `  - Tests requis      : couverture > ${task.constraints.minTestCoverage}%\n`
    );

    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        message: "Acceptez-vous ces conditions ?",
        default: false,
      },
    ]);

    if (!confirm) {
      printInfo("Claim annulé.");
      return;
    }

    const conditionsHash = hashConditions({
      taskId,
      duration: task.duration,
      reward: task.reward ?? null,
      punishments: task.punishments,
      constraints: task.constraints,
      verificationSteps: task.verificationSteps,
    });

    const { default: ora } = await import("ora");
    const spinner = ora("Signature EIP-712 et enregistrement on-chain...").start();

    const { result } = await client.claimTask(taskId, walletAddress);
    await new Promise((r) => setTimeout(r, 800));
    spinner.stop();

    printSuccess(`Tâche réclamée avec succès !\n`);
    console.log(
      `  Tâche ID      : ${chalk.dim(result.taskId)}\n` +
        `  Réclamé à     : ${new Date(result.claimedAt).toLocaleString("fr-FR")}\n` +
        `  Deadline      : ${formatDeadlineCountdown(result.deadline)}\n` +
        `  Conditions    : ${chalk.dim(conditionsHash.slice(0, 16) + "...")} (ancré on-chain)\n`
    );

    console.log(
      chalk.dim("\nVos tâches actives : ") +
        chalk.cyan("ptf tasks mine") +
        "\n" +
        chalk.dim("Soumettre quand terminé : ") +
        chalk.cyan(`ptf submit ${taskId} --branch feat/impl`)
    );
  });

taskCommand
  .command("cancel <taskId>")
  .description("Abandonner une tâche réclamée")
  .action(async (taskId: string) => {
    const userConfig = loadUserConfig();
    const client = new PtfApiClient(userConfig);

    const { task, offline } = await client.getTask(taskId);
    if (offline) printOfflineBanner();

    if (!task) {
      printError(`Tâche non trouvée : ${taskId}`);
      process.exit(1);
    }

    if (!["claimed", "in_progress"].includes(task.status)) {
      printError(
        `Impossible d'annuler une tâche au statut : ${task.status}`
      );
      process.exit(1);
    }

    let penaltyWarning = "";
    if (task.claimedAt && task.deadline) {
      const elapsed =
        Date.now() - new Date(task.claimedAt).getTime();
      const total =
        new Date(task.deadline).getTime() -
        new Date(task.claimedAt).getTime();
      const percentElapsed = (elapsed / total) * 100;

      if (percentElapsed > 50) {
        const isPaid = task.reward && task.reward.amount > 0;
        penaltyWarning =
          chalk.yellow(
            `\n⚠  Attention : ${percentElapsed.toFixed(0)}% de la durée est écoulée (> 50%).\n` +
              `   Pénalité lateDelivery appliquée : ` +
              (isPaid
                ? `-${task.punishments.lateDelivery.credits} crédits / `
                : "") +
              `-${task.punishments.lateDelivery.reputation} pts réputation\n`
          );
      }
    }

    console.log(
      `\nTâche à annuler : ${chalk.bold(task.title)}${penaltyWarning}`
    );

    const { default: inquirer } = await import("inquirer");
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        message: "Confirmer l'abandon de cette tâche ?",
        default: false,
      },
    ]);

    if (!confirm) {
      printInfo("Annulation avortée.");
      return;
    }

    printSuccess(`Tâche ${taskId.slice(0, 12)}... abandonnée.`);
    if (task.reward) {
      printInfo(
        "Le soft-lock de 10 PTF a été libéré — vos crédits sont à nouveau disponibles."
      );
    }
  });

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([dhm])$/);
  if (!match) return 30 * 86400000;
  const value = parseInt(match[1]);
  switch (match[2]) {
    case "d":
      return value * 86400000;
    case "h":
      return value * 3600000;
    case "m":
      return value * 60000;
    default:
      return 30 * 86400000;
  }
}
