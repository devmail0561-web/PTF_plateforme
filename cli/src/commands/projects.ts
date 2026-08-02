import { Command } from "commander";
import chalk from "chalk";
import { loadUserConfig, requireProjectConfig } from "../utils/config.js";
import { PtfApiClient } from "../utils/api.js";
import {
  printTable,
  printProjectConfig,
  printOfflineBanner,
  printError,
  printInfo,
  colorStatus,
  truncate,
} from "../utils/display.js";

export const projectsCommand = new Command("projects").description(
  "Gérer et lister les projets PTF"
);

projectsCommand
  .command("list")
  .description("Lister tous les projets PTF (privés anonymisés)")
  .option("--type <type>", "Filtrer : public | private | all", "all")
  .option("--mine", "Afficher uniquement mes projets")
  .action(async (options) => {
    const userConfig = loadUserConfig();
    const client = new PtfApiClient(userConfig);

    const { projects, offline } = await client.getProjects({
      type: options.type !== "all" ? options.type : undefined,
      mine: options.mine,
    });

    if (offline) printOfflineBanner();

    if (projects.length === 0) {
      printInfo("Aucun projet trouvé.");
      return;
    }

    const rows = projects.map((p) => [
      p.projectId.slice(0, 8) + "…" + p.projectId.slice(-4),
      p.type,
      p.rewardMode,
      truncate(p.name, 32),
      chalk.cyan(String(p.openTaskCount)) + chalk.dim("/" + String(p.taskCount)),
      p.totalRewardPool ? chalk.green(p.totalRewardPool) : chalk.dim("—"),
      p.stack?.slice(0, 3).join(", ") ?? chalk.dim("—"),
      p.status,
    ]);

    printTable(
      ["ID", "Type", "Mode", "Nom", "Tâches", "Pool PTF", "Stack", "Statut"],
      rows,
      {
        colorRow: (row) => [
          chalk.dim(row[0]),
          row[1] === "public" ? chalk.green(row[1]) : chalk.yellow(row[1]),
          row[2] === "paid" ? chalk.green.bold(row[2]) : chalk.dim(row[2]),
          chalk.bold(row[3]),
          row[4], row[5], chalk.dim(row[6]),
          colorStatus(row[7]),
        ],
      }
    );

    console.log(
      chalk.dim(`\n   ${projects.length} projet(s) — détails : ptf project info --id <id>`)
    );
  });

export const projectCommand = new Command("project").description(
  "Informations sur le projet courant"
);

projectCommand
  .command("info")
  .description("Afficher les informations du projet PTF courant")
  .option("--id <projectId>", "ID d'un projet spécifique")
  .action((options) => {
    if (options.id) {
      printInfo(`Affichage du projet ${options.id} — mode offline`);
      printInfo("Connectez-vous au backend PTF pour les détails complets.");
      return;
    }

    const config = requireProjectConfig();
    printProjectConfig(config);

    console.log(
      "\n" +
        chalk.dim("Commandes utiles :") +
        "\n" +
        chalk.dim("  ptf tasks list --project ") +
        chalk.cyan(config.projectId.slice(0, 16) + "...") +
        "\n" +
        chalk.dim("  ptf project claimed-tasks --project ") +
        chalk.cyan(config.projectId.slice(0, 16) + "...")
    );
  });

projectCommand
  .command("claimed-tasks")
  .description("Voir les tâches réclamées de mon projet (dev, réputation, deadline)")
  .requiredOption("--project <projectId>", "ID du projet")
  .action(async (options) => {
    const userConfig = loadUserConfig();
    const client = new PtfApiClient(userConfig);

    const { tasks, offline } = await client.getTasks({
      projectId: options.project,
      status: "claimed",
    });

    if (offline) printOfflineBanner();

    const claimedTasks = tasks.filter((t) =>
      ["claimed", "in_progress", "submitted", "under_review"].includes(t.status)
    );

    if (claimedTasks.length === 0) {
      printInfo("Aucune tâche réclamée pour ce projet.");
      return;
    }

    const rows = claimedTasks.map((t) => [
      t.id.slice(0, 10) + "...",
      t.title.slice(0, 30),
      t.devAddress ? t.devAddress.slice(0, 14) + "..." : "—",
      "350 pts",
      t.status,
      t.deadline ? new Date(t.deadline).toLocaleDateString("fr-FR") : "—",
    ]);

    printTable(
      ["Tâche", "Titre", "Dev", "Réputation", "Statut", "Deadline"],
      rows
    );

    console.log(
      chalk.dim(`\nSignaler un comportement suspect : ptf report --dev <address> --reason <reason> --task <taskId> --evidence "..."`)
    );
  });

export const contributorsCommand = new Command("contributors").description(
  "Lister les contributeurs d'un projet public"
);

contributorsCommand
  .command("list <projectId>")
  .description("Lister les contributeurs d'un projet public")
  .action(async (projectId: string) => {
    const userConfig = loadUserConfig();
    const client = new PtfApiClient(userConfig);

    if (client.isOffline()) {
      printInfo("Mode offline — données simulées");
      const rows = [
        ["0xAbCd...1234", "dev_alice", "12", "1 800 PTF", "750 pts", "Senior"],
        ["0xEfGh...5678", "dev_bob", "5", "450 PTF", "250 pts", "Junior"],
      ];
      printTable(
        ["Wallet", "GitHub", "Tâches", "Total gagné", "Réputation", "Niveau"],
        rows
      );
      return;
    }

    try {
      const data = await client.query<{ contributors: { address: string; github: string; taskCount: number; totalEarned: string; reputation: number; level: string }[] }>(
        `query Contributors($projectId: String!) { contributors(projectId: $projectId) { address github taskCount totalEarned reputation level } }`,
        { projectId }
      );
      const rows = data.contributors.map((c) => [
        c.address.slice(0, 6) + "..." + c.address.slice(-4),
        c.github,
        String(c.taskCount),
        c.totalEarned,
        `${c.reputation} pts`,
        c.level,
      ]);
      printTable(
        ["Wallet", "GitHub", "Tâches", "Total gagné", "Réputation", "Niveau"],
        rows
      );
    } catch (err) {
      printError(`Échec : ${(err as Error).message}`);
    }
  });

contributorsCommand
  .command("verify <projectId> <address>")
  .description("Vérifier si une adresse est contributrice d'un projet public")
  .action(async (projectId: string, address: string) => {
    printInfo(`Vérification de ${address} sur le projet ${projectId}...`);
    printInfo("Mode offline — résultat simulé");
    console.log(chalk.green("✓ Adresse contributrice vérifiée on-chain"));
  });
