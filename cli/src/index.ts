import { createInterface } from "node:readline";
import { Command } from "commander";
import { scaffoldCommand } from "./commands/scaffold.js";
import { validateDocsCommand } from "./commands/validate-docs.js";
import { initCommand } from "./commands/init.js";
import { configCommand } from "./commands/config.js";
import { generateCommand } from "./commands/generate.js";
import { tasksCommand } from "./commands/tasks.js";
import { taskCommand } from "./commands/task.js";
import { walletCommand } from "./commands/wallet.js";
import { submitCommand } from "./commands/submit.js";
import { commitCommand } from "./commands/commit.js";
import { statusCommand } from "./commands/status.js";
import { authCommand } from "./commands/auth.js";
import {
  projectsCommand,
  projectCommand,
  contributorsCommand,
} from "./commands/projects.js";
import { reportCommand } from "./commands/report.js";
import chalk from "chalk";

function buildProgram(silent = false): Command {
  const prog = new Command("ptf")
    .description(
      "PTF — Pay-Task Framework\nÉcosystème cryptographique décentralisé de tâches rémunérées"
    )
    .version("0.1.0")
    .exitOverride()
    .configureOutput({
      writeOut: (str) => process.stdout.write(str),
      writeErr: silent ? () => {} : (str) => process.stderr.write(str),
    });

  // Standalone (offline)
  prog.addCommand(scaffoldCommand);
  prog.addCommand(validateDocsCommand);
  prog.addCommand(initCommand);
  prog.addCommand(configCommand);

  // Réseau (mock offline)
  prog.addCommand(generateCommand);
  prog.addCommand(tasksCommand);
  prog.addCommand(taskCommand);
  prog.addCommand(walletCommand);
  prog.addCommand(submitCommand);
  prog.addCommand(commitCommand);
  prog.addCommand(statusCommand);
  prog.addCommand(authCommand);
  prog.addCommand(projectsCommand);
  prog.addCommand(projectCommand);
  prog.addCommand(contributorsCommand);
  prog.addCommand(reportCommand);

  prog
    .command("describe")
    .description(
      "Interview guidé pour générer ARCHITECTURE.md + PLAN_ACTION.md (Mode 2 interactif)"
    )
    .action(async () => {
      const { printInfo, printWarning } = await import("./utils/display.js");
      printWarning(
        "ptf describe (DocumentGeneratorService) sera disponible dans la prochaine version.\n" +
          "Pour l'instant, utilisez : ptf scaffold → remplissez les templates manuellement"
      );
      printInfo(
        "Mode 3 disponible maintenant : /ptf-architect dans votre éditeur IA"
      );
    });

  prog
    .command("fix-docs")
    .description("Corrections guidées après ptf validate-docs")
    .action(async () => {
      const { printWarning } = await import("./utils/display.js");
      printWarning(
        "ptf fix-docs sera disponible dans la prochaine version.\n" +
          "En attendant : ptf validate-docs affiche les erreurs à corriger manuellement."
      );
    });

  const syncCommand = new Command("sync").description(
    "Gérer la synchronisation du repo temporaire PTF (Cas 3)"
  );

  syncCommand
    .command("status")
    .description("État de la sync du repo temporaire")
    .option("--project <id>", "ID du projet")
    .action(async (opts: { project?: string }) => {
      const { printInfo, printWarning } = await import("./utils/display.js");
      printWarning("Mode offline — sync simulée");
      printInfo(`Statut sync projet ${opts.project ?? "courant"} : synced`);
    });

  syncCommand
    .command("pull")
    .description("Déclencher une sync manuelle")
    .option("--project <id>", "ID du projet")
    .action(async (opts: { project?: string }) => {
      const { printInfo, printWarning } = await import("./utils/display.js");
      printWarning("Mode offline — sync simulée");
      printInfo(`Sync manuelle déclenchée pour le projet ${opts.project ?? "courant"}`);
    });

  syncCommand
    .command("pending")
    .description("Lister les soumissions en attente de sync")
    .option("--project <id>", "ID du projet")
    .action(async (opts: { project?: string }) => {
      const { printInfo } = await import("./utils/display.js");
      printInfo(
        `Aucune soumission en attente pour le projet ${opts.project ?? "courant"}`
      );
    });

  prog.addCommand(syncCommand);

  return prog;
}

async function startRepl(): Promise<void> {
  const { printBanner } = await import("./utils/display.js");
  printBanner("0.1.0");

  console.log(
    chalk.dim("   Tapez une commande (ex: tasks, wallet, help) ou ") +
    chalk.bold("exit") +
    chalk.dim(" pour quitter.\n")
  );

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan.bold("ptf") + chalk.dim(" › "),
    terminal: true,
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input === "exit" || input === "quit") {
      console.log(chalk.dim("\n   Au revoir.\n"));
      rl.close();
      process.exit(0);
    }

    if (input === "clear") {
      console.clear();
      rl.prompt();
      return;
    }

    const argv = ["node", "ptf", ...input.split(/\s+/)];

    try {
      await buildProgram(true).parseAsync(argv);
    } catch (err: unknown) {
      const code = err instanceof Error && "code" in err
        ? (err as { code: string }).code
        : undefined;
      if (code === "commander.helpDisplayed" || code === "commander.version") {
        // help/version already printed
      } else if (code === "commander.unknownCommand" || code === "commander.unknownOption" || code === "commander.invalidArgument") {
        console.log(chalk.red("  ✗") + "  Commande inconnue : " + chalk.bold(input));
        console.log(chalk.dim("     Tapez help pour voir les commandes disponibles."));
      } else if (err instanceof Error) {
        console.log(chalk.red("  ✗") + "  " + err.message);
      }
    }

    console.log();
    rl.prompt();
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

// If invoked with arguments (e.g. `ptf tasks`), run one-shot mode
if (process.argv.length > 2) {
  try {
    await buildProgram().parseAsync(process.argv);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err) {
      const code = (err as { code: string }).code;
      if (code !== "commander.helpDisplayed" && code !== "commander.version") {
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }
} else {
  await startRepl();
}
