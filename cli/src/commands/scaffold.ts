import { Command } from "commander";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { ARCHITECTURE_TEMPLATE } from "../templates/architecture.template.js";
import { PLAN_ACTION_TEMPLATE } from "../templates/plan-action.template.js";
import { printSuccess, printWarning, printInfo } from "../utils/display.js";

function replacePlaceholders(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (t, [k, v]) => t.replaceAll(`{{${k}}}`, v),
    template
  );
}

export const scaffoldCommand = new Command("scaffold")
  .description("Générer les templates PTF vides (ARCHITECTURE.md, PLAN_ACTION.md)")
  .option("-n, --name <name>", "Nom du projet")
  .option("--github <owner/repo>", "Repo GitHub (pré-remplit certains champs)")
  .option("-o, --output <dir>", "Répertoire de sortie (défaut: répertoire courant)")
  .action(async (options) => {
    const outputDir = options.output ?? process.cwd();

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const archPath = join(outputDir, "ARCHITECTURE.md");
    const planPath = join(outputDir, "PLAN_ACTION.md");

    if (existsSync(archPath) || existsSync(planPath)) {
      printWarning(
        "Des fichiers MD existent déjà dans ce répertoire. Utilisez --output pour choisir un autre dossier."
      );

      const { default: inquirer } = await import("inquirer");
      const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
        {
          type: "confirm",
          name: "overwrite",
          message: "Écraser les fichiers existants ?",
          default: false,
        },
      ]);
      if (!overwrite) {
        printInfo("Opération annulée.");
        return;
      }
    }

    const now = new Date().toISOString().split("T")[0];
    const projectName = options.name ?? "{{PROJECT_NAME}}";

    const vars: Record<string, string> = {
      PROJECT_NAME: projectName,
      DATE: now,
      PROJECT_CRYPTO_ID: "{{PROJECT_CRYPTO_ID}}",
      OWNER_WALLET: "{{OWNER_WALLET}}",
      REWARD_MODE: "free",
      LANGUAGE_1: "TypeScript",
      FRAMEWORK_1: "Node.js",
      RUNTIME_VERSION: "Node.js 18+",
      DB_TYPE: "PostgreSQL",
      CHAIN: "polygon",
      PRIMARY_LANGUAGE: "TypeScript",
      ALLOWED_LANGUAGE_1: "TypeScript",
      LANGUAGE_VERSION: "5.0+",
    };

    if (options.github) {
      const [owner, repo] = options.github.split("/");
      if (owner && repo && !options.name) {
        vars["PROJECT_NAME"] = repo;
      }
    }

    writeFileSync(archPath, replacePlaceholders(ARCHITECTURE_TEMPLATE, vars), "utf-8");
    writeFileSync(planPath, replacePlaceholders(PLAN_ACTION_TEMPLATE, vars), "utf-8");

    printSuccess(`ARCHITECTURE.md créé dans ${outputDir}`);
    printSuccess(`PLAN_ACTION.md créé dans ${outputDir}`);

    console.log(
      "\n" +
        chalk.bold("Prochaines étapes :") +
        "\n" +
        chalk.dim("  1. Remplissez les {{PLACEHOLDERS}} dans les deux fichiers") +
        "\n" +
        chalk.dim("  2. Validez le format : ") +
        chalk.cyan("ptf validate-docs") +
        "\n" +
        chalk.dim("  3. Initialisez le projet : ") +
        chalk.cyan(`ptf init --name "${vars["PROJECT_NAME"]}" --type public`) +
        "\n" +
        chalk.dim("  4. Générez les tâches : ") +
        chalk.cyan("ptf generate --project <projectId>")
    );
  });
