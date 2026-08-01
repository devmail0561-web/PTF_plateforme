import chalk from "chalk";
import type { PtfTask, ValidationResult, PtfProjectConfig, WalletStatus } from "../types.js";

export function printSuccess(msg: string): void {
  console.log(chalk.green("✓"), msg);
}

export function printError(msg: string): void {
  console.error(chalk.red("✗"), msg);
}

export function printWarning(msg: string): void {
  console.warn(chalk.yellow("⚠"), msg);
}

export function printInfo(msg: string): void {
  console.log(chalk.blue("ℹ"), msg);
}

export function printDim(msg: string): void {
  console.log(chalk.dim(msg));
}

export function printSectionHeader(title: string): void {
  console.log("\n" + chalk.bold.cyan("━━━ " + title + " ━━━"));
}

export function printOfflineBanner(): void {
  console.log(
    chalk.yellow.bold("\n[MODE OFFLINE — données simulées]\n") +
      chalk.dim("Le backend PTF n'est pas disponible. Les données affichées sont des mocks.\n")
  );
}

export function formatDeadlineCountdown(deadline: string): string {
  const now = Date.now();
  const end = new Date(deadline).getTime();
  const diff = end - now;

  if (diff <= 0) return chalk.red("EXPIRÉ");

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);

  if (days > 0) return chalk.yellow(`${days}j ${hours}h restants`);
  if (hours > 0) return chalk.red(`${hours}h ${mins}min restants`);
  return chalk.red.bold(`${mins}min restants`);
}

export function printTask(task: PtfTask, verbose = false): void {
  const priorityColor = {
    critical: chalk.red,
    high: chalk.yellow,
    medium: chalk.cyan,
    low: chalk.dim,
  }[task.priority] ?? chalk.white;

  const statusColor = {
    open: chalk.green,
    claimed: chalk.yellow,
    in_progress: chalk.blue,
    submitted: chalk.cyan,
    under_review: chalk.magenta,
    validated: chalk.green.bold,
    rejected: chalk.red,
    disputed: chalk.red.bold,
    expired: chalk.dim,
    blocked: chalk.dim,
  }[task.status] ?? chalk.white;

  console.log(
    `\n${chalk.bold(task.title)}\n` +
      `  ID       : ${chalk.dim(task.id)}\n` +
      `  Statut   : ${statusColor(task.status)}\n` +
      `  Priorité : ${priorityColor(task.priority)}\n` +
      `  Durée    : ${task.duration}` +
      (task.deadline ? ` → ${formatDeadlineCountdown(task.deadline)}` : "") +
      "\n" +
      (task.reward
        ? `  Reward   : ${chalk.green.bold(task.reward.amount + " " + task.reward.token)}\n`
        : `  Reward   : ${chalk.dim("aucun (open source)")}\n`) +
      `  Skills   : ${task.claimCriteria.requiredSkills?.join(", ") ?? "any"}`
  );

  if (verbose) {
    console.log(
      `\n  ${chalk.bold("Contexte :")}\n  ${task.context}\n` +
        `\n  ${chalk.bold("Objectif :")}\n  ${task.objective}\n` +
        `\n  ${chalk.bold("Livrable :")}\n  ${task.deliverable}\n` +
        `\n  ${chalk.bold("Hors-scope :")}\n  ${task.outOfScope.map((s) => "- " + s).join("\n  ")}`
    );

    if (task.verificationSteps.length > 0) {
      console.log(`\n  ${chalk.bold("Vérification automatique :")}`);
      task.verificationSteps.forEach((step) => {
        console.log(`  $ ${chalk.cyan(step.command)}`);
        if (step.expectedOutput)
          console.log(`    → ${chalk.dim(step.expectedOutput)}`);
      });
    }

    console.log(`\n  ${chalk.bold("Pénalités :")}`);
    const p = task.punishments;
    const fmtPunishment = (rule: { credits?: number; reputation: number }) =>
      [
        rule.credits !== undefined ? `${rule.credits} crédits` : null,
        `${rule.reputation} pts réputation`,
      ]
        .filter(Boolean)
        .join(" + ");

    console.log(
      `  Retard      : -${fmtPunishment(p.lateDelivery)}\n` +
        `  Bug critique: -${fmtPunishment(p.criticalBug)}\n` +
        `  Bug mineur  : -${fmtPunishment(p.nonCriticalBug)}\n` +
        `  Code malveillant: -${fmtPunishment(p.maliciousCode)}`
    );
  }
}

export function printProjectConfig(config: PtfProjectConfig): void {
  console.log(
    `\n${chalk.bold("Projet PTF")}\n` +
      `  Nom      : ${chalk.cyan(config.name)}\n` +
      `  ID       : ${chalk.dim(config.projectId)}\n` +
      `  Type     : ${config.type}\n` +
      `  Mode     : ${config.rewardMode === "paid" ? chalk.green("paid") : chalk.dim("free")}\n` +
      `  Chaîne   : ${config.chain}\n` +
      (config.github ? `  GitHub   : ${config.github}\n` : "") +
      (config.server ? `  Serveur  : ${config.server}\n` : "") +
      `  Créé le  : ${new Date(config.createdAt).toLocaleString()}`
  );
}

export function printValidationResult(result: ValidationResult): void {
  if (result.errors.length === 0 && result.warnings.length === 0) {
    printSuccess("Validation OK — tous les fichiers sont conformes au format PTF");
    return;
  }

  if (result.errors.length > 0) {
    console.log(chalk.red.bold(`\n${result.errors.length} erreur(s) :`));
    result.errors.forEach((e) => {
      console.log(
        `  ${chalk.red("✗")} [${e.file.toUpperCase()}] ${e.section} — ${e.message}` +
          (e.line ? ` (ligne ${e.line})` : "")
      );
    });
  }

  if (result.warnings.length > 0) {
    console.log(chalk.yellow(`\n${result.warnings.length} avertissement(s) :`));
    result.warnings.forEach((w) => {
      console.log(
        `  ${chalk.yellow("⚠")} [${w.file.toUpperCase()}] ${w.section} — ${w.message}`
      );
    });
  }

  const total = result.errors.length + result.warnings.length;
  console.log(
    `\n${result.valid ? chalk.green("✓ Validation OK") : chalk.red("✗ Validation échouée")} — ` +
      `${result.errors.length} erreur(s), ${result.warnings.length} avertissement(s)`
  );
}

export function printTable(headers: string[], rows: string[][]): void {
  if (rows.length === 0) {
    printDim("Aucun résultat.");
    return;
  }

  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );

  const line = colWidths.map((w) => "─".repeat(w + 2)).join("┬");
  const header = headers
    .map((h, i) => " " + chalk.bold(h.padEnd(colWidths[i])) + " ")
    .join("│");
  const sep = colWidths.map((w) => "─".repeat(w + 2)).join("┼");

  console.log("┌" + line + "┐");
  console.log("│" + header + "│");
  console.log("├" + sep + "┤");

  rows.forEach((row) => {
    const cells = headers
      .map((_, i) => " " + (row[i] ?? "").padEnd(colWidths[i]) + " ")
      .join("│");
    console.log("│" + cells + "│");
  });

  console.log("└" + colWidths.map((w) => "─".repeat(w + 2)).join("┴") + "┘");
}

export function printWalletStatus(ws: WalletStatus): void {
  console.log(chalk.bold("\n  Statut du wallet PTF"));
  const v = ws.verification;

  const check = (ok: boolean, warn = false) =>
    ok ? chalk.green("[OK]  ") : warn ? chalk.yellow("[WARN]") : chalk.red("[KO]  ");

  console.log(`  ${check(ws.meetsMinBalance)}Solde PTF      : ${ws.ptfBalance.toFixed(6)} PTF (min 10 requis pour paid)`);
  console.log(`  ${check(v.isValidAddress)}Format adresse : ${v.isValidAddress ? "valide (EIP-55)" : "INVALIDE"}`);
  console.log(`  ${check(v.isActivated)}Wallet activé  : ${v.isActivated ? "actif (transactions on-chain)" : "non activé"}`);
  console.log(`  ${check(v.hasGasFees, true)}Solde gas      : ${v.hasGasFees ? "suffisant" : "faible (risque d'échec on-chain)"}`);
  console.log(`  ${check(v.isNotBanned)}Statut         : ${v.isNotBanned ? "non banni" : "BANNI"}`);
  console.log(`  ${check(v.ownershipProven)}Ownership      : ${v.ownershipProven ? "prouvé (signature validée)" : "non prouvé"}`);
  console.log(`\n  Réputation : ${ws.reputationScore} pts — ${chalk.bold(ws.reputationLevel)}`);
  console.log(`  Crédits disponibles : ${ws.available.toFixed(6)} PTF`);
  if (ws.softLocked > 0) {
    console.log(`  Soft-locked : ${ws.softLocked.toFixed(6)} PTF (tâches actives)`);
  }
}

export function printEstimation(est: {
  taskCount: number;
  totalEffortHours: number;
  rewardPoolSuggested: number;
  commissionRate: number;
  commissionAmount: number;
  totalDeposit: number;
  byPhase?: { name: string; taskCount: number; rewardPool: number }[];
}): void {
  const line = "═".repeat(58);
  console.log("\n╔" + line + "╗");
  console.log("║  PTF — Estimation du projet" + " ".repeat(30) + "║");
  console.log("╠" + line + "╣");
  console.log(`║  Tâches estimées       : ~${est.taskCount} tâches` + " ".repeat(Math.max(0, 28 - String(est.taskCount).length)) + "║");
  console.log(`║  Effort total estimé   : ~${est.totalEffortHours} heures-dev` + " ".repeat(Math.max(0, 24 - String(est.totalEffortHours).length)) + "║");
  console.log(`║  Reward pool suggéré   : ${est.rewardPoolSuggested.toFixed(0)} PTF` + " ".repeat(Math.max(0, 29 - est.rewardPoolSuggested.toFixed(0).length)) + "║");
  console.log(`║  Commission PTF (${est.commissionRate * 100}%)  : ${est.commissionAmount.toFixed(0)} PTF` + " ".repeat(Math.max(0, 27 - est.commissionAmount.toFixed(0).length)) + "║");
  console.log(`║  Total à déposer       : ${est.totalDeposit.toFixed(0)} PTF` + " ".repeat(Math.max(0, 29 - est.totalDeposit.toFixed(0).length)) + "║");
  console.log("╠" + line + "╣");
  console.log("║  Grille commission PTF (réf. USD) :              ║");
  console.log("║    < 5 000 USD eq.   → 12 %                      ║");
  console.log("║    5 000–50 000 USD  → 10 %                      ║");
  console.log("║    > 50 000 USD      →  8 %                      ║");

  if (est.byPhase && est.byPhase.length > 0) {
    console.log("╠" + line + "╣");
    console.log("║  Décomposition par phase :                       ║");
    est.byPhase.forEach((p) => {
      const line2 = `║  ${p.name.padEnd(14)}: ${p.taskCount} tâches  ~${p.rewardPool.toFixed(0)} PTF`;
      console.log(line2 + " ".repeat(Math.max(0, 60 - line2.length)) + "║");
    });
  }

  console.log("╚" + line + "╝");
}
