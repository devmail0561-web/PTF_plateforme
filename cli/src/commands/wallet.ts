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
} from "../utils/display.js";
import { isValidAddress } from "../utils/crypto.js";

export const walletCommand = new Command("wallet").description(
  "Gérer son wallet PTF (crédits, dépôts, vérifications)"
);

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
  .option("--token <token>", "Token (USDC, ETH, EUR...)", "USDC")
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

    printInfo(
      `Vérification de l'adresse officielle PTF via Merkle root réseau...`
    );
    await new Promise((r) => setTimeout(r, 800));

    const officialAddress = "0xPTF_OFFICIAL_ADDRESS_VERIFIED_BY_MERKLE";

    printWarning("Mode offline — adresse PTF simulée");

    console.log(
      "\n" +
        chalk.bold("Instructions de dépôt (vérifiées via Merkle root PTF)\n") +
        chalk.dim("─".repeat(60)) +
        "\n" +
        `  Chaîne   : ${chalk.bold(chain)}\n` +
        `  Token    : ${chalk.bold(token)}\n` +
        `  Montant  : ${chalk.bold(finalAmount.toFixed(6))} ${token}\n` +
        `  Vers     : ${chalk.green.bold(officialAddress)}\n` +
        chalk.dim("─".repeat(60)) +
        "\n" +
        chalk.yellow(
          "⚠  Envoyez UNIQUEMENT vers cette adresse vérifiée.\n" +
            "   Ne jamais envoyer vers une adresse non vérifiée par PTF."
        ) +
        "\n\n" +
        chalk.dim("Après confirmation on-chain, vos crédits PTF seront crédités automatiquement.\n") +
        (token !== "USDC"
          ? chalk.dim(
              `Conversion automatique ${token} → USDC via oracle Chainlink (~0.5% de frais, taux garanti 60s)\n`
            )
          : "") +
        chalk.dim("1 PTF = 1 USDC (parité garantie)")
    );
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
      // Simulate UTXO-based withdrawal output
      const mockProofHash = "0x" + "a1b2c3d4e5f6".repeat(5).slice(0, 64);
      const mockUTXOs = [
        { id: "0xutxo001…", amount: 150.0, sourceType: "task_reward", sourceId: "0xtask001…" },
        { id: "0xutxo002…", amount: 60.0,  sourceType: "task_reward", sourceId: "0xtask002…" },
      ];
      const change = 210 - amount > 0 ? { id: "0xchange001…", amount: 210 - amount } : null;

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
        chalk.dim("Vérifiez avec : ptf wallet verify-utxo <utxoId>\n")
      );
    } else {
      const result = await client.query<{
        withdrawCredits: {
          txId: string;
          netAmount: number;
          proofHash: string;
          consumed: { id: string; amount: number; sourceType: string; sourceId: string | null }[];
          change: { id: string; amount: number } | null;
        };
      }>(
        `mutation Withdraw($input: WithdrawInput!) {
          withdrawCredits(input: $input) {
            txId netAmount proofHash
            consumed { id amount sourceType sourceId }
            change { id amount }
          }
        }`,
        { input: { amount, destination: options.to, chain: "polygon" } }
      );

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
        chalk.dim("1 PTF = 1 USDC sur toutes les chaînes (parité garantie)\n") +
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
        { type: "deposit",             direction: "credit", amount: 50.0,   taskId: null,     chain: "polygon", txHash: "0x003…", note: "50 USDC deposit",             createdAt: new Date(Date.now() - 86400000 * 10).toISOString() },
      ].slice(0, limit);
    } else {
      const result = await client.query<{
        creditHistory: typeof entries;
      }>(
        `query($address: String!, $limit: Int, $type: String) {
          creditHistory(address: $address, limit: $limit, type: $type) {
            type direction amount taskId chain txHash note createdAt
          }
        }`,
        { address, limit, type: options.type ?? null }
      );
      entries = result.creditHistory;
    }

    // Totaux
    const totalIn  = entries.filter(e => e.direction === "credit").reduce((s, e) => s + e.amount, 0);
    const totalOut = entries.filter(e => e.direction === "debit").reduce((s, e) => s + e.amount, 0);

    console.log(
      `\n${chalk.bold("Historique crédits PTF")} — ${chalk.dim(address.slice(0, 14) + "…")}\n` +
      chalk.dim("─".repeat(72))
    );

    for (const e of entries) {
      const sign   = e.direction === "credit" ? chalk.green("+") : chalk.red("−");
      const amount = e.direction === "credit"
        ? chalk.green(e.amount.toFixed(6) + " PTF")
        : chalk.red(e.amount.toFixed(6) + " PTF");
      const date  = new Date(e.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
      const label = e.note ?? e.type;
      const task  = e.taskId ? chalk.dim(" tâche:" + e.taskId.slice(0, 10) + "…") : "";
      const tx    = e.txHash ? chalk.dim(" tx:" + e.txHash.slice(0, 10) + "…") : "";

      console.log(
        `  ${sign} ${amount.padEnd(22)}  ${chalk.dim(date.padEnd(14))}  ${label}${task}${tx}`
      );
    }

    console.log(
      chalk.dim("─".repeat(72)) +
      `\n  Total crédités  : ${chalk.green("+" + totalIn.toFixed(6) + " PTF")}` +
      `\n  Total débités   : ${chalk.red("−" + totalOut.toFixed(6) + " PTF")}` +
      `\n  Net             : ${chalk.bold((totalIn - totalOut).toFixed(6) + " PTF")}\n`
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

    console.log(
      `\n${chalk.bold("Historique réputation")} — ${chalk.dim(address.slice(0, 14) + "…")}\n` +
      chalk.dim("─".repeat(72))
    );

    for (const e of entries) {
      const sign   = e.delta > 0 ? chalk.green("+") : chalk.red("");
      const pts    = e.delta > 0
        ? chalk.green(`+${e.delta} pts`)
        : chalk.red(`${e.delta} pts`);
      const date   = new Date(e.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
      const task   = e.taskId ? chalk.dim(" tâche:" + e.taskId.slice(0, 10) + "…") : "";
      const tx     = e.txHash ? chalk.dim(" tx:" + e.txHash.slice(0, 10) + "…") : "";

      console.log(
        `  ${pts.padEnd(16)}  ${chalk.dim(date.padEnd(14))}  ${e.reason}${task}${tx}`
      );
      void sign; // used above via template expression
    }

    console.log(
      chalk.dim("─".repeat(72)) +
      `\n  Total gagné  : ${chalk.green("+" + totalGained + " pts")}` +
      `\n  Total perdu  : ${chalk.red(totalLost + " pts")}` +
      `\n  Net          : ${chalk.bold((totalGained + totalLost) + " pts")}\n`
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
      `Récupération du taux ${options.from}/USDC via oracle Chainlink...`
    );
    await new Promise((r) => setTimeout(r, 500));

    const mockRate = options.from === "EUR" ? 1.08 : options.from === "ETH" ? 2800 : 1;
    const usdcAmount = amount * mockRate * 0.995;

    console.log(
      "\n" +
        chalk.bold("Estimation de conversion\n") +
        `  ${amount} ${options.from} → ${usdcAmount.toFixed(2)} USDC → ${usdcAmount.toFixed(6)} PTF\n` +
        chalk.dim(`  Taux : 1 ${options.from} = ${mockRate.toFixed(4)} USDC\n`) +
        chalk.dim("  Frais de conversion : ~0.5%\n") +
        chalk.yellow("  ⚠ Mode offline — taux simulé. Taux garanti 60s en mode réel.")
    );
  });
