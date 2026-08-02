import { Command } from "commander";
import chalk from "chalk";
import { loadUserConfig } from "../utils/config.js";
import { PtfApiClient } from "../utils/api.js";
import { printError, printSuccess, printInfo, printWarning, printOfflineBanner } from "../utils/display.js";

const VALID_REASONS = [
  "malicious_code",
  "plagiarism",
  "fraud",
  "harassment",
  "spam",
  "other",
];

export const reportCommand = new Command("report")
  .description("Signaler un comportement problématique d'un développeur")
  .requiredOption("--dev <address>", "Adresse wallet du développeur à signaler")
  .requiredOption(
    "--reason <reason>",
    `Raison : ${VALID_REASONS.join(" | ")}`
  )
  .requiredOption("--task <taskId>", "ID de la tâche concernée")
  .requiredOption("--evidence <text>", "Description de l'infraction (preuve)")
  .action(
    async (options: {
      dev: string;
      reason: string;
      task: string;
      evidence: string;
    }) => {
      if (!VALID_REASONS.includes(options.reason)) {
        printError(
          `Raison invalide : ${options.reason}\n` +
            `Raisons acceptées : ${VALID_REASONS.join(", ")}`
        );
        return;
      }

      console.log(
        "\n" +
          chalk.yellow.bold("Signalement PTF\n") +
          chalk.dim("─".repeat(50)) +
          "\n" +
          `  Développeur  : ${options.dev}\n` +
          `  Raison       : ${chalk.red(options.reason)}\n` +
          `  Tâche        : ${options.task}\n` +
          `  Preuve       : ${options.evidence}\n` +
          chalk.dim("─".repeat(50)) +
          "\n" +
          chalk.yellow(
            "⚠  Le signalement sera analysé automatiquement par PTF.\n" +
              "   En cas d'escalade, l'équipe PTF prendra la décision finale.\n" +
              "   Le bannissement est une décision exclusive de PTF (jamais du créateur)."
          )
      );

      const { default: inquirer } = await import("inquirer");
      const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
        {
          type: "confirm",
          name: "confirm",
          message: "Confirmer ce signalement ?",
          default: false,
        },
      ]);

      if (!confirm) {
        printInfo("Signalement annulé.");
        return;
      }

      const userConfig = loadUserConfig();
      const client = new PtfApiClient(userConfig);

      if (client.isOffline()) {
        printOfflineBanner();
        printWarning("Signalement non envoyé — reconnectez-vous et relancez.");
        return;
      }

      try {
        await client.query(
          `mutation Report($dev: String!, $reason: String!, $taskId: String!, $evidence: String!) {
            reportDeveloper(devAddress: $dev, reason: $reason, taskId: $taskId, evidence: $evidence)
          }`,
          { dev: options.dev, reason: options.reason, taskId: options.task, evidence: options.evidence }
        );
        printSuccess(
          "Signalement soumis. Il sera analysé par le ReportService PTF.\n" +
            chalk.dim(
              "L'historique du signalement sera enregistré on-chain de manière immuable."
            )
        );
      } catch (err) {
        printError(`Échec du signalement : ${(err as Error).message}`);
        return;
      }
    }
  );
