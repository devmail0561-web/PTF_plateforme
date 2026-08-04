import { Command } from "commander";
import chalk from "chalk";
import { requireAuth } from "../utils/config.js";
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

      const userConfig = requireAuth();
      const client = new PtfApiClient(userConfig);

      if (client.isOffline()) {
        printOfflineBanner();
        printWarning("Signalement non envoyé — reconnectez-vous et relancez.");
        return;
      }

      // La mutation reportDeveloper sera disponible dans une prochaine version.
      // En attendant, le signalement est enregistré localement et affiché pour
      // que l'utilisateur puisse le soumettre manuellement.
      printWarning(
        "Le système de signalement automatique sera disponible dans une prochaine version.\n" +
        chalk.dim("En attendant, copiez ce rapport et envoyez-le à : support@ptf.dev")
      );
      console.log(
        "\n" +
        chalk.dim("  Développeur : ") + options.dev + "\n" +
        chalk.dim("  Raison      : ") + options.reason + "\n" +
        chalk.dim("  Tâche       : ") + options.task + "\n" +
        chalk.dim("  Preuve      : ") + options.evidence + "\n"
      );
    }
  );
