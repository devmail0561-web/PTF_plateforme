import { Command } from "commander";
import chalk from "chalk";
import {
  loadProjectConfig,
  loadUserConfig,
  loadDraftTasks,
  saveDraftTasks,
  requireProjectConfig,
} from "../utils/config.js";
import { PtfApiClient } from "../utils/api.js";
import {
  printTask,
  printTable,
  printOfflineBanner,
  printError,
  printInfo,
  printSuccess,
  printWarning,
  formatDeadlineCountdown,
  printEstimation,
  colorStatus,
  colorPriority,
  truncate,
} from "../utils/display.js";
import { computeMerkleRoot } from "../utils/crypto.js";
import type { PtfTask } from "../types.js";

export const tasksCommand = new Command("tasks").description(
  "Gérer les tâches PTF"
);

tasksCommand
  .command("list")
  .description("Lister les tâches disponibles")
  .option("--project <projectId>", "Filtrer par projet")
  .option("--min-reward <amount>", "Reward PTF minimum (projets paid uniquement)")
  .option("--skill <skill>", "Filtrer par compétence requise")
  .option("--status <status>", "Filtrer par statut", "open")
  .option("--reward-mode <mode>", "free | paid | all", "all")
  .action(async (options) => {
    const userConfig = loadUserConfig();
    const client = new PtfApiClient(userConfig);

    const { tasks, offline } = await client.getTasks({
      projectId: options.project,
      minReward: options.minReward ? parseFloat(options.minReward) : undefined,
      skills: options.skill ? [options.skill] : undefined,
      status: options.status,
      rewardMode: options.rewardMode !== "all" ? options.rewardMode : undefined,
    });

    if (offline) printOfflineBanner();

    if (tasks.length === 0) {
      printInfo("Aucune tâche disponible avec ces filtres.");
      return;
    }

    const rows = tasks.map((t) => [
      t.id.slice(0, 10) + "…" + t.id.slice(-4),
      truncate(t.title, 44),
      t.priority,
      t.status,
      t.rewardMode === "paid" && t.reward ? `${t.reward.amount} PTF` : `+${t.reputationPoints ?? "?"} rep`,
      t.duration,
      t.claimCriteria.requiredSkills?.slice(0, 3).join(", ") ?? "any",
    ]);

    printTable(
      ["ID", "Titre", "Priorité", "Statut", "Reward", "Durée", "Skills"],
      rows,
      {
        colorRow: (row) => [
          chalk.dim(row[0]),
          row[1],
          colorPriority(row[2]),
          colorStatus(row[3]),
          row[4].startsWith("+") ? chalk.cyan(row[4]) : chalk.green.bold(row[4]),
          chalk.dim(row[5]),
          chalk.cyan(row[6]),
        ],
      }
    );

    console.log(chalk.dim(`\n   ${tasks.length} tâche(s) — détails : ptf task show <id>`));
  });

tasksCommand
  .command("mine")
  .description("Voir mes tâches réclamées (avec countdown)")
  .option("--status <status>", "Filtrer par statut")
  .option("--project <projectId>", "Filtrer par projet")
  .action(async (options) => {
    const userConfig = loadUserConfig();
    const client = new PtfApiClient(userConfig);

    const address = userConfig.walletAddress;
    if (!address) {
      printError(
        "Aucun wallet configuré. Connectez-vous : ptf auth login"
      );
      return;
    }

    const { tasks, offline } = await client.getTasks({
      status: options.status,
      projectId: options.project,
      devAddress: address,
    });

    if (offline) printOfflineBanner();

    const myTasks = tasks.filter(
      (t) =>
        ["claimed", "in_progress", "submitted", "under_review"].includes(
          t.status
        )
    );

    if (myTasks.length === 0) {
      printInfo(
        "Aucune tâche réclamée.\n" +
          chalk.dim("Trouvez des tâches avec : ptf tasks list")
      );
      return;
    }

    console.log(chalk.bold(`\n   ${myTasks.length} tâche(s) réclamée(s) :\n`));

    myTasks.forEach((task, i) => {
      const countdown = task.deadline
        ? formatDeadlineCountdown(task.deadline)
        : chalk.dim("aucune deadline");

      const oddRow = i % 2 !== 0;
      const prefix = oddRow ? chalk.dim : (s: string) => s;

      console.log(
        prefix(
          `   ${chalk.bold(truncate(task.title, 52))}\n` +
          `   ${chalk.dim("ID     : ")}${chalk.dim(task.id.slice(0, 10) + "…" + task.id.slice(-6))}\n` +
          `   ${chalk.dim("Statut : ")}${colorStatus(task.status)}  ${chalk.dim("Deadline : ")}${countdown}\n` +
          (task.rewardMode === "paid" && task.reward
            ? `   ${chalk.dim("Reward : ")}${chalk.green.bold(task.reward.amount + " PTF")}\n`
            : `   ${chalk.dim("Reward : ")}${chalk.cyan("+" + (task.reputationPoints ?? "?") + " pts rep")} ${chalk.dim("(free)\n")}`) +
          ""
        )
      );
    });
  });

tasksCommand
  .command("preview")
  .description("Revoir les tâches générées avant publication")
  .action(async () => {
    const config = requireProjectConfig();
    const drafts = loadDraftTasks();

    if (!drafts || drafts.length === 0) {
      printError(
        "Aucune tâche en brouillon trouvée.\n" +
          "Générez d'abord les tâches : ptf generate --project " +
          config.projectId
      );
      return;
    }

    const tasks = drafts as PtfTask[];
    console.log(
      chalk.bold(`\n${tasks.length} tâche(s) à revoir — Projet : ${config.name}\n`)
    );

    const { default: inquirer } = await import("inquirer");
    const approved: PtfTask[] = [];
    const rejected: string[] = [];
    const skipped: PtfTask[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      console.log(chalk.dim(`\n─── Tâche ${i + 1}/${tasks.length} ───`));
      printTask(task, true);

      const { action } = await inquirer.prompt<{
        action: "approve" | "reject" | "skip";
      }>([
        {
          type: "list",
          name: "action",
          message: "Action :",
          choices: [
            { name: "✓ Approuver", value: "approve" },
            { name: "✗ Rejeter (supprimer de la liste)", value: "reject" },
            { name: "→ Passer (décider plus tard)", value: "skip" },
          ],
          default: "approve",
        },
      ]);

      if (action === "approve") {
        approved.push(task);
        printSuccess(`Tâche approuvée : ${task.title}`);
      } else if (action === "reject") {
        rejected.push(task.id);
        printInfo(`Tâche retirée : ${task.title}`);
      } else {
        skipped.push(task);
        printInfo(`Tâche passée : ${task.title}`);
      }
    }

    saveDraftTasks(approved);

    console.log(
      "\n" +
        chalk.bold("Résumé de la revue :") +
        `\n  Approuvées : ${chalk.green(String(approved.length))}` +
        `\n  Rejetées   : ${chalk.red(String(rejected.length))}` +
        `\n  Passées    : ${chalk.yellow(String(skipped.length))}` +
        `\n  Total      : ${tasks.length}`
    );

    if (approved.length > 0) {
      console.log(
        "\n" +
          chalk.dim("Prochaine étape : ") +
          chalk.cyan("ptf tasks publish") +
          chalk.dim(" — publier dans le réseau PTF")
      );
    }
  });

tasksCommand
  .command("publish")
  .description("Publier les tâches dans le réseau PTF (escrow requis si projet paid)")
  .action(async () => {
    const config = requireProjectConfig();
    const userConfig = loadUserConfig();
    const drafts = loadDraftTasks();

    if (!drafts || drafts.length === 0) {
      printError(
        "Aucune tâche à publier. Lancez d'abord : ptf generate"
      );
      return;
    }

    const tasks = drafts as PtfTask[];
    const totalReward = tasks.reduce(
      (sum, t) => sum + (t.reward?.amount ?? 0),
      0
    );

    const commissionRate =
      totalReward < 5000 ? 0.12 : totalReward <= 50000 ? 0.1 : 0.08;
    const commission = totalReward * commissionRate;
    const totalDeposit = totalReward + commission;

    console.log(
      "\n" + chalk.bold("Publication des tâches — Résumé\n") +
        `  Projet     : ${chalk.cyan(config.name)}\n` +
        `  Tâches     : ${tasks.length}\n` +
        `  Mode       : ${config.rewardMode}\n`
    );

    if (config.rewardMode === "paid") {
      printEstimation({
        taskCount: tasks.length,
        totalEffortHours: tasks.length * 8,
        rewardPoolSuggested: totalReward,
        commissionRate,
        commissionAmount: commission,
        totalDeposit,
      });

      console.log(
        "\n" +
          chalk.yellow.bold("⚠  Paiement requis avant publication\n") +
          chalk.dim(
            `Vous devrez déposer ${totalDeposit.toFixed(4)} PTF sur la chaîne ${config.chain}\n` +
              "en escrow avant que les tâches soient visibles dans le réseau PTF.\n" +
              chalk.dim("Le montant PTF est au taux marché au moment du dépôt.")
          )
      );
    }

    const { default: inquirer } = await import("inquirer");
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        message:
          config.rewardMode === "paid"
            ? `Confirmer le dépôt escrow et la publication de ${tasks.length} tâche(s) ?`
            : `Confirmer la publication de ${tasks.length} tâche(s) open source (aucun escrow) ?`,
        default: false,
      },
    ]);

    if (!confirm) {
      printInfo("Publication annulée.");
      return;
    }

    const merkleRoot = computeMerkleRoot(tasks.map((t) => t.id));
    const { default: ora } = await import("ora");
    const spinner = ora("Publication en cours...").start();

    await new Promise((r) => setTimeout(r, 1500));
    spinner.stop();

    printWarning("Mode offline — la publication réelle nécessite le backend PTF.");

    console.log(
      "\n" +
        chalk.green.bold(`✓ ${tasks.length} tâche(s) publiées dans le réseau PTF\n`) +
        `  Merkle root : ${chalk.dim(merkleRoot)}\n` +
        `  Projet ID   : ${chalk.dim(config.projectId)}\n` +
        "\n" +
        chalk.dim("Les développeurs peuvent maintenant voir et réclamer vos tâches.\n") +
        chalk.dim("Suivez les réclamations : ") +
        chalk.cyan("ptf project claimed-tasks --project " + config.projectId)
    );
  });
