import { Command } from "commander";
import chalk from "chalk";
import { loadUserConfig, saveUserConfig, requireAuth } from "../utils/config.js";
import { PtfApiClient } from "../utils/api.js";
import {
  printError,
  printInfo,
  printSuccess,
  printWarning,
  printWalletStatus,
  printOfflineBanner,
  printSectionHeader,
  shortAddr,
  truncate,
} from "../utils/display.js";
import {
  createWallet,
  restoreWallet,
  listLocalWallets,
  getKeystorePath,
  deleteKeystore,
} from "../utils/keystore.js";

export const walletCommand = new Command("wallet").description(
  "Gérer son wallet PTF (keypair, solde, historique)"
);

// ── Création et restauration du wallet ────────────────────────────────────────

walletCommand
  .command("create")
  .description("Créer un nouveau wallet PTF (keypair secp256k1 + seed phrase BIP-39)")
  .action(async () => {
    const { default: inquirer } = await import("inquirer");

    console.log(
      "\n" + chalk.bold("   Création d'un wallet PTF") + "\n" +
      "   " + chalk.dim("─".repeat(48)) + "\n" +
      "   Un keypair secp256k1 sera généré localement.\n" +
      "   " + chalk.yellow("La clé privée ne quitte jamais votre machine.") + "\n"
    );

    const { password, confirm } = await inquirer.prompt<{ password: string; confirm: string }>([
      {
        type:    "password",
        name:    "password",
        message: "Choisissez un mot de passe pour chiffrer votre keystore :",
        mask:    "*",
        validate: (v: string) => v.length >= 8 || "Minimum 8 caractères.",
      },
      {
        type:    "password",
        name:    "confirm",
        message: "Confirmez le mot de passe :",
        mask:    "*",
      },
    ]);

    if (password !== confirm) {
      printError("Les mots de passe ne correspondent pas.");
      return;
    }

    const wallet = createWallet(password);

    console.log(
      "\n" +
      "   " + chalk.green("✓") + " " + chalk.bold("Wallet créé") + "\n" +
      "   " + chalk.dim("Adresse  : ") + chalk.cyan.bold(wallet.address) + "\n" +
      "   " + chalk.dim("Keystore : ") + chalk.dim(wallet.keystorePath) + "\n"
    );

    const words = wallet.mnemonic.split(" ");
    const innerW = 54;
    const hbar   = "─".repeat(innerW);

    console.log("   " + chalk.yellow("⚠  Seed phrase — à sauvegarder immédiatement"));
    console.log("   " + chalk.dim("┌" + hbar + "┐"));

    for (let i = 0; i < words.length; i += 4) {
      const cells = words.slice(i, i + 4).map((w, j) =>
        `${String(i + j + 1).padStart(2)}. ${w.padEnd(10)}`
      );
      const content = cells.join("  ");
      const pad = Math.max(0, innerW - content.length - 2);
      console.log("   " + chalk.dim("│") + "  " + chalk.bold(content) + " ".repeat(pad) + "  " + chalk.dim("│"));
    }

    console.log("   " + chalk.dim("└" + hbar + "┘"));
    console.log(
      "\n   " + chalk.red("Ces 12 mots sont le seul moyen de récupérer votre wallet.") + "\n" +
      "   " + chalk.red("Notez-les sur papier — ne les partagez jamais.") + "\n"
    );

    const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
      {
        type:    "confirm",
        name:    "confirmed",
        message: "J'ai sauvegardé ma seed phrase en lieu sûr.",
        default: false,
      },
    ]);

    if (!confirmed) {
      printWarning("Veuillez sauvegarder votre seed phrase avant de continuer.");
    }

    saveUserConfig({ walletAddress: wallet.address });

    printSuccess(
      `Wallet configuré comme wallet actif.\n` +
      chalk.dim("Connectez-vous au service PTF : ptf auth login")
    );
  });

walletCommand
  .command("restore")
  .description("Restaurer un wallet PTF depuis une seed phrase BIP-39")
  .action(async () => {
    const { default: inquirer } = await import("inquirer");

    console.log(
      "\n" + chalk.bold("   Restauration d'un wallet PTF") + "\n" +
      "   " + chalk.dim("─".repeat(48)) + "\n" +
      "   Entrez vos 12 mots pour restaurer l'accès à votre wallet.\n"
    );

    const { mnemonic, password, confirm } = await inquirer.prompt<{
      mnemonic: string;
      password: string;
      confirm: string;
    }>([
      {
        type:     "input",
        name:     "mnemonic",
        message:  "Seed phrase (12 mots séparés par des espaces) :",
        validate: (v: string) => {
          const words = v.trim().split(/\s+/);
          return words.length === 12 || "La seed phrase doit contenir exactement 12 mots.";
        },
      },
      {
        type:    "password",
        name:    "password",
        message: "Nouveau mot de passe pour le keystore :",
        mask:    "*",
        validate: (v: string) => v.length >= 8 || "Minimum 8 caractères.",
      },
      {
        type:    "password",
        name:    "confirm",
        message: "Confirmez le mot de passe :",
        mask:    "*",
      },
    ]);

    if (password !== confirm) {
      printError("Les mots de passe ne correspondent pas.");
      return;
    }

    let wallet;
    try {
      wallet = restoreWallet(mnemonic, password);
    } catch {
      printError(
        "Seed phrase invalide ou mot de passe incorrect.\n" +
        chalk.dim("Vérifiez les 12 mots et réessayez.")
      );
      return;
    }

    saveUserConfig({ walletAddress: wallet.address });

    printSuccess(
      `Wallet restauré !\n` +
      `  Adresse PTF : ${chalk.cyan.bold(wallet.address)}\n` +
      `  Keystore    : ${chalk.dim(wallet.keystorePath)}\n\n` +
      chalk.dim("Reconnectez-vous : ptf auth login")
    );
  });

walletCommand
  .command("list")
  .description("Lister les wallets PTF présents sur cette machine")
  .action(() => {
    const cfg = loadUserConfig();
    const wallets = listLocalWallets();

    if (wallets.length === 0) {
      printInfo(
        "Aucun wallet PTF trouvé sur cette machine.\n" +
        chalk.dim("Créez-en un : ptf wallet create")
      );
      return;
    }

    console.log("\n" + chalk.bold(`${wallets.length} wallet(s) PTF local(aux) :\n`));
    wallets.forEach((address) => {
      const isCurrent = address.toLowerCase() === cfg.walletAddress?.toLowerCase();
      console.log(
        `  ${isCurrent ? chalk.cyan("→") : " "} ${address}` +
        (isCurrent ? chalk.dim(" (actif)") : "") + "\n" +
        `     Keystore : ${chalk.dim(getKeystorePath(address))}`
      );
    });
    console.log("");
  });

walletCommand
  .command("delete")
  .description("Supprimer un wallet PTF local (irréversible sans seed phrase)")
  .option("--address <address>", "Adresse du wallet à supprimer")
  .action(async (options: { address?: string }) => {
    const { default: inquirer } = await import("inquirer");
    const cfg = loadUserConfig();
    const wallets = listLocalWallets();

    if (wallets.length === 0) {
      printInfo("Aucun wallet PTF sur cette machine.");
      return;
    }

    let address = options.address;

    if (!address) {
      if (wallets.length === 1) {
        address = wallets[0];
      } else {
        const { chosen } = await inquirer.prompt<{ chosen: string }>([
          {
            type:    "list",
            name:    "chosen",
            message: "Quel wallet supprimer ?",
            choices: wallets.map((w) => ({
              name: w + (w.toLowerCase() === cfg.walletAddress?.toLowerCase() ? chalk.dim(" (actif)") : ""),
              value: w,
            })),
          },
        ]);
        address = chosen;
      }
    }

    if (!wallets.some((w) => w.toLowerCase() === address!.toLowerCase())) {
      printError(`Wallet ${address} introuvable localement.`);
      return;
    }

    console.log(
      "\n   " + chalk.red("⚠  Suppression irréversible") + "\n" +
      "   " + chalk.dim(`Keystore de ${address} supprimé.`) + "\n" +
      "   " + chalk.red("Sans seed phrase, ce wallet sera perdu définitivement.") + "\n"
    );

    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type:    "confirm",
        name:    "confirm",
        message: `Supprimer le wallet ${address} ?`,
        default: false,
      },
    ]);

    if (!confirm) {
      printInfo("Suppression annulée.");
      return;
    }

    deleteKeystore(address);

    if (cfg.walletAddress?.toLowerCase() === address.toLowerCase()) {
      const remaining = listLocalWallets();
      saveUserConfig({ walletAddress: remaining[0] ?? undefined, sessionToken: undefined });
    }

    printSuccess(`Wallet ${address} supprimé.`);
  });

walletCommand
  .command("status")
  .alias("verify")
  .description("Afficher le statut complet du wallet (6 vérifications)")
  .option("--address <address>", "Adresse wallet à vérifier")
  .action(async (options) => {
    const userConfig = loadUserConfig();
    const address = options.address ?? userConfig.walletAddress;

    if (!address) {
      printError(
        "Aucune adresse wallet fournie.\n" +
          chalk.dim(
            "Configurez votre wallet : ptf config set-wallet <address>\n" +
              "Ou passez : ptf wallet status --address 0x..."
          )
      );
      return;
    }

    const client = new PtfApiClient(userConfig);
    const { status, offline } = await client.getWalletStatus(address);
    if (offline) printOfflineBanner();

    printWalletStatus(status);
  });


walletCommand
  .command("history")
  .description("Afficher l'historique des mouvements de crédits PTF")
  .option("--address <address>", "Adresse wallet (défaut : wallet configuré)")
  .option("--limit <n>", "Nombre d'entrées à afficher", "20")
  .option("--type <type>", "Filtrer par type : reward_earned | punishment_deducted | soft_locked | soft_unlocked")
  .action(async (options) => {
    const userConfig = requireAuth();
    const address = options.address ?? userConfig.walletAddress;

    if (!address) {
      printError("Aucun wallet configuré. Lancez : ptf config set-wallet <address>");
      return;
    }

    const client = new PtfApiClient(userConfig);
    const limit = parseInt(options.limit, 10);
    const offline = client.isOffline();
    if (offline) printOfflineBanner();

    let entries: Array<{
      type: string;
      direction: string;
      amount: number;
      utxoId?: string | null;
      taskId?: string | null;
      chain: string;
      txHash?: string | null;
      note?: string | null;
      createdAt: string;
    }>;

    if (offline) {
      entries = [
        { type: "reward_earned",       direction: "credit", amount: 150.0,  taskId: "0xabc…", chain: "polygon", txHash: "0x001…", note: null,                                       createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
        { type: "soft_locked",         direction: "debit",  amount: 10.0,   taskId: "0xdef…", chain: "polygon", txHash: null,      note: "10 PTF guarantee locked on task claim",   createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
        { type: "punishment_deducted", direction: "debit",  amount: 20.0,   taskId: "0xghi…", chain: "polygon", txHash: "0x002…", note: "punishment:lateDelivery",                  createdAt: new Date(Date.now() - 86400000 * 5).toISOString() },
        { type: "soft_unlocked",       direction: "credit", amount: 10.0,   taskId: "0xghi…", chain: "polygon", txHash: null,      note: "10 PTF guarantee released on task cancel", createdAt: new Date(Date.now() - 86400000 * 5).toISOString() },
      ].slice(0, limit);
    } else {
      // creditHistory n'est pas encore exposé dans le schema framework —
      // afficher un message explicite plutôt que des mocks silencieux.
      printWarning(
        "L'historique des crédits sera disponible dans une prochaine version.\n" +
        chalk.dim("Consultez votre historique de transactions on-chain directement sur Polygonscan.")
      );
      entries = [];
    }

    // Totaux
    const totalIn  = entries.filter(e => e.direction === "credit").reduce((s, e) => s + e.amount, 0);
    const totalOut = entries.filter(e => e.direction === "debit").reduce((s, e) => s + e.amount, 0);

    printSectionHeader("Historique crédits PTF");
    console.log("   " + chalk.dim("Adresse : ") + shortAddr(address) + "\n");

    for (const e of entries) {
      const isCredit = e.direction === "credit";
      const sign   = isCredit ? chalk.green(" ▲ ") : chalk.red(" ▼ ");
      const amount = isCredit
        ? chalk.green.bold("+" + e.amount.toFixed(4) + " PTF")
        : chalk.red("−" + e.amount.toFixed(4) + " PTF");
      const date  = new Date(e.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
      const label = truncate(e.note ?? e.type, 30);
      const ref   = e.taskId ? chalk.dim(" · tâche " + e.taskId.slice(0, 8) + "…") : "";
      const tx    = e.txHash ? chalk.dim(" · tx " + e.txHash.slice(0, 8) + "…")    : "";

      console.log(`   ${sign} ${amount.padEnd(22)}  ${chalk.dim(date.padEnd(13))}  ${label}${ref}${tx}`);
    }

    console.log(
      "\n   " + chalk.dim("─".repeat(60)) +
      `\n   ${chalk.dim("Crédités : ")}${chalk.green("+" + totalIn.toFixed(4) + " PTF")}` +
      `   ${chalk.dim("Débités : ")}${chalk.red("−" + totalOut.toFixed(4) + " PTF")}` +
      `   ${chalk.dim("Net : ")}${chalk.bold((totalIn - totalOut).toFixed(4) + " PTF")}\n`
    );
  });

walletCommand
  .command("reputation-history")
  .alias("rep-history")
  .description("Afficher l'historique des points de réputation")
  .option("--address <address>", "Adresse wallet (défaut : wallet configuré)")
  .option("--limit <n>", "Nombre d'entrées à afficher", "20")
  .action(async (options) => {
    const userConfig = requireAuth();
    const address = options.address ?? userConfig.walletAddress;

    if (!address) {
      printError("Aucun wallet configuré. Lancez : ptf config set-wallet <address>");
      return;
    }

    const client = new PtfApiClient(userConfig);
    const limit = parseInt(options.limit, 10);
    const offline = client.isOffline();
    if (offline) printOfflineBanner();

    let entries: Array<{
      delta: number;
      reason: string;
      taskId?: string | null;
      chain?: string | null;
      txHash?: string | null;
      createdAt: string;
    }>;

    if (offline) {
      entries = [
        { delta: 100, reason: "task_validated",           taskId: "0xabc…", chain: "polygon", txHash: "0x001…", createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
        { delta: -10, reason: "punishment:lateDelivery",  taskId: "0xdef…", chain: "polygon", txHash: "0x002…", createdAt: new Date(Date.now() - 86400000 * 5).toISOString() },
        { delta: 110, reason: "task_validated",           taskId: "0xghi…", chain: "polygon", txHash: "0x003…", createdAt: new Date(Date.now() - 86400000 * 15).toISOString() },
        { delta: -30, reason: "punishment:criticalBug",   taskId: "0xjkl…", chain: "polygon", txHash: "0x004…", createdAt: new Date(Date.now() - 86400000 * 20).toISOString() },
        { delta: 180, reason: "task_validated",           taskId: "0xmno…", chain: "polygon", txHash: "0x005…", createdAt: new Date(Date.now() - 86400000 * 30).toISOString() },
      ].slice(0, limit);
    } else {
      // reputationHistory n'est pas encore exposé dans le schema framework —
      // afficher un message explicite plutôt que des mocks silencieux.
      printWarning(
        "L'historique de réputation sera disponible dans une prochaine version.\n" +
        chalk.dim("Consultez votre score actuel : ptf wallet status")
      );
      entries = [];
    }

    const totalGained = entries.filter(e => e.delta > 0).reduce((s, e) => s + e.delta, 0);
    const totalLost   = entries.filter(e => e.delta < 0).reduce((s, e) => s + e.delta, 0);

    printSectionHeader("Historique réputation");
    console.log("   " + chalk.dim("Adresse : ") + shortAddr(address) + "\n");

    for (const e of entries) {
      const isPos = e.delta > 0;
      const sign  = isPos ? chalk.green(" ▲ ") : chalk.red(" ▼ ");
      const pts   = isPos
        ? chalk.green.bold("+" + e.delta + " pts").padEnd(16)
        : chalk.red(e.delta + " pts").padEnd(16);
      const date  = new Date(e.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
      const ref   = e.taskId ? chalk.dim(" · tâche " + e.taskId.slice(0, 8) + "…") : "";

      console.log(`   ${sign} ${pts}  ${chalk.dim(date.padEnd(13))}  ${truncate(e.reason, 30)}${ref}`);
    }

    console.log(
      "\n   " + chalk.dim("─".repeat(60)) +
      `\n   ${chalk.dim("Gagné : ")}${chalk.green("+" + totalGained + " pts")}` +
      `   ${chalk.dim("Perdu : ")}${chalk.red(totalLost + " pts")}` +
      `   ${chalk.dim("Net : ")}${chalk.bold((totalGained + totalLost) + " pts")}\n`
    );
  });

walletCommand
  .command("utxos")
  .description("Lister vos UTXOs PTF (unspent / spent / locked)")
  .option("--address <address>", "Adresse wallet (défaut : wallet configuré)")
  .option("--status <status>", "Filtrer par statut : unspent | spent | locked", "unspent")
  .option("--chain <chain>", "Filtrer par chaîne")
  .action(async (options) => {
    const userConfig = requireAuth();
    const address = options.address ?? userConfig.walletAddress;

    if (!address) {
      printError("Aucun wallet configuré. Lancez : ptf config set-wallet <address>");
      return;
    }

    const client = new PtfApiClient(userConfig);
    const offline = client.isOffline();
    if (offline) printOfflineBanner();

    let utxos: Array<{
      id: string;
      amount: number;
      sourceType: string;
      sourceId: string | null;
      chain: string;
      status: string;
      createdAt: string;
    }>;

    if (offline) {
      utxos = [
        { id: "0x" + "a1".repeat(32), amount: 150.0, sourceType: "task_reward", sourceId: "0x" + "01".repeat(32), chain: "polygon", status: "unspent", createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
        { id: "0x" + "b2".repeat(32), amount: 60.0,  sourceType: "task_reward", sourceId: "0x" + "02".repeat(32), chain: "polygon", status: "unspent", createdAt: new Date(Date.now() - 86400000 * 5).toISOString() },
      ].filter(u => !options.status || u.status === options.status);
    } else {
      // La query utxos n'est pas encore exposée dans le schema framework.
      printWarning(
        "La vue UTXOs sera disponible dans une prochaine version.\n" +
        chalk.dim("Consultez votre solde : ptf wallet status")
      );
      utxos = [];
    }

    const total = utxos.reduce((s, u) => s + u.amount, 0);

    printSectionHeader(`UTXOs PTF — ${options.status}`);
    console.log("   " + chalk.dim("Adresse : ") + shortAddr(address) + "\n");

    for (const u of utxos) {
      const date = new Date(u.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
      const statusFn = u.status === "unspent" ? chalk.green.bold : u.status === "locked" ? chalk.yellow : chalk.dim;
      const badge = u.status === "unspent" ? " ● " : u.status === "locked" ? " ◐ " : " ○ ";
      console.log(
        `   ${statusFn(badge)} ${chalk.green.bold(u.amount.toFixed(6) + " PTF")}  ` +
        chalk.dim(`${u.sourceType.padEnd(14)} ${date}`) +
        `\n       ${chalk.dim("id: " + u.id.slice(0, 10) + "…" + u.id.slice(-6) + "   src: " + (u.sourceId?.slice(0, 8) ?? "—") + "…")}`
      );
    }

    console.log(
      "\n   " + chalk.dim("─".repeat(60)) +
      `\n   ${chalk.dim("Total (" + utxos.length + " UTXO(s)) : ")}${chalk.bold(total.toFixed(6) + " PTF")}\n`
    );
  });

