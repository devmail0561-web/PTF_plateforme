import { Command } from "commander";
import chalk from "chalk";
import { existsSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { loadUserConfig, requireAuth } from "../utils/config.js";
import { PtfApiClient } from "../utils/api.js";
import { buildTaskTemplate } from "../utils/template.js";
import { trackTask, getTrackedTaskByProject, untrackTask } from "../utils/tracker.js";
import { gitCmd, shellEscape } from "../utils/shell.js";
import {
  printTask,
  printError,
  printInfo,
  printSuccess,
  printWarning,
  printOfflineBanner,
  formatDeadlineCountdown,
} from "../utils/display.js";
import { hashConditions, isValidAddress } from "../utils/crypto.js";

export const taskCommand = new Command("task").description(
  "Opérations sur une tâche spécifique"
);

taskCommand
  .command("show <taskId>")
  .description("Afficher le détail d'une tâche (conditions, pénalités, reward)")
  .action(async (taskId: string) => {
    const userConfig = loadUserConfig();
    const client = new PtfApiClient(userConfig);

    const { task, offline } = await client.getTask(taskId);
    if (offline) printOfflineBanner();

    if (!task) {
      printError(`Tâche non trouvée : ${taskId}`);
      return;
    }

    if (task.rewardMode === "paid" && userConfig.walletAddress) {
      const { status: walletStatus } = await client.getWalletStatus(userConfig.walletAddress);
      if (walletStatus.ptfBalance < 10) {
        printWarning(
          `Solde PTF faible (${walletStatus.ptfBalance} PTF). Minimum 10 PTF requis pour les projets paid.\n` +
            chalk.dim("Rechargez via votre service tiers puis reconnectez votre wallet PTF.")
        );
      }
    }

    printTask(task, true);

    const { printSectionHeader } = await import("../utils/display.js");
    printSectionHeader("Comment soumettre");
    console.log(
      "   " + chalk.dim("$ ") + chalk.cyan("ptf submit") +
      chalk.dim("  — branche et commit auto-détectés") + "\n\n" +
      "   " + chalk.bold("Après soumission") + "\n" +
      "   " + chalk.dim("1.") + " Validation automatique (tests, lint)" + "\n" +
      "   " + chalk.dim("2.") + " Peer review (3 experts ≥ 2000 pts)" + "\n" +
      "   " + chalk.dim("3.") + " Validation client (auto après 72h)" + "\n" +
      "   " + chalk.dim("4.") + " Reward libéré"
    );
  });

taskCommand
  .command("template <taskId>")
  .description("Afficher/exporter le template de soumission (format attendu, contraintes, vérification)")
  .option("-o, --output <file>", "Écrire le template dans un fichier")
  .option("-c, --copy", "Copier le template dans le presse-papier")
  .action(async (taskId: string, opts: { output?: string; copy?: boolean }) => {
    const userConfig = loadUserConfig();
    const client = new PtfApiClient(userConfig);

    const { task, offline } = await client.getTask(taskId);
    if (offline) printOfflineBanner();

    if (!task) {
      printError(`Tâche non trouvée : ${taskId}`);
      return;
    }

    const template = buildTaskTemplate(task);

    if (opts.output) {
      writeFileSync(opts.output, template, "utf-8");
      printSuccess(`Template écrit dans ${opts.output}`);
    } else if (opts.copy) {
      const cmd = process.platform === "darwin"
        ? "pbcopy"
        : process.platform === "win32"
          ? "clip"
          : "xclip -selection clipboard";
      execSync(cmd, { input: template });
      printSuccess("Template copié dans le presse-papier");
    } else {
      console.log(template);
    }
  });

taskCommand
  .command("claim <taskId>")
  .description("Réclamer une tâche (vérification wallet + conditions + confirmation)")
  .action(async (taskId: string) => {
    const userConfig = requireAuth();
    const client = new PtfApiClient(userConfig);

    const { task, offline } = await client.getTask(taskId);
    if (offline) printOfflineBanner();

    if (!task) {
      printError(`Tâche non trouvée : ${taskId}`);
      return;
    }

    if (task.status !== "open") {
      printError(
        `Cette tâche n'est pas disponible (statut : ${task.status}).\n` +
          chalk.dim("Cherchez d'autres tâches : ptf tasks list")
      );
      return;
    }

    if (!userConfig.walletAddress) {
      printError(
        "Aucun wallet configuré. Impossible de réclamer une tâche sans wallet.\n" +
          chalk.dim("Configurez votre wallet : ptf config set-wallet <address>")
      );
      return;
    }
    const walletAddress = userConfig.walletAddress;

    if (!isValidAddress(walletAddress)) {
      printError(`Adresse wallet invalide : ${walletAddress}`);
      return;
    }

    if (task.rewardMode === "paid") {
      const { status } = await client.getWalletStatus(walletAddress);
      if (status.ptfBalance < 10) {
        printError(
          `Solde PTF insuffisant : ${status.ptfBalance} PTF (minimum 10 PTF requis pour les projets paid).\n` +
            chalk.dim("Rechargez votre solde via votre service tiers et liez votre wallet PTF depuis ce service.")
        );
        return;
      }
    }

    const { default: inquirer } = await import("inquirer");

    const deadline = new Date(Date.now() + parseDuration(task.duration)).toISOString();

    const isPaid = task.rewardMode === "paid";
    const projectMode = isPaid ? "Projet rémunéré (paid)" : "Projet public (free — réputation)";

    const { printSectionHeader: printSec } = await import("../utils/display.js");
    printSec(`Conditions — ${projectMode}`);

    const row = (label: string, value: string) =>
      console.log("   " + chalk.dim(label.padEnd(18)) + value);

    row("Durée",    `${task.duration}  ${chalk.dim("→ " + new Date(deadline).toLocaleDateString("fr-FR"))}`);
    row("Reward",   isPaid
      ? chalk.green.bold(task.reward!.amount + " " + task.reward!.token) + chalk.dim("  (libéré à validation)")
      : chalk.cyan("+" + (task.reputationPoints ?? "?") + " pts rep") + chalk.dim("  (free)"));
    if (isPaid) row("Garantie", chalk.yellow("10 PTF soft-locked"));
    row("Langues",  task.constraints.languages.join(", "));
    row("Couverture", `> ${task.constraints.minTestCoverage}%`);

    console.log("\n   " + chalk.dim("Pénalités"));
    const pen = (label: string, p: { credits?: number; reputation: number }) => {
      const ptf = isPaid && p.credits ? chalk.red(`-${p.credits} PTF`) + chalk.dim("  ") : "";
      console.log("   " + chalk.dim("  " + label.padEnd(18)) + ptf + chalk.red(`-${p.reputation} pts rép.`));
    };
    pen("Retard",           task.punishments.lateDelivery);
    pen("Bug critique",     task.punishments.criticalBug);
    pen("Bug mineur",       task.punishments.nonCriticalBug);
    pen("Code malveillant", task.punishments.maliciousCode);
    console.log();

    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        message: "Acceptez-vous ces conditions ?",
        default: false,
      },
    ]);

    if (!confirm) {
      printInfo("Claim annulé.");
      return;
    }

    const conditionsHash = hashConditions({
      taskId,
      duration: task.duration,
      reward: task.reward ?? null,
      punishments: task.punishments,
      constraints: task.constraints,
      verificationSteps: task.verificationSteps,
    });

    const { default: ora } = await import("ora");
    const spinner = ora("Signature EIP-712 et enregistrement on-chain...").start();

    const { result, offline: claimOffline } = await client.claimTask(taskId, walletAddress, conditionsHash);
    await new Promise((r) => setTimeout(r, 800));
    spinner.stop();

    if (claimOffline) {
      printOfflineBanner();
      printWarning("Claim en mode offline — non enregistré. Reconnectez-vous pour confirmer.");
      return;
    }

    if (result.conditionsHash.toLowerCase() !== conditionsHash.toLowerCase()) {
      printError("Les conditions ont changé entre la consultation et le claim. Abandon pour sécurité.");
      printInfo(`Hash local    : ${conditionsHash.slice(0, 16)}...`);
      printInfo(`Hash serveur  : ${result.conditionsHash.slice(0, 16)}...`);
      return;
    }

    // --- Setup repo & branch ---
    const projectId = task.projectId;
    const branch = `ptf/${taskId}`;
    let repoPath = process.cwd();
    let repoUrl: string | null = null;

    // Check if already in project repo
    const existingProject = getTrackedTaskByProject(projectId);
    if (existingProject) {
      printError(
        `Vous avez déjà une tâche active sur ce projet : ${existingProject.taskId}\n` +
          chalk.dim("Soumettez-la d'abord (ptf submit) ou abandonnez-la (ptf task cancel).")
      );
      return;
    }

    // Detect if we're in a git repo for this project
    let inProjectRepo = false;
    try {
      const remoteUrl = execSync("git remote get-url origin", { encoding: "utf-8" }).trim();
      // If project has a known repo URL, match it
      // For now, assume we're in the right repo if git is present
      inProjectRepo = true;
      repoUrl = remoteUrl;
    } catch {
      inProjectRepo = false;
    }

    if (!inProjectRepo) {
      // Try to clone the project repo
      // Look for repo URL from task/project metadata (in full API this comes from the project)
      const { projects } = await client.getProjects({ type: "all" });
      const project = projects.find((p) => p.projectId === projectId);
      const projectRepoUrl = project?.repository ?? null;

      if (!projectRepoUrl) {
        printError(
          "Impossible de trouver le dépôt du projet.\n" +
            chalk.dim("Clonez manuellement le repo, placez-vous dedans, puis relancez ptf task claim.")
        );
        return;
      }

      repoUrl = projectRepoUrl;
      const repoName = projectRepoUrl.replace(/\/+$/, "").split("/").pop()?.replace(".git", "") || projectId;
      repoPath = join(process.cwd(), repoName);

      if (existsSync(repoPath)) {
        printInfo(`Répertoire ${repoName}/ existant détecté, utilisation en cours...`);
      } else {
        printInfo(`Clonage de ${projectRepoUrl}...`);
        execSync(`git clone ${shellEscape(projectRepoUrl)} ${shellEscape(repoName)}`, { stdio: "inherit" });
      }
    }

    // Create and switch to the task branch
    try {
      execSync(gitCmd(repoPath, `checkout -b ${shellEscape(branch)}`), { stdio: "pipe" });
      printSuccess(`Branche ${chalk.cyan(branch)} créée`);
    } catch {
      execSync(gitCmd(repoPath, `checkout ${shellEscape(branch)}`), { stdio: "pipe" });
      printInfo(`Branche ${chalk.cyan(branch)} existante, switch effectué`);
    }

    // Track the task (local + global)
    trackTask({
      taskId,
      projectId,
      branch,
      repoPath,
      repoUrl,
      claimedAt: new Date().toISOString(),
      commits: [],
      verifications: [],
      pushed: false,
    });

    printSuccess("Tâche réclamée");
    console.log(
      `   ${chalk.dim("ID         : ")}${chalk.dim(result.taskId.slice(0, 12) + "…")}\n` +
      `   ${chalk.dim("Branche    : ")}${chalk.cyan(branch)}\n` +
      `   ${chalk.dim("Deadline   : ")}${formatDeadlineCountdown(result.deadline)}\n` +
      `   ${chalk.dim("Conditions : ")}${chalk.dim(conditionsHash.slice(0, 16) + "…")} ${chalk.dim("(ancré on-chain)")}\n`
    );
    console.log(
      "   " + chalk.dim("Workflow : code → ") +
      chalk.cyan("git commit") + chalk.dim(" → ") +
      chalk.cyan("ptf submit")
    );
  });

taskCommand
  .command("cancel <taskId>")
  .description("Abandonner une tâche réclamée")
  .action(async (taskId: string) => {
    const userConfig = requireAuth();
    const client = new PtfApiClient(userConfig);

    const { task, offline } = await client.getTask(taskId);
    if (offline) printOfflineBanner();

    if (!task) {
      printError(`Tâche non trouvée : ${taskId}`);
      return;
    }

    if (!["claimed", "in_progress"].includes(task.status)) {
      printError(
        `Impossible d'annuler une tâche au statut : ${task.status}`
      );
      return;
    }

    let penaltyWarning = "";
    if (task.claimedAt && task.deadline) {
      const elapsed =
        Date.now() - new Date(task.claimedAt).getTime();
      const total =
        new Date(task.deadline).getTime() -
        new Date(task.claimedAt).getTime();
      const percentElapsed = (elapsed / total) * 100;

      if (percentElapsed > 50) {
        const isPaid = task.rewardMode === "paid";
        penaltyWarning =
          chalk.yellow(
            `\n⚠  Attention : ${percentElapsed.toFixed(0)}% de la durée est écoulée (> 50%).\n` +
              `   Pénalité lateDelivery appliquée : ` +
              (isPaid
                ? `-${task.punishments.lateDelivery.credits} crédits / `
                : "") +
              `-${task.punishments.lateDelivery.reputation} pts réputation\n`
          );
      }
    }

    console.log(
      `\nTâche à annuler : ${chalk.bold(task.title)}${penaltyWarning}`
    );

    const { default: inquirer } = await import("inquirer");
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        message: "Confirmer l'abandon de cette tâche ?",
        default: false,
      },
    ]);

    if (!confirm) {
      printInfo("Annulation avortée.");
      return;
    }

    const { default: ora } = await import("ora");
    const spinner = ora("Annulation en cours...").start();

    try {
      await client.query<{ cancelTask: boolean }>(
        `mutation CancelTask($taskId: String!) { cancelTask(taskId: $taskId) }`,
        { taskId }
      );
      spinner.succeed("Annulation confirmée.");
    } catch {
      spinner.fail("Échec de l'annulation côté serveur.");
      printError("Impossible d'annuler cette tâche — service non joignable.");
      return;
    }

    untrackTask(task.projectId);

    printSuccess(`Tâche ${taskId.slice(0, 12)}... abandonnée.`);
    if (task.rewardMode === "paid") {
      printInfo(
        "Le soft-lock de 10 PTF a été libéré — vos crédits sont à nouveau disponibles."
      );
    }
  });

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([dhm])$/);
  if (!match) return 30 * 86400000;
  const value = parseInt(match[1]);
  switch (match[2]) {
    case "d":
      return value * 86400000;
    case "h":
      return value * 3600000;
    case "m":
      return value * 60000;
    default:
      return 30 * 86400000;
  }
}
