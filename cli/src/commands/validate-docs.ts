import { Command } from "commander";
import { join } from "path";
import { existsSync } from "fs";
import chalk from "chalk";
import {
  validateBothDocs,
  validateArchitectureFile,
  validatePlanFile,
} from "../utils/docs-validator.js";
import { printValidationResult, printInfo } from "../utils/display.js";

export const validateDocsCommand = new Command("validate-docs")
  .description("Valider le format PTF de ARCHITECTURE.md et PLAN_ACTION.md")
  .option(
    "--architecture <path>",
    "Chemin vers ARCHITECTURE.md",
    "ARCHITECTURE.md"
  )
  .option("--plan <path>", "Chemin vers PLAN_ACTION.md", "PLAN_ACTION.md")
  .option("--arch-only", "Valider uniquement ARCHITECTURE.md")
  .option("--plan-only", "Valider uniquement PLAN_ACTION.md")
  .option("--auto", "Mode non-bloquant (warnings seulement pour le premier projet)")
  .action((options) => {
    const cwd = process.cwd();
    const archPath = options.architecture.startsWith("/")
      ? options.architecture
      : join(cwd, options.architecture);
    const planPath = options.plan.startsWith("/")
      ? options.plan
      : join(cwd, options.plan);

    if (options.archOnly) {
      const { errors, sectionResults } = validateArchitectureFile(archPath);
      const hardErrors = errors.filter((e) => e.type === "error");
      const warnings = errors.filter((e) => e.type === "warning");
      printValidationResult({
        valid: hardErrors.length === 0,
        errors: hardErrors,
        warnings,
        summary: { architecture: sectionResults, plan: [] },
      });
      if (hardErrors.length > 0 && !options.auto) process.exit(1);
      return;
    }

    if (options.planOnly) {
      const { errors, sectionResults } = validatePlanFile(planPath);
      const hardErrors = errors.filter((e) => e.type === "error");
      const warnings = errors.filter((e) => e.type === "warning");
      printValidationResult({
        valid: hardErrors.length === 0,
        errors: hardErrors,
        warnings,
        summary: { architecture: [], plan: sectionResults },
      });
      if (hardErrors.length > 0 && !options.auto) process.exit(1);
      return;
    }

    if (!existsSync(archPath)) {
      console.error(
        chalk.red(`Fichier non trouvé : ${archPath}\n`) +
          chalk.dim(
            "Générez les templates avec : ptf scaffold\n" +
              "Ou spécifiez le chemin : ptf validate-docs --architecture <path>"
          )
      );
      process.exit(1);
    }

    if (!existsSync(planPath)) {
      console.error(
        chalk.red(`Fichier non trouvé : ${planPath}\n`) +
          chalk.dim("Générez les templates avec : ptf scaffold")
      );
      process.exit(1);
    }

    printInfo(`Validation de ${chalk.cyan(archPath)} et ${chalk.cyan(planPath)}...`);

    const result = validateBothDocs(archPath, planPath);
    printValidationResult(result);

    if (!result.valid && !options.auto) {
      console.log(
        "\n" +
          chalk.dim(
            "Corrigez les erreurs, puis relancez ptf validate-docs.\n" +
              "Pour obtenir de l'aide sur les corrections : " +
              chalk.cyan("ptf fix-docs")
          )
      );
      process.exit(1);
    }

    if (result.valid) {
      console.log(
        "\n" +
          chalk.dim("Prochaine étape : ") +
          chalk.cyan("ptf init --name <nom> --type public|private")
      );
    }
  });
