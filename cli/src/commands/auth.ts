import { Command } from "commander";
import chalk from "chalk";
import { loadUserConfig, saveUserConfig } from "../utils/config.js";
import { printSuccess, printError, printInfo, printWarning } from "../utils/display.js";
import { listLocalWallets, unlockWallet, signChallenge, hasKeystore } from "../utils/keystore.js";
import { PtfApiClient } from "../utils/api.js";

export const authCommand = new Command("auth").description(
  "Gestion de la session PTF (connexion au service tier via challenge-response)"
);

/**
 * ptf auth login
 *
 * Flow :
 *  1. L'utilisateur saisit son adresse PTF (ou choisit parmi les keystores locaux)
 *  2. Il déchiffre son keystore local avec son mot de passe
 *  3. Le CLI demande un nonce au service tier
 *  4. Le CLI signe le nonce avec la clé privée (locale, ne quitte pas la machine)
 *  5. Le service tier vérifie la signature → retourne un JWT de session
 *
 * La clé privée n'est jamais envoyée au réseau. Le service tier ne connaît
 * que l'adresse PTF et vérifie la possession via la signature.
 */
authCommand
  .command("login")
  .description("Se connecter au service PTF via challenge-response (clé privée locale)")
  .option("--address <address>", "Adresse PTF à utiliser (optionnel si un seul keystore local)")
  .option("--offline", "Mode offline (simule une session locale)")
  .action(async (options: { address?: string; offline?: boolean }) => {
    const { default: inquirer } = await import("inquirer");
    const userConfig = loadUserConfig();

    // ── Mode offline ──────────────────────────────────────────────────────────
    if (options.offline || process.env["PTF_OFFLINE"]) {
      const wallets = listLocalWallets();
      let address = options.address ?? wallets[0];

      if (!address) {
        printError(
          "Aucun keystore local trouvé.\n" +
          chalk.dim("Créez d'abord un wallet : ptf wallet create")
        );
        process.exit(1);
      }

      saveUserConfig({ walletAddress: address, sessionToken: `offline:${address}` });
      printWarning("Mode offline — session simulée (aucun service tier contacté).");
      printSuccess(`Connecté localement : ${chalk.bold(address)}`);
      return;
    }

    // ── 1. Résoudre l'adresse ─────────────────────────────────────────────────
    let address = options.address;

    if (!address) {
      const wallets = listLocalWallets();

      if (wallets.length === 0) {
        printError(
          "Aucun keystore PTF trouvé sur cette machine.\n" +
          chalk.dim("Créez un wallet : ptf wallet create\n") +
          chalk.dim("Ou restaurez depuis votre seed phrase : ptf wallet restore")
        );
        process.exit(1);
      }

      if (wallets.length === 1) {
        address = wallets[0];
        printInfo(`Wallet détecté : ${chalk.bold(address)}`);
      } else {
        const { chosen } = await inquirer.prompt<{ chosen: string }>([
          {
            type:    "list",
            name:    "chosen",
            message: "Quel wallet utiliser ?",
            choices: wallets,
          },
        ]);
        address = chosen;
      }
    }

    if (!hasKeystore(address)) {
      printError(
        `Aucun keystore trouvé pour ${address}.\n` +
        chalk.dim("Vérifiez l'adresse ou restaurez depuis votre seed phrase : ptf wallet restore")
      );
      process.exit(1);
    }

    // ── 2. Déchiffrer le keystore local ───────────────────────────────────────
    const { password } = await inquirer.prompt<{ password: string }>([
      {
        type:    "password",
        name:    "password",
        message: "Mot de passe keystore :",
        mask:    "*",
      },
    ]);

    let privateKey: string;
    try {
      ({ privateKey } = unlockWallet(address, password));
    } catch (err) {
      printError((err as Error).message);
      process.exit(1);
    }

    printInfo("Keystore déchiffré. Connexion au service PTF...");

    // ── 3. Demander un nonce au service tier ──────────────────────────────────
    const client = new PtfApiClient(userConfig);

    let nonce: string;
    try {
      const result = await client.requestAuthChallenge(address);
      nonce = result.nonce;
    } catch (err) {
      printError(
        `Impossible de contacter le service PTF : ${(err as Error).message}\n` +
        chalk.dim("Vérifiez votre connexion ou utilisez --offline.")
      );
      // Effacer la clé privée de la mémoire
      privateKey = "";
      process.exit(1);
    }

    // ── 4. Signer le nonce (localement) ──────────────────────────────────────
    const signature = signChallenge(privateKey, nonce);
    // Effacer la clé privée de la mémoire immédiatement après la signature
    privateKey = "";

    // ── 5. Envoyer la signature au service tier ───────────────────────────────
    let sessionToken: string;
    try {
      const result = await client.verifyAuthChallenge(address, nonce, signature);
      sessionToken = result.token;
    } catch (err) {
      printError(
        `Échec de l'authentification : ${(err as Error).message}\n` +
        chalk.dim("La signature n'a pas pu être vérifiée par le service.")
      );
      process.exit(1);
    }

    saveUserConfig({ walletAddress: address, sessionToken });

    printSuccess(
      `Connecté au service PTF !\n` +
      `  Adresse : ${chalk.bold(address)}\n` +
      chalk.dim("  La clé privée n'a pas quitté cette machine.")
    );
  });

authCommand
  .command("logout")
  .description("Se déconnecter du service PTF (keystore local intact)")
  .action(() => {
    saveUserConfig({ sessionToken: undefined });
    printSuccess(
      "Déconnecté du service PTF.\n" +
      chalk.dim("Votre keystore local est intact. Reconnectez-vous avec : ptf auth login")
    );
  });

authCommand
  .command("status")
  .description("Afficher le statut de connexion")
  .action(() => {
    const cfg = loadUserConfig();
    const wallets = listLocalWallets();

    console.log("\n" + chalk.bold("Statut PTF\n") + chalk.dim("─".repeat(40)));

    // Keystores locaux
    if (wallets.length > 0) {
      console.log(chalk.green("✓") + `  ${wallets.length} wallet(s) local(aux) :`);
      wallets.forEach((w) => {
        const isCurrent = w.toLowerCase() === cfg.walletAddress?.toLowerCase();
        console.log(
          `     ${isCurrent ? chalk.cyan("→") : " "} ${w}` +
          (isCurrent ? chalk.dim(" (actif)") : "")
        );
      });
    } else {
      console.log(chalk.yellow("⚠") + "  Aucun wallet local — créez-en un : ptf wallet create");
    }

    // Session service tier
    if (cfg.sessionToken && !cfg.sessionToken.startsWith("offline:")) {
      console.log(chalk.green("✓") + "  Session service PTF active");
    } else if (cfg.sessionToken?.startsWith("offline:")) {
      console.log(chalk.yellow("⚠") + "  Mode offline (pas de session service tier)");
    } else {
      console.log(chalk.dim("   Pas de session service PTF — connectez-vous : ptf auth login"));
    }

    // Node configuré
    const nodeUrl = cfg.ptfNodeUrl ?? cfg.ptfApiUrl;
    if (nodeUrl) {
      console.log(chalk.green("✓") + `  Nœud/service : ${chalk.dim(nodeUrl)}`);
    }

    console.log("");
  });
