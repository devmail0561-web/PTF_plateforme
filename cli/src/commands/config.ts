import { Command } from "commander";
import chalk from "chalk";
import {
  loadUserConfig,
  saveUserConfig,
  getUserConfigPath,
} from "../utils/config.js";
import { printSuccess, printError, printInfo } from "../utils/display.js";

function maskKey(key: string): string {
  if (!key || key.length < 8) return "***";
  return key.slice(0, 6) + "***" + key.slice(-4);
}

const configCommand = new Command("config")
  .description("Gérer la configuration PTF de l'utilisateur");

configCommand
  .command("get")
  .description("Afficher la configuration actuelle")
  .action(() => {
    const cfg = loadUserConfig();
    console.log(
      "\n" +
        chalk.bold("Configuration PTF\n") +
        chalk.dim(`Stockée dans : ${getUserConfigPath()}\n`) +
        "\n" +
        `  ${chalk.bold("API URL")}      : ${cfg.ptfApiUrl ?? chalk.dim("non configurée")}\n` +
        `  ${chalk.bold("Wallet")}       : ${cfg.walletAddress ?? chalk.dim("non configuré")}\n` +
        `  ${chalk.bold("Chaîne")}       : ${cfg.walletChain ?? chalk.dim("polygon")}\n` +
        `  ${chalk.bold("LLM Provider")} : ${cfg.llmProvider ?? chalk.dim("non configuré")}\n` +
        `  ${chalk.bold("LLM API Key")}  : ${cfg.llmApiKey ? maskKey(cfg.llmApiKey) : chalk.dim("non configurée")}\n` +
        `  ${chalk.bold("LLM URL")}      : ${cfg.llmUrl ?? chalk.dim("N/A")}\n` +
        `  ${chalk.bold("LLM Model")}    : ${cfg.llmModel ?? chalk.dim("défaut du provider")}\n`
    );
  });

configCommand
  .command("set-llm <provider>")
  .description("Configurer le fournisseur LLM (anthropic | openai | ollama | mistral)")
  .option("--key <api-key>", "Clé API du fournisseur")
  .option("--url <url>", "URL du serveur LLM (pour ollama)")
  .option("--model <model>", "Modèle à utiliser")
  .action((provider: string, options: { key?: string; url?: string; model?: string }) => {
    const validProviders = ["anthropic", "openai", "ollama", "mistral"];
    if (!validProviders.includes(provider)) {
      printError(
        `Provider non supporté : ${provider}\n` +
          `Providers disponibles : ${validProviders.join(", ")}`
      );
      return;
    }

    if (provider !== "ollama" && !options.key) {
      printError(
        `Une clé API est requise pour ${provider}.\n` +
          `Exemple : ptf config set-llm ${provider} --key <votre-clé>`
      );
      return;
    }

    if (provider === "ollama" && !options.url) {
      printInfo("Aucune URL fournie. Utilisation de http://localhost:11434 par défaut.");
    }

    saveUserConfig({
      llmProvider: provider as "anthropic" | "openai" | "ollama" | "mistral",
      llmApiKey: options.key,
      llmUrl: provider === "ollama" ? (options.url ?? "http://localhost:11434") : undefined,
      llmModel: options.model,
    });

    printSuccess(`LLM configuré : ${provider}${options.model ? ` (${options.model})` : ""}`);
    printInfo(
      "La clé API n'est jamais envoyée à PTF — elle est utilisée localement pour les appels LLM."
    );
  });

configCommand
  .command("set-api <url>")
  .description("Configurer l'URL du backend PTF")
  .action((url: string) => {
    saveUserConfig({ ptfApiUrl: url });
    printSuccess(`API URL configurée : ${url}`);
  });

configCommand
  .command("set-wallet <address>")
  .description("Configurer l'adresse wallet par défaut")
  .option("--chain <chain>", "Chaîne associée", "polygon")
  .action((address: string, options: { chain: string }) => {
    saveUserConfig({ walletAddress: address, walletChain: options.chain });
    printSuccess(`Wallet configuré : ${address} (${options.chain})`);
  });

export { configCommand };
