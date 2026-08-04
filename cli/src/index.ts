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
import { printError } from "./utils/display.js";

function buildProgram(repl = false): Command {
  const prog = new Command("ptf")
    .description(
      "PTF — Pay-Task Framework\nÉcosystème cryptographique décentralisé de tâches rémunérées"
    )
    .version("0.1.0")
    .exitOverride()
    .configureOutput({
      writeOut: repl ? () => {} : (str) => process.stdout.write(str),
      writeErr: repl ? () => {} : (str) => process.stderr.write(str),
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

  // Propagate exitOverride and output config to all subcommands so they
  // throw instead of calling process.exit() — critical for REPL mode.
  function applyOverrides(cmd: Command): void {
    cmd.exitOverride();
    if (repl) {
      cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    }
    cmd.commands.forEach(applyOverrides);
  }
  prog.commands.forEach(applyOverrides);

  return prog;
}

function findCommand(root: Command, parts: string[]): Command | null {
  let cmd: Command = root;
  for (const p of parts) {
    const sub = cmd.commands.find((c) => c.name() === p || c.aliases().includes(p));
    if (!sub) break;
    cmd = sub;
  }
  return cmd === root ? null : cmd;
}

async function checkOnline(apiUrl: string | undefined): Promise<boolean> {
  if (!apiUrl) return false;
  try {
    const base = apiUrl.replace(/\/graphql$/, "");
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function startRepl(): Promise<void> {
  const { printBanner } = await import("./utils/display.js");
  const { loadUserConfig } = await import("./utils/config.js");
  const cfg = loadUserConfig();

  // Ping le backend pour déterminer l'état réel au démarrage
  const online = await checkOnline(cfg.ptfApiUrl);
  const authenticated = !!cfg.sessionToken && !cfg.sessionToken.startsWith("offline:");

  printBanner("0.1.0", { online, authenticated, walletAddress: cfg.walletAddress });

  // Le prompt REPL doit wrapper les codes ANSI entre \x01…\x02 (RL_PROMPT_START_IGNORE /
  // RL_PROMPT_END_IGNORE) pour que readline ignore leur longueur dans le calcul du curseur.
  // Sans ce wrapping, readline sous-estime la largeur visible et le curseur se décale.
  const ansi = (s: string) => `\x01${s}\x02`;

  // Voyant de statut : vert = online+auth, jaune = online sans auth, rouge = offline
  const dotColor = online && authenticated ? "\x1b[1;32m"   // vert
                 : online                  ? "\x1b[1;33m"   // jaune
                 :                           "\x1b[1;31m";  // rouge

  const PROMPT =
    ansi(dotColor)            +   // couleur voyant
    "●"                       +   // voyant
    ansi("\x1b[0m")           +   // reset
    " "                       +
    ansi("\x1b[1;35m")        +   // bold magenta
    ansi("\x1b[48;5;236m")    +   // fond code (gris sombre)
    " ptf "                   +   // texte "code" avec padding
    ansi("\x1b[0m")           +   // reset
    " "                       +
    ansi("\x1b[1;36m")        +   // cyan bold
    "❯"                       +
    ansi("\x1b[0m")           +   // reset
    " ";
  let rl: ReturnType<typeof createInterface>;
  let exiting = false;

  function createRl(): ReturnType<typeof createInterface> {
    const iface = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: PROMPT,
      terminal: true,
    });

    // readline avec terminal:true active déjà emitKeypressEvents sur stdin.
    // Ctrl+L n'est pas géré par readline Node.js — on l'intercepte ici.
    const onKeypress = (_ch: unknown, key: { ctrl?: boolean; name?: string } | undefined) => {
      if (key?.ctrl && key.name === "l") {
        process.stdout.write("\x1b[2J\x1b[H"); // clear + curseur en haut
        iface.prompt(true);
      }
    };
    process.stdin.on("keypress", onKeypress);


    iface.on("line", (line) => {
      const input = line.trim();

      if (!input) {
        iface.prompt();
        return;
      }

      if (input === "exit" || input === "quit") {
        exiting = true;
        console.log(chalk.dim("\n   Au revoir.\n"));
        iface.close();
        return;
      }

      if (input === "clear") {
        console.clear();
        iface.prompt();
        return;
      }

      (async () => {
        const argv = ["node", "ptf", ...input.split(/\s+/)];
        const prog = buildProgram(true);

        iface.close();

        try {
          await prog.parseAsync(argv);
        } catch (err: unknown) {
          const code = err instanceof Error && "code" in err
            ? (err as { code: string }).code
            : undefined;
          if (code === "commander.helpDisplayed" || code === "commander.version" || code === "commander.help") {
            // helpInformation() retourne le texte sans passer par writeOut/writeErr
            const parts = input.split(/\s+/).filter(Boolean);
            let cmd: import("commander").Command = prog;
            for (const p of parts.filter(p => !p.startsWith("-"))) {
              const sub = cmd.commands.find((c) => c.name() === p || c.aliases().includes(p));
              if (!sub) break;
              cmd = sub;
            }
            process.stdout.write(cmd.helpInformation());
          } else if (code === "commander.unknownCommand") {
            printError(
              "Commande inconnue : " + chalk.bold(input) + "\n" +
              chalk.dim("Tapez help pour voir les commandes disponibles.")
            );
          } else if (code === "commander.unknownOption") {
            printError(
              "Option inconnue dans : " + chalk.bold(input) + "\n" +
              chalk.dim("Tapez ") + chalk.cyan(input.split(/\s+/)[0] + " --help") + chalk.dim(" pour voir les options disponibles.")
            );
          } else if (code === "commander.invalidArgument") {
            printError(
              "Argument invalide : " + chalk.bold(input)
            );
          } else if (err instanceof Error) {
            printError(err.message);
          }
        }

        console.log();
        rl = createRl();
        rl.prompt();
      })();
    });

    iface.on("close", () => {
      process.stdin.removeListener("keypress", onKeypress);
      if (exiting) process.exit(0);
    });

    return iface;
  }

  rl = createRl();
  rl.prompt();
}

// If invoked with arguments (e.g. `ptf tasks`), run one-shot mode
if (process.argv.length > 2) {
  try {
    await buildProgram().parseAsync(process.argv);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err) {
      const code = (err as { code: string }).code;
      if (code !== "commander.helpDisplayed" && code !== "commander.version" && code !== "commander.help") {
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }
} else {
  await startRepl();
}
