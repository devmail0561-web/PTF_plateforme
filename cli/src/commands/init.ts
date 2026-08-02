import { Command } from "commander";
import { existsSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import {
  loadProjectConfig,
  saveProjectConfig,
  requireAuth,
  ensureGitignore,
} from "../utils/config.js";
import { generateProjectId, shortHash } from "../utils/crypto.js";
import { printSuccess, printError, printWarning } from "../utils/display.js";

const SUPPORTED_CHAINS = [
  "polygon",
  "ethereum",
  "bsc",
  "avalanche",
  "arbitrum",
  "base",
  "solana",
];

export const initCommand = new Command("init")
  .description("Initialiser un projet PTF (génère le projectId)")
  .option("-n, --name <name>", "Nom du projet (obligatoire)")
  .option("-t, --type <type>", "Type : public | private", "public")
  .option("-r, --reward <reward>", "Mode : free | paid", "free")
  .option(
    "-c, --chain <chain>",
    `Blockchain : ${SUPPORTED_CHAINS.join(" | ")}`,
    "polygon"
  )
  .option("--token <token>", "Token de paiement (défaut: PTF)", "PTF")
  .option("--github <owner/repo>", "Repo GitHub (Cas 1)")
  .option("--server <url>", "Serveur self-hosted (Cas 2)")
  .option("-l, --language <lang>", "Langage principal du projet", "TypeScript")
  .option("--testnet", "Utiliser le testnet (défaut: mainnet)")
  .action(async (options) => {
    const existing = loadProjectConfig();
    if (existing) {
      printError(
        `Un projet PTF existe déjà dans ce répertoire.\n` +
          `  Projet : ${existing.name} (${existing.projectId})\n` +
          `  Supprimez .ptf/config.json pour réinitialiser.`
      );
      return;
    }

    const userConfig = requireAuth();

    const { default: inquirer } = await import("inquirer");

    let name = options.name as string | undefined;
    if (!name) {
      const answers = await inquirer.prompt<{ name: string }>([
        {
          type: "input",
          name: "name",
          message: "Nom du projet :",
          validate: (v: string) =>
            v.trim().length >= 2 ? true : "Le nom doit contenir au moins 2 caractères",
        },
      ]);
      name = answers.name.trim();
    }

    let type = options.type as string;
    if (!["public", "private"].includes(type)) {
      const answers = await inquirer.prompt<{ type: string }>([
        {
          type: "list",
          name: "type",
          message: "Type de projet :",
          choices: [
            {
              name: "public  — visible par tous (open source ou rémunéré)",
              value: "public",
            },
            {
              name: "private — code confidentiel, toujours rémunéré",
              value: "private",
            },
          ],
        },
      ]);
      type = answers.type;
    }

    let rewardMode = options.reward as string;
    if (type === "private") {
      rewardMode = "paid";
    } else if (!["free", "paid"].includes(rewardMode)) {
      const answers = await inquirer.prompt<{ reward: string }>([
        {
          type: "list",
          name: "reward",
          message: "Mode de rémunération :",
          choices: [
            {
              name: "free — open source, reward en points de réputation, aucun escrow PTF",
              value: "free",
            },
            {
              name: "paid — reward PTF par tâche (valeur marché), escrow + garantie 10 PTF",
              value: "paid",
            },
          ],
        },
      ]);
      rewardMode = answers.reward;
    }

    const chain = options.chain as string;
    if (!SUPPORTED_CHAINS.includes(chain)) {
      printError(
        `Chaîne non supportée : ${chain}\n` +
          `Chaînes supportées : ${SUPPORTED_CHAINS.join(", ")}`
      );
      return;
    }

    const ownerAddress = userConfig.walletAddress ?? "offline-user";
    if (!userConfig.walletAddress) {
      printWarning(
        "Aucun wallet configuré. Le projectId sera généré avec un identifiant offline.\n" +
          "Configurez votre wallet : ptf auth login"
      );
    }

    const timestamp = Date.now();
    const projectId = generateProjectId(ownerAddress, name, timestamp);

    let repoMode: "github" | "self-hosted" | "ptf-temp" = "ptf-temp";
    if (options.github) {
      repoMode = "github";
    } else if (options.server) {
      repoMode = "self-hosted";
    } else {
      printWarning(
        "Aucun dépôt fourni. Un repo temporaire PTF sera créé.\n" +
          "Sync automatique à votre reconnexion. (ptf sync status)"
      );
    }

    const config = {
      projectId,
      name,
      type: type as "public" | "private",
      rewardMode: rewardMode as "free" | "paid",
      chain,
      token: rewardMode === "paid" ? (options.token as string) : undefined,
      github: options.github as string | undefined,
      server: options.server as string | undefined,
      repoMode,
      language: options.language as string,
      createdAt: new Date().toISOString(),
      network: (options.testnet ? "testnet" : "mainnet") as "mainnet" | "testnet",
      ownerAddress,
    };

    const configPath = join(process.cwd(), ".ptf", "config.json");

    saveProjectConfig(config);
    ensureGitignore(process.cwd());

    console.log(
      "\n" +
        chalk.green.bold("✓ Projet PTF initialisé avec succès\n") +
        "\n" +
        `  ${chalk.bold("Nom")}       : ${chalk.cyan(name)}\n` +
        `  ${chalk.bold("ID")}        : ${chalk.dim(projectId)}\n` +
        `  ${chalk.bold("Type")}      : ${type}\n` +
        `  ${chalk.bold("Mode")}      : ${rewardMode === "paid" ? chalk.green("paid") : chalk.dim("free")}\n` +
        `  ${chalk.bold("Chaîne")}    : ${chain}\n` +
        `  ${chalk.bold("Dépôt")}     : ${options.github ?? options.server ?? chalk.dim("repo temporaire PTF")}\n` +
        `  ${chalk.bold("Config")}    : ${configPath}\n`
    );

    console.log(
      chalk.bold("Prochaines étapes :") +
        "\n" +
        chalk.dim("  1. ") +
        chalk.cyan("ptf generate --project " + shortHash(projectId)) +
        chalk.dim(" — générer les tâches\n") +
        chalk.dim("  2. ") +
        chalk.cyan("ptf tasks preview") +
        chalk.dim(" — revoir les tâches générées\n") +
        chalk.dim("  3. ") +
        chalk.cyan("ptf tasks publish") +
        chalk.dim(" — publier dans le réseau PTF")
    );

    if (rewardMode === "paid") {
      console.log(
        "\n" +
          chalk.yellow("Note (projet paid) :") +
          "\n" +
          chalk.dim(
            `  Lors de la publication, vous déposerez le reward pool + commission PTF en escrow.\n` +
              `  Assurez-vous d'avoir suffisamment de PTF sur la chaîne ${chain}.\n` +
              `  Le montant PTF est calculé au taux marché au moment de la publication.`
          )
      );
    }
  });
