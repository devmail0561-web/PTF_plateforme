import { Command } from "commander";
import chalk from "chalk";
import { loadUserConfig, saveUserConfig } from "../utils/config.js";
import { printSuccess, printError, printInfo, printWarning } from "../utils/display.js";

export const authCommand = new Command("auth").description(
  "Authentification GitHub OAuth et liaison wallet"
);

authCommand
  .command("login")
  .description("Se connecter à PTF via GitHub OAuth")
  .option("--wallet <address>", "Adresse wallet Ethereum (optionnel)")
  .option("--offline", "Mode offline (token simulé)")
  .action(async (options: { wallet?: string; offline?: boolean }) => {
    const userConfig = loadUserConfig();

    if (options.offline || process.env["PTF_OFFLINE"]) {
      printWarning("Mode offline — aucun token GitHub réel sauvegardé");
      saveUserConfig({
        githubToken: undefined,
        walletAddress: options.wallet ?? "0x0000000000000000000000000000000000000000",
        walletChain: "polygon",
      });
      printSuccess("Configuré en mode offline.");
      printInfo(
        "Configurez votre wallet réel : ptf config set-wallet <address>"
      );
      return;
    }

    const callbackPort = 9876;
    const ptfApiUrl = userConfig.ptfApiUrl ?? "https://ptf.dev";
    const authUrl = `${ptfApiUrl}/auth/github?callback=http://localhost:${callbackPort}/callback`;

    console.log(
      "\n" +
        chalk.bold("Connexion PTF via GitHub OAuth\n") +
        chalk.dim("─".repeat(50)) +
        "\n" +
        "1. Ouvrez ce lien dans votre navigateur :\n" +
        chalk.cyan(`   ${authUrl}`) +
        "\n" +
        chalk.dim("\nOu laissez PTF ouvrir automatiquement le navigateur...")
    );

    try {
      const { default: open } = await import("open");
      await open(authUrl);
    } catch {
      printWarning("Impossible d'ouvrir le navigateur automatiquement.");
    }

    printInfo("En attente du callback OAuth...");

    await new Promise<void>((resolve) => {
      const { createServer } = require("http") as typeof import("http");
      const server = createServer((req, res) => {
        if (req.url === "/callback" || req.url?.startsWith("/callback?")) {
          const url = new URL(req.url, `http://localhost:${callbackPort}`);
          const token = url.searchParams.get("token");
          if (token) {
            saveUserConfig({ githubToken: token });
          }
          res.end("<h1>PTF — Authentification réussie. Fermez cet onglet.</h1>");
          server.close();
          resolve();
        }
      });

      server.listen(callbackPort);
      server.on("error", () => {
        printError("Impossible de démarrer le serveur callback OAuth.");
        resolve();
      });

      setTimeout(() => {
        server.close();
        resolve();
      }, 120_000);
    });

    const updatedConfig = loadUserConfig();
    if (updatedConfig.githubToken) {
      printSuccess("Connecté à PTF via GitHub OAuth.");
    } else {
      printWarning("Authentification expirée ou annulée.");
    }
  });

authCommand
  .command("logout")
  .description("Se déconnecter de PTF")
  .action(() => {
    saveUserConfig({ githubToken: undefined });
    printSuccess("Déconnecté de PTF.");
  });

authCommand
  .command("status")
  .description("Afficher le statut de connexion")
  .action(() => {
    const cfg = loadUserConfig();
    if (cfg.githubToken) {
      printSuccess("Connecté à PTF via GitHub OAuth.");
      if (cfg.walletAddress) {
        printInfo(`Wallet : ${cfg.walletAddress} (${cfg.walletChain})`);
      }
    } else {
      printError("Non connecté. Lancez : ptf auth login");
    }
  });
