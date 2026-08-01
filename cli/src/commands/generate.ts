import { Command } from "commander";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { requireProjectConfig, loadUserConfig, saveDraftTasks } from "../utils/config.js";
import { validateBothDocs } from "../utils/docs-validator.js";
import { PtfApiClient } from "../utils/api.js";
import {
  printError,
  printInfo,
  printWarning,
  printEstimation,
  printOfflineBanner,
} from "../utils/display.js";

export const generateCommand = new Command("generate")
  .description(
    "Générer l'arbre de tâches depuis ARCHITECTURE.md + PLAN_ACTION.md (via LLM)"
  )
  .option(
    "--architecture <path>",
    "Chemin vers ARCHITECTURE.md",
    "ARCHITECTURE.md"
  )
  .option("--plan <path>", "Chemin vers PLAN_ACTION.md", "PLAN_ACTION.md")
  .option("--skip-validation", "Passer la validation des docs (non recommandé)")
  .action(async (options) => {
    const config = requireProjectConfig();
    const userConfig = loadUserConfig();

    const cwd = process.cwd();
    const archPath = options.architecture.startsWith("/")
      ? options.architecture
      : join(cwd, options.architecture);
    const planPath = options.plan.startsWith("/")
      ? options.plan
      : join(cwd, options.plan);

    if (!existsSync(archPath)) {
      printError(
        `ARCHITECTURE.md non trouvé : ${archPath}\n` +
          "Créez-le avec : ptf scaffold"
      );
      process.exit(1);
    }

    if (!existsSync(planPath)) {
      printError(
        `PLAN_ACTION.md non trouvé : ${planPath}\n` +
          "Créez-le avec : ptf scaffold"
      );
      process.exit(1);
    }

    if (!options.skipValidation) {
      printInfo("Validation des documents sources...");
      const validation = validateBothDocs(archPath, planPath);
      if (!validation.valid) {
        printError(
          `La validation des documents a échoué (${validation.errors.length} erreur(s)).\n` +
            "Corrigez les erreurs puis relancez ptf generate.\n" +
            "Détails : ptf validate-docs"
        );
        process.exit(1);
      }
      if (validation.warnings.length > 0) {
        printWarning(
          `${validation.warnings.length} avertissement(s) dans les documents sources.`
        );
      }
    }

    if (!userConfig.llmProvider) {
      printWarning(
        "Aucun fournisseur LLM configuré. Les tâches seront générées en mode offline (mocks).\n" +
          "Configurez un LLM : ptf config set-llm anthropic --key <votre-clé>"
      );
    }

    const archContent = readFileSync(archPath, "utf-8");
    const planContent = readFileSync(planPath, "utf-8");

    const client = new PtfApiClient(userConfig);
    const llmConfig = {
      provider: userConfig.llmProvider ?? "mock",
      apiKey: userConfig.llmApiKey,
      url: userConfig.llmUrl,
      model: userConfig.llmModel,
    };

    const { default: ora } = await import("ora");
    const spinner = ora("Génération des tâches en cours...").start();

    const { tasks, estimation, offline } = await client.generateTasks(
      config.projectId,
      archContent,
      planContent,
      llmConfig
    );

    spinner.stop();

    if (offline) {
      printOfflineBanner();
    }

    printEstimation(estimation);

    console.log("\n");
    const { default: inquirer } = await import("inquirer");
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        message:
          `Générer ${tasks.length} tâches` +
          (config.rewardMode === "paid"
            ? ` pour ${estimation.totalDeposit.toFixed(0)} USDC (reward + commission PTF) ?`
            : " (projet free — aucun paiement requis) ?"),
        default: true,
      },
    ]);

    if (!confirm) {
      printInfo("Génération annulée.");
      return;
    }

    saveDraftTasks(tasks);

    console.log(
      "\n" +
        chalk.green.bold(`✓ ${tasks.length} tâches générées et sauvegardées dans .ptf/tasks-draft.json\n`) +
        "\n" +
        chalk.dim("Prochaine étape : ") +
        chalk.cyan("ptf tasks preview") +
        chalk.dim(" — revoir les tâches avant publication")
    );
  });
