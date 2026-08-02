import { Command } from "commander";
import chalk from "chalk";
import { loadUserConfig, saveUserConfig } from "../utils/config.js";
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
import { isValidAddress } from "../utils/crypto.js";
import {
  createWallet,
  restoreWallet,
  listLocalWallets,
  getKeystorePath,
} from "../utils/keystore.js";

export const walletCommand = new Command("wallet").description(
  "Gérer son wallet PTF (crédits, dépôts, vérifications)"
);

// ── Création et restauration du wallet ────────────────────────────────────────

walletCommand
  .command("create")
  .description("Créer un nouveau wallet PTF (keypair secp256k1 + seed phrase BIP-39)")
  .action(async () => {
    const { default: inquirer } = await import("inquirer");

    console.log(
      "\n" + chalk.bold("Création d'un wallet PTF\n") +
      chalk.dim("─".repeat(50)) + "\n" +
      "Un keypair secp256k1 va être généré sur cette machine.\n" +
      chalk.yellow("La clé privée ne quittera jamais votre appareil.\n")
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
      process.exit(1);
    }

    const wallet = createWallet(password);

    console.log(
      "\n" + chalk.green.bold("✓ Wallet créé !\n") +
      chalk.dim("─".repeat(50)) + "\n" +
      `  Adresse PTF : ${chalk.cyan.bold(wallet.address)}\n` +
      `  Keystore    : ${chalk.dim(wallet.keystorePath)}\n`
    );

    console.log(
      chalk.yellow.bold("\n  ⚠  SEED PHRASE — À SAUVEGARDER IMMÉDIATEMENT\n") +
      chalk.yellow("  ┌" + "─".repeat(46) + "┐") + "\n" +
      chalk.yellow("  │") + "                                              " + chalk.yellow("│") + "\n"
    );

    const words = wallet.mnemonic.split(" ");
    for (let i = 0; i < words.length; i += 3) {
      const line = words.slice(i, i + 3)
        .map((w, j) => `${String(i + j + 1).padStart(2)}. ${w.padEnd(12)}`)
        .join("  ");
      console.log(chalk.yellow("  │  ") + chalk.bold(line) + chalk.yellow("  │"));
    }

    console.log(
      chalk.yellow("  │") + "                                              " + chalk.yellow("│") + "\n" +
      chalk.yellow("  └" + "─".repeat(46) + "┘") + "\n\n" +
      chalk.red("  ATTENTION : Ces 12 mots sont la seule façon de récupérer\n") +
      chalk.red("  votre wallet si vous perdez le fichier keystore.\n") +
      chalk.red("  Notez-les sur papier et gardez-les en lieu sûr.\n") +
      chalk.red("  Ne les partagez jamais — ils donnent accès à tous vos fonds.\n")
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
      "\n" + chalk.bold("Restauration d'un wallet PTF\n") +
      chalk.dim("─".repeat(50)) + "\n" +
      "Entrez vos 12 mots (seed phrase) pour restaurer votre wallet.\n"
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
      process.exit(1);
    }

    let wallet;
    try {
      wallet = restoreWallet(mnemonic, password);
    } catch (err) {
      printError((err as Error).message);
      process.exit(1);
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
      process.exit(1);
    }

    const client = new PtfApiClient(userConfig);
    const { status, offline } = await client.getWalletStatus(address);
    if (offline) printOfflineBanner();

    printWalletStatus(status);
  });

walletCommand
  .command("deposit")
  .description("Déposer des fonds sur votre compte PTF")
  .option("--chain <chain>", "Chaîne source", "polygon")
  .option("--amount <amount>", "Montant à déposer")
  .option("--token <token>", "Devise/token source pour la conversion (USDC, ETH, EUR...) — sera converti en PTF", "PTF")
  .option("--currency <currency>", "Alias pour --token")
  .action(async (options) => {
    const userConfig = loadUserConfig();
    const token = options.currency ?? options.token;
    const amount = options.amount ? parseFloat(options.amount) : null;

    const { default: inquirer } = await import("inquirer");

    let finalAmount = amount;
    if (!finalAmount) {
      const ans = await inquirer.prompt<{ amount: string }>([
        {
          type: "input",
          name: "amount",
          message: `Montant à déposer en ${token} :`,
          validate: (v: string) => {
            const n = parseFloat(v);
            return n > 0 ? true : "Montant invalide";
          },
        },
      ]);
      finalAmount = parseFloat(ans.amount);
    }

    const chain = options.chain;
    const client = new PtfApiClient(userConfig);

    if (client.isOffline()) {
      printOfflineBanner();
      printWarning("Mode offline — adresse PTF simulée");
      console.log(
        "\n" +
          chalk.bold("Instructions de dépôt (mode offline)\n") +
          chalk.dim("─".repeat(60)) +
          "\n" +
          `  Chaîne   : ${chalk.bold(chain)}\n` +
          `  Token    : ${chalk.bold(token)}\n` +
          `  Montant  : ${chalk.bold(finalAmount.toFixed(6))} ${token}\n` +
          `  Vers     : ${chalk.yellow.bold("0xPTF_OFFICIAL_ADDRESS_VERIFIED_BY_MERKLE (simulée)")}\n` +
          chalk.dim("─".repeat(60)) +
          "\n" +
          chalk.dim("En mode réel, l'adresse officielle PTF serait vérifiée via Merkle root réseau.\n") +
          chalk.dim("Après confirmation on-chain, vos crédits PTF seront crédités automatiquement.\n") +
          (token !== "PTF"
            ? chalk.dim(
                `Conversion automatique ${token} → PTF via oracle Chainlink (~0.5% de frais, taux garanti 60s)\n`
              )
            : "") +
          chalk.dim("Taux PTF/USD déterminé par le marché — vérifiez le prix actuel avant tout dépôt.")
      );
    } else {
      printInfo(
        `Vérification de l'adresse officielle PTF via Merkle root réseau...`
      );
      // TODO: call depositCredits GraphQL mutation once backend deposit listener is wired
      printWarning("Le flux de dépôt on-chain n'est pas encore disponible. Configurez votre nœud PTF.");
    }
  });

walletCommand
  .command("withdraw")
  .description("Retirer des crédits PTF vers votre wallet")
  .requiredOption("--amount <amount>", "Montant à retirer (minimum 1.0 PTF)")
  .requiredOption("--to <address>", "Adresse de destination")
  .action(async (options) => {
    const amount = parseFloat(options.amount);
    if (isNaN(amount) || amount < 1.0) {
      printError("Le montant minimum de retrait est 1.0 PTF.");
      process.exit(1);
    }

    if (!isValidAddress(options.to)) {
      printError(`Adresse de destination invalide : ${options.to}`);
      process.exit(1);
    }

    const { default: inquirer } = await import("inquirer");
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        message: `Retirer ${amount.toFixed(6)} PTF vers ${options.to} ?`,
        default: false,
      },
    ]);

    if (!confirm) {
      printInfo("Retrait annulé.");
      return;
    }

    const userConfig = loadUserConfig();
    const client = new PtfApiClient(userConfig);

    if (client.isOffline()) {
      printOfflineBanner();
      // Simulate UTXO-based withdrawal output (offline demo data)
      const mockProofHash = "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
      const mockUTXOs = [
        { id: "0xc001a1b2c3d4e5f6c001a1b2c3d4e5f6c001a1b2c3d4e5f6c001a1b2c3d4e5f6", amount: 150.0, sourceType: "task_reward", sourceId: "0xd001e5f6a1b2c3d4d001e5f6a1b2c3d4d001e5f6a1b2c3d4d001e5f6a1b2c3d4" },
        { id: "0xc002a1b2c3d4e5f6c002a1b2c3d4e5f6c002a1b2c3d4e5f6c002a1b2c3d4e5f6", amount: 60.0,  sourceType: "task_reward", sourceId: "0xd002e5f6a1b2c3d4d002e5f6a1b2c3d4d002e5f6a1b2c3d4d002e5f6a1b2c3d4" },
      ];
      if (amount > 210) {
        printError(`Solde insuffisant : total disponible 210 PTF, demandé ${amount.toFixed(6)} PTF.`);
        process.exit(1);
      }
      const change = 210 - amount > 0 ? { id: "0xc0c0a1b2c3d4e5f6c0c0a1b2c3d4e5f6c0c0a1b2c3d4e5f6c0c0a1b2c3d4e5f6", amount: 210 - amount } : null;

      console.log(
        `\n${chalk.bold("Retrait PTF — Preuve de provenance")}\n` +
        chalk.dim("─".repeat(64)) + "\n" +
        `  Montant retiré   : ${chalk.green.bold(amount.toFixed(6) + " PTF")}\n` +
        `  Destination      : ${chalk.bold(options.to)}\n` +
        `  Proof hash       : ${chalk.dim(mockProofHash)}\n` +
        chalk.dim("  (keccak256 de toutes les signatures EIP-712 des UTXOs sources)\n") +
        chalk.dim("─".repeat(64)) + "\n" +
        chalk.bold("  UTXOs consommés :\n")
      );
      for (const u of mockUTXOs) {
        console.log(
          `    ${chalk.green("●")} ${u.amount.toFixed(6)} PTF` +
          chalk.dim(`  source: ${u.sourceType}  id: ${u.id}  tâche: ${u.sourceId}`)
        );
      }
      if (change) {
        console.log(
          `\n  ${chalk.yellow("◑")} Monnaie rendue : ${chalk.yellow(change.amount.toFixed(6) + " PTF")}` +
          chalk.dim(`  id: ${change.id}`)
        );
      }
      console.log(
        "\n" + chalk.dim("Chaque UTXO porte une signature EIP-712 de PTF prouvant sa tâche source.\n") +
        chalk.dim("Consultez vos UTXOs avec : ptf wallet utxos --address <address>\n")
      );
    } else {
      const chain = userConfig.walletChain ?? "polygon";
      let result: {
        withdrawCredits: {
          txId: string;
          netAmount: number;
          proofHash: string;
          consumed: { id: string; amount: number; sourceType: string; sourceId: string | null }[];
          change: { id: string; amount: number } | null;
        };
      };

      try {
        result = await client.query(
          `mutation Withdraw($input: WithdrawInput!) {
            withdrawCredits(input: $input) {
              txId netAmount proofHash
              consumed { id amount sourceType sourceId }
              change { id amount }
            }
          }`,
          { input: { amount, destination: options.to, chain } }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        printError(`Retrait échoué : ${msg}`);
        process.exit(1);
      }

      const r = result.withdrawCredits;
      console.log(
        `\n${chalk.bold("Retrait PTF — Preuve de provenance")}\n` +
        chalk.dim("─".repeat(64)) + "\n" +
        `  Montant retiré   : ${chalk.green.bold(r.netAmount.toFixed(6) + " PTF")}\n` +
        `  Destination      : ${chalk.bold(options.to)}\n` +
        `  Proof hash       : ${chalk.dim(r.proofHash)}\n` +
        chalk.dim("─".repeat(64)) + "\n" +
        chalk.bold("  UTXOs consommés :\n")
      );
      for (const u of r.consumed) {
        console.log(
          `    ${chalk.green("●")} ${u.amount.toFixed(6)} PTF` +
          chalk.dim(`  ${u.sourceType}  id: ${u.id.slice(0, 14)}…`)
        );
      }
      if (r.change) {
        console.log(
          `\n  ${chalk.yellow("◑")} Monnaie rendue : ${chalk.yellow(r.change.amount.toFixed(6) + " PTF")}`
        );
      }
      printSuccess(`\nRetrait exécuté — TX: ${r.txId.slice(0, 18)}…`);
    }
  });

walletCommand
  .command("link")
  .description("Lier un wallet d'une autre chaîne à votre compte PTF")
  .requiredOption("--chain <chain>", "Chaîne du wallet")
  .requiredOption("--address <address>", "Adresse wallet")
  .action(async (options) => {
    if (!isValidAddress(options.address) && options.chain !== "solana") {
      printError(`Adresse invalide : ${options.address}`);
      process.exit(1);
    }

    printWarning("Mode offline — liaison simulée");
    printSuccess(
      `Wallet lié : ${options.address} (${options.chain})\n` +
        chalk.dim(
          "Votre score de réputation sera agrégé cross-chaîne via le ReputationAggregator."
        )
    );
  });

walletCommand
  .command("chains")
  .description("Lister vos wallets par chaîne et leurs soldes PTF")
  .action(async () => {
    const userConfig = loadUserConfig();
    const address = userConfig.walletAddress;

    if (!address) {
      printError("Aucun wallet configuré. Lancez : ptf auth login");
      process.exit(1);
    }

    printWarning("Mode offline — données simulées");

    const { printTable } = await import("../utils/display.js");
    printTable(
      ["Chaîne", "Adresse", "Solde PTF", "Soft-locked", "Disponible"],
      [
        ["polygon", address.slice(0, 18) + "...", "15.500000", "10.000000", "5.500000"],
        ["ethereum", "0x****...****", "0.000000", "0.000000", "0.000000"],
      ]
    );

    console.log(
      chalk.dim("\nScore réputation global : 350 pts (Junior)\n") +
        chalk.dim("Lier un nouveau wallet : ptf wallet link --chain <chain> --address <addr>")
    );
  });

walletCommand
  .command("bridge")
  .description("Bridge des PTF Credits entre chaînes (LayerZero)")
  .requiredOption("--from <chain>", "Chaîne source")
  .requiredOption("--to <chain>", "Chaîne destination")
  .requiredOption("--amount <amount>", "Montant à bridger")
  .action(async (options) => {
    const amount = parseFloat(options.amount);
    if (isNaN(amount) || amount <= 0) {
      printError("Montant invalide.");
      process.exit(1);
    }

    const { default: inquirer } = await import("inquirer");
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        message: `Bridge ${amount} PTF de ${options.from} vers ${options.to} ?`,
        default: false,
      },
    ]);

    if (!confirm) {
      printInfo("Bridge annulé.");
      return;
    }

    printWarning("Mode offline — bridge simulé");
    printSuccess(
      `Bridge de ${amount} PTF initié : ${options.from} → ${options.to}\n` +
        chalk.dim("PTF : token natif à valeur flottante — taux déterminé par le marché\n") +
        chalk.dim("~2-5 minutes pour la confirmation cross-chaîne")
    );
  });

walletCommand
  .command("history")
  .description("Afficher l'historique des mouvements de crédits PTF")
  .option("--address <address>", "Adresse wallet (défaut : wallet configuré)")
  .option("--limit <n>", "Nombre d'entrées à afficher", "20")
  .option("--type <type>", "Filtrer par type : reward_earned | punishment_deducted | soft_locked | soft_unlocked | deposit | withdrawal | bridge_out | bridge_in")
  .action(async (options) => {
    const userConfig = loadUserConfig();
    const address = options.address ?? userConfig.walletAddress;

    if (!address) {
      printError("Aucun wallet configuré. Lancez : ptf config set-wallet <address>");
      process.exit(1);
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
        { type: "reward_earned",       direction: "credit", amount: 150.0,  taskId: "0xabc…", chain: "polygon", txHash: "0x001…", note: null,                         createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
        { type: "soft_locked",         direction: "debit",  amount: 10.0,   taskId: "0xdef…", chain: "polygon", txHash: null,      note: "10 PTF guarantee locked on task claim",   createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
        { type: "punishment_deducted", direction: "debit",  amount: 20.0,   taskId: "0xghi…", chain: "polygon", txHash: "0x002…", note: "punishment:lateDelivery",    createdAt: new Date(Date.now() - 86400000 * 5).toISOString() },
        { type: "soft_unlocked",       direction: "credit", amount: 10.0,   taskId: "0xghi…", chain: "polygon", txHash: null,      note: "10 PTF guarantee released on task cancel", createdAt: new Date(Date.now() - 86400000 * 5).toISOString() },
        { type: "deposit",             direction: "credit", amount: 50.0,   taskId: null,     chain: "polygon", txHash: "0x003…", note: "50 PTF deposit",              createdAt: new Date(Date.now() - 86400000 * 10).toISOString() },
      ].slice(0, limit);
    } else {
      const result = await client.query<{
        creditHistory: typeof entries;
      }>(
        `query($address: String!, $limit: Int, $type: String) {
          creditHistory(address: $address, limit: $limit, type: $type) {
            type direction amount utxoId taskId chain txHash note createdAt
          }
        }`,
        { address, limit, type: options.type ?? null }
      );
      entries = result.creditHistory;
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
    const userConfig = loadUserConfig();
    const address = options.address ?? userConfig.walletAddress;

    if (!address) {
      printError("Aucun wallet configuré. Lancez : ptf config set-wallet <address>");
      process.exit(1);
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
      const result = await client.query<{
        reputationHistory: typeof entries;
      }>(
        `query($address: String!, $limit: Int) {
          reputationHistory(address: $address, limit: $limit) {
            delta reason taskId chain txHash createdAt
          }
        }`,
        { address, limit }
      );
      entries = result.reputationHistory;
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
    const userConfig = loadUserConfig();
    const address = options.address ?? userConfig.walletAddress;

    if (!address) {
      printError("Aucun wallet configuré. Lancez : ptf config set-wallet <address>");
      process.exit(1);
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
      try {
        const result = await client.query<{ utxos: typeof utxos }>(
          `query UTXOs($address: String!, $status: String, $chain: String) {
            utxos(address: $address, status: $status, chain: $chain) {
              id amount sourceType sourceId chain status createdAt
            }
          }`,
          { address, status: options.status ?? null, chain: options.chain ?? null }
        );
        utxos = result.utxos;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        printError(`Erreur récupération UTXOs : ${msg}`);
        process.exit(1);
      }
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

walletCommand
  .command("convert")
  .description("Convertir une devise en PTF credits")
  .requiredOption("--from <currency>", "Devise source (EUR, ETH, BTC, USDT...)")
  .requiredOption("--amount <amount>", "Montant à convertir")
  .action(async (options) => {
    const amount = parseFloat(options.amount);
    if (isNaN(amount) || amount <= 0) {
      printError("Montant invalide.");
      process.exit(1);
    }

    printInfo(
      `Récupération du taux ${options.from}/PTF via oracle Chainlink...`
    );
    await new Promise((r) => setTimeout(r, 500));

    const mockUsdRate = options.from === "EUR" ? 1.08 : options.from === "ETH" ? 2800 : 1;
    const mockPtfPrice = 1.50; // prix PTF simulé en USD
    const ptfAmount = (amount * mockUsdRate * 0.995) / mockPtfPrice;

    console.log(
      "\n" +
        chalk.bold("Estimation de conversion\n") +
        `  ${amount} ${options.from} → ${(amount * mockUsdRate).toFixed(2)} USD → ${ptfAmount.toFixed(6)} PTF\n` +
        chalk.dim(`  Taux : 1 ${options.from} = ${mockUsdRate.toFixed(4)} USD\n`) +
        chalk.dim(`  Prix PTF : ~${mockPtfPrice.toFixed(2)} USD (taux marché simulé)\n`) +
        chalk.dim("  Frais de conversion : ~0.5%\n") +
        chalk.yellow("  ⚠ Mode offline — taux simulé. Taux garanti 60s en mode réel.")
    );
  });
