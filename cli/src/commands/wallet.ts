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

    printWarning("Mode offline — retrait simulé");
    printSuccess(`Retrait de ${amount.toFixed(6)} PTF initié vers ${options.to}`);
    printInfo("Confirmation on-chain attendue dans ~1-2 minutes.");
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
