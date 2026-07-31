import { program, Command } from "commander";
import { scaffoldCommand } from "./commands/scaffold.js";
import { validateDocsCommand } from "./commands/validate-docs.js";
import { initCommand } from "./commands/init.js";
import { configCommand } from "./commands/config.js";
import { generateCommand } from "./commands/generate.js";
import { tasksCommand } from "./commands/tasks.js";
import { taskCommand } from "./commands/task.js";
import { walletCommand } from "./commands/wallet.js";
import { submitCommand } from "./commands/submit.js";
import { authCommand } from "./commands/auth.js";
import {
  projectsCommand,
  projectCommand,
  contributorsCommand,
} from "./commands/projects.js";
import { reportCommand } from "./commands/report.js";

program
  .name("ptf")
  .description(
    "PTF — Pay-Task Framework\nÉcosystème cryptographique décentralisé de tâches rémunérées"
  )
  .version("0.1.0");

// Standalone (offline)
program.addCommand(scaffoldCommand);
program.addCommand(validateDocsCommand);
program.addCommand(initCommand);
program.addCommand(configCommand);

// Réseau (mock offline)
program.addCommand(generateCommand);
program.addCommand(tasksCommand);
program.addCommand(taskCommand);
program.addCommand(walletCommand);
program.addCommand(submitCommand);
program.addCommand(authCommand);
program.addCommand(projectsCommand);
program.addCommand(projectCommand);
program.addCommand(contributorsCommand);
program.addCommand(reportCommand);

// Alias status
program
  .command("status")
  .description("Afficher le statut du projet et du wallet courants")
  .action(async () => {
    const { loadProjectConfig, loadUserConfig } = await import(
      "./utils/config.js"
    );
    const { printProjectConfig, printInfo } = await import(
      "./utils/display.js"
    );

    const projectConfig = loadProjectConfig();
    const userConfig = loadUserConfig();

    if (projectConfig) {
      printProjectConfig(projectConfig);
    } else {
      printInfo("Pas de projet PTF dans ce répertoire.");
    }

    if (userConfig.walletAddress) {
      printInfo(`Wallet : ${userConfig.walletAddress} (${userConfig.walletChain})`);
    } else {
      printInfo("Aucun wallet configuré. Lancez : ptf auth login");
    }
  });

program
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

program
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

program.addCommand(syncCommand);

program.parse();
