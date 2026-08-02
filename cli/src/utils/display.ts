import chalk, { type ChalkInstance } from "chalk";
import type { PtfTask, ValidationResult, PtfProjectConfig, WalletStatus } from "../types.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*m/g, "");
const cols      = () => Math.max(process.stdout.columns ?? 100, 60);

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

/** Display a hex ID as 0xabcd…ef12 */
export function shortId(id: string, head = 8, tail = 6): string {
  if (id.length <= head + tail + 1) return id;
  return chalk.dim(id.slice(0, head) + "…" + id.slice(-tail));
}

/** Address display: first 10 + last 6 chars */
export function shortAddr(addr: string): string {
  if (addr.length <= 16) return addr;
  return addr.slice(0, 10) + chalk.dim("…") + addr.slice(-6);
}

// ── Core print helpers ─────────────────────────────────────────────────────────

export function printSuccess(msg: string): void {
  console.log(chalk.green("  ✓") + "  " + msg);
}

export function printError(msg: string): void {
  console.error(chalk.red("  ✗") + "  " + msg);
}

export function printWarning(msg: string): void {
  console.warn(chalk.yellow("  ⚠") + "  " + msg);
}

export function printInfo(msg: string): void {
  console.log(chalk.blue("  ℹ") + "  " + msg);
}

export function printDim(msg: string): void {
  console.log(chalk.dim(msg));
}

// ── Section header ─────────────────────────────────────────────────────────────

export function printSectionHeader(title: string): void {
  const w = Math.min(cols() - 4, 60);
  const bar = "─".repeat(Math.max(0, w - title.length - 2));
  console.log("\n" + chalk.cyan.bold("  ── " + title + " " + bar));
}

// ── Logo banner ────────────────────────────────────────────────────────────────

export function printBanner(version = "0.1.0"): void {
  const LOGO = [
    "   ██████╗ ████████╗███████╗",
    "   ██╔══██╗╚══██╔══╝██╔════╝",
    "   ██████╔╝   ██║   █████╗  ",
    "   ██╔═══╝    ██║   ██╔══╝  ",
    "   ██║        ██║   ██║     ",
    "   ╚═╝        ╚═╝   ╚═╝     ",
  ];
  console.log();
  for (const line of LOGO) {
    console.log(chalk.cyan.bold(line));
  }
  console.log();
  console.log(
    "   " + chalk.white.bold("Pay-Task Framework") +
    "  " + chalk.bgCyan.black(` v${version} `)
  );
  console.log("   " + chalk.dim("Écosystème décentralisé de tâches rémunérées"));
  console.log("   " + chalk.dim("─".repeat(46)));
  console.log(
    "   " +
    [["tasks", "Parcourir les tâches"], ["wallet", "Gérer ses crédits"],
     ["auth", "Se connecter"], ["generate", "IA → tâches"]]
      .map(([cmd]) => chalk.cyan(cmd))
      .join(chalk.dim("  ·  ")) +
    chalk.dim("  ·  ") + chalk.dim("ptf --help")
  );
  console.log();
}

// ── Offline banner ─────────────────────────────────────────────────────────────

export function printOfflineBanner(): void {
  const W  = 54;
  const msg = "  Backend PTF indisponible — données simulées";
  const pad = Math.max(0, W - msg.length - 2);
  console.log(
    "\n" +
    chalk.yellow("   ┌─ ") + chalk.yellow.bold("MODE OFFLINE") + chalk.yellow(" " + "─".repeat(W - 14) + "┐\n") +
    chalk.yellow("   │") + chalk.dim(msg + " ".repeat(pad)) + chalk.yellow("│\n") +
    chalk.yellow("   └" + "─".repeat(W) + "┘\n")
  );
}

// ── Deadline countdown ─────────────────────────────────────────────────────────

export function formatDeadlineCountdown(deadline: string): string {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return chalk.red.bold("EXPIRÉ");
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 3)  return chalk.green(`${d}j ${h}h`);
  if (d > 0)  return chalk.yellow(`${d}j ${h}h restants`);
  if (h > 0)  return chalk.red(`${h}h ${m}min restants`);
  return chalk.red.bold(`${m}min restants ⚠`);
}

// ── Priority & status color helpers ───────────────────────────────────────────

export function colorPriority(p: string): string {
  const fn = ({ critical: chalk.red.bold, high: chalk.yellow.bold, medium: chalk.cyan, low: chalk.dim } as Record<string, ChalkInstance>)[p];
  return fn ? fn(p) : chalk.white(p);
}

export function colorStatus(s: string): string {
  const fn = ({
    open: chalk.green.bold, claimed: chalk.yellow, in_progress: chalk.blue,
    submitted: chalk.cyan, under_review: chalk.magenta,
    validated: chalk.green.bold, rejected: chalk.red,
    disputed: chalk.red.bold, expired: chalk.dim, blocked: chalk.dim,
  } as Record<string, ChalkInstance>)[s];
  return fn ? fn(s) : chalk.white(s);
}

// ── Task card ──────────────────────────────────────────────────────────────────

export function printTask(task: PtfTask, verbose = false): void {
  const W = Math.min(cols() - 6, 70);
  const bar = "─".repeat(W);
  const titleMax = W - 4;

  console.log("\n" + chalk.dim("   ╭─ ") + chalk.bold.white(truncate(task.title, titleMax)) + chalk.dim(" " + "─".repeat(Math.max(0, W - 4 - task.title.length))));

  const row = (label: string, value: string) =>
    console.log(chalk.dim("   │  ") + chalk.dim(label.padEnd(10) + ": ") + value);

  row("ID",       chalk.dim(task.id));
  row("Statut",   colorStatus(task.status));
  row("Priorité", colorPriority(task.priority));
  row("Durée",    task.deadline
    ? task.duration + "  " + formatDeadlineCountdown(task.deadline)
    : task.duration);
  row("Reward",   task.rewardMode === "paid" && task.reward
    ? chalk.green.bold(task.reward.amount + " PTF")
    : chalk.cyan("+" + (task.reputationPoints ?? "?") + " pts rep") + chalk.dim(" (free)"));
  row("Skills",   chalk.cyan(task.claimCriteria.requiredSkills?.join(", ") || "any"));
  console.log(chalk.dim("   ╰" + bar));

  if (!verbose) return;

  const section = (title: string) =>
    console.log("\n   " + chalk.bold.cyan("▸ " + title));

  section("Contexte");
  console.log("   " + chalk.dim(task.context));

  section("Objectif");
  console.log("   " + task.objective);

  section("Livrable");
  console.log("   " + task.deliverable);

  section("Hors-scope");
  task.outOfScope.forEach((s) => console.log("   " + chalk.dim("─ ") + s));

  if (task.verificationSteps.length > 0) {
    section("Vérification automatique");
    task.verificationSteps.forEach((step) => {
      console.log("   " + chalk.cyan("$ ") + chalk.white(step.command));
      if (step.expectedOutput)
        console.log("     " + chalk.dim("→ " + step.expectedOutput));
    });
  }

  section("Pénalités");
  const fmtP = (r: { credits?: number; reputation: number }) =>
    [r.credits !== undefined ? chalk.red(`-${r.credits} crédits`) : null,
     chalk.red(`-${r.reputation} pts rép.`)].filter(Boolean).join(chalk.dim(" + "));

  ([
    ["Retard",           task.punishments.lateDelivery],
    ["Bug critique",     task.punishments.criticalBug],
    ["Bug mineur",       task.punishments.nonCriticalBug],
    ["Code malveillant", task.punishments.maliciousCode],
  ] as [string, typeof task.punishments.lateDelivery][]).forEach(([lbl, r]) =>
    console.log("   " + chalk.dim(lbl.padEnd(18)) + fmtP(r))
  );
}

// ── Project config ─────────────────────────────────────────────────────────────

export function printProjectConfig(config: PtfProjectConfig): void {
  printSectionHeader("Projet PTF");
  const rows: [string, string][] = [
    ["Nom",    chalk.cyan.bold(config.name)],
    ["ID",     chalk.dim(config.projectId)],
    ["Type",   config.type],
    ["Mode",   config.rewardMode === "paid" ? chalk.green("paid") : chalk.dim("free")],
    ["Chaîne", config.chain],
    ...(config.github ? [["GitHub", config.github] as [string, string]] : []),
    ...(config.server ? [["Serveur", config.server] as [string, string]] : []),
    ["Créé",   new Date(config.createdAt).toLocaleString("fr-FR")],
  ];
  for (const [label, value] of rows)
    console.log("   " + chalk.dim(label.padEnd(8) + ": ") + value);
}

// ── Validation result ──────────────────────────────────────────────────────────

export function printValidationResult(result: ValidationResult): void {
  if (result.errors.length === 0 && result.warnings.length === 0) {
    printSuccess("Validation OK — tous les fichiers sont conformes au format PTF");
    return;
  }

  if (result.errors.length > 0) {
    console.log(chalk.red.bold(`\n   ${result.errors.length} erreur(s) :`));
    result.errors.forEach((e) =>
      console.log(
        "   " + chalk.red("✗ ") + chalk.bold(`[${e.file.toUpperCase()}]`) +
        " " + chalk.dim(e.section) + " — " + e.message +
        (e.line ? chalk.dim(` (ligne ${e.line})`) : "")
      )
    );
  }

  if (result.warnings.length > 0) {
    console.log(chalk.yellow(`\n   ${result.warnings.length} avertissement(s) :`));
    result.warnings.forEach((w) =>
      console.log(
        "   " + chalk.yellow("⚠ ") + chalk.bold(`[${w.file.toUpperCase()}]`) +
        " " + chalk.dim(w.section) + " — " + w.message
      )
    );
  }

  console.log(
    "\n" +
    (result.valid ? chalk.green("   ✓ Validation OK") : chalk.red("   ✗ Validation échouée")) +
    chalk.dim(` — ${result.errors.length} erreur(s), ${result.warnings.length} avertissement(s)`)
  );
}

// ── Table ──────────────────────────────────────────────────────────────────────

/**
 * opts.colorRow — transform a row's cells with chalk before rendering.
 * Width calculation always uses the raw (uncolored) rows.
 */
export function printTable(
  headers: string[],
  rows: string[][],
  opts?: { colorRow?: (row: string[], i: number) => string[] }
): void {
  if (rows.length === 0) {
    printDim("   Aucun résultat.");
    return;
  }

  // Column widths from raw (ANSI-stripped) data
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => stripAnsi(r[i] ?? "").length))
  );

  // Squeeze last column if total overflows terminal
  const totalW = colWidths.reduce((s, w) => s + w + 3, 1);
  const maxW   = cols() - 4;
  if (totalW > maxW) {
    const last = colWidths.length - 1;
    colWidths[last] = Math.max(6, colWidths[last] - (totalW - maxW));
  }

  const hr = (l: string, m: string, r: string, s: string) =>
    "   " + l + colWidths.map((w) => s.repeat(w + 2)).join(m) + r;

  const cell = (raw: string, colored: string, w: number) => {
    const stripped = truncate(stripAnsi(raw), w);
    const displayed = stripped === stripAnsi(raw) ? colored : stripped;
    const pad = Math.max(0, w - stripAnsi(displayed).length);
    return " " + displayed + " ".repeat(pad) + " ";
  };

  console.log(chalk.dim(hr("┌", "┬", "┐", "─")));
  console.log(
    chalk.dim("   │") +
    headers.map((h, i) => " " + chalk.bold(h.padEnd(colWidths[i])) + " ").join(chalk.dim("│")) +
    chalk.dim("│")
  );
  console.log(chalk.dim(hr("├", "┼", "┤", "─")));

  rows.forEach((raw, ri) => {
    const colored = opts?.colorRow ? opts.colorRow(raw, ri) : raw;
    const cells   = headers.map((_, i) =>
      cell(raw[i] ?? "", colored[i] ?? raw[i] ?? "", colWidths[i])
    );
    const dim = ri % 2 !== 0;
    const line = chalk.dim("   │") + cells.map(c => dim ? chalk.dim(c) : c).join(chalk.dim("│")) + chalk.dim("│");
    console.log(line);
  });

  console.log(chalk.dim(hr("└", "┴", "┘", "─")));
}

// ── Wallet status ──────────────────────────────────────────────────────────────

export function printWalletStatus(ws: WalletStatus): void {
  const v = ws.verification;
  const badge = (ok: boolean, warn = false) =>
    ok ? chalk.green(" ✓ ") : warn ? chalk.yellow(" ⚠ ") : chalk.red(" ✗ ");

  const levelColor = ({
    Unranked: chalk.dim, Junior: chalk.green,
    Senior: chalk.cyan, Expert: chalk.yellow.bold,
  } as Record<string, ChalkInstance>)[ws.reputationLevel] ?? chalk.white;

  printSectionHeader("Wallet PTF");
  console.log("   " + chalk.dim("Adresse : ") + shortAddr(ws.address));
  console.log();

  const row = (ok: boolean, label: string, value: string, warn = false) =>
    console.log("   " + badge(ok, warn) + chalk.dim("  " + label.padEnd(20)) + value);

  row(ws.meetsMinBalance, "Solde PTF",      chalk.green.bold(ws.ptfBalance.toFixed(4) + " PTF")      + chalk.dim("  (min 10 requis)"));
  row(v.isValidAddress,   "Format adresse", v.isValidAddress ? chalk.green("EIP-55 valide")           : chalk.red("INVALIDE"));
  row(v.isActivated,      "Wallet actif",   v.isActivated    ? "transactions on-chain"                 : chalk.dim("non activé"));
  row(v.hasGasFees,       "Gas fees",       v.hasGasFees     ? "suffisant"                             : chalk.yellow("faible — risque d'échec"), true);
  row(v.isNotBanned,      "Statut réseau",  v.isNotBanned    ? "actif"                                 : chalk.red.bold("BANNI"));
  row(v.ownershipProven,  "Ownership",      v.ownershipProven? chalk.green("signature vérifiée")       : chalk.dim("non prouvée"));

  console.log();
  console.log("   " + chalk.dim("Réputation  : ") + chalk.bold(ws.reputationScore + " pts") + "  " + levelColor(ws.reputationLevel));
  console.log("   " + chalk.dim("Disponible  : ") + chalk.green.bold(ws.available.toFixed(6) + " PTF"));
  if (ws.softLocked > 0)
    console.log("   " + chalk.dim("Soft-locked : ") + chalk.yellow(ws.softLocked.toFixed(6) + " PTF") + chalk.dim("  (tâches actives)"));
}

// ── Estimation ─────────────────────────────────────────────────────────────────

export function printEstimation(est: {
  taskCount: number;
  totalEffortHours: number;
  rewardPoolSuggested: number;
  commissionRate: number;
  commissionAmount: number;
  totalDeposit: number;
  byPhase?: { name: string; taskCount: number; rewardPool: number }[];
}): void {
  const W = 58;
  const line = "═".repeat(W);

  const fill = (label: string, value: string) => {
    const content = "  " + label + value;
    const pad = Math.max(0, W - stripAnsi(content).length);
    return "║" + content + " ".repeat(pad) + "║";
  };

  console.log("\n╔" + line + "╗");
  console.log(fill(chalk.bold("PTF — Estimation du projet"), ""));
  console.log("╠" + line + "╣");
  console.log(fill("Tâches estimées       :  ", chalk.cyan(`~${est.taskCount} tâches`)));
  console.log(fill("Effort total          :  ", chalk.cyan(`~${est.totalEffortHours} heures-dev`)));
  console.log(fill("Reward pool suggéré   :  ", chalk.green.bold(est.rewardPoolSuggested.toFixed(0) + " PTF")));
  console.log(fill(`Commission (${(est.commissionRate * 100).toFixed(0)}%)       :  `, chalk.yellow(est.commissionAmount.toFixed(0) + " PTF")));
  console.log(fill("Total à déposer       :  ", chalk.green.bold(est.totalDeposit.toFixed(0) + " PTF")));
  console.log("╠" + line + "╣");
  console.log(fill(chalk.dim("Grille commission (réf. USD)"), ""));
  console.log(fill(chalk.dim("  < 5 000 USD    → "), chalk.dim("12 %")));
  console.log(fill(chalk.dim("  5–50 000 USD   → "), chalk.dim("10 %")));
  console.log(fill(chalk.dim("  > 50 000 USD   → "), chalk.dim(" 8 %")));

  if (est.byPhase && est.byPhase.length > 0) {
    console.log("╠" + line + "╣");
    console.log(fill(chalk.bold("Décomposition par phase"), ""));
    for (const p of est.byPhase) {
      console.log(fill(
        chalk.dim(truncate(p.name, 16).padEnd(16) + "  "),
        chalk.dim(`${p.taskCount} tâches  ~${p.rewardPool.toFixed(0)} PTF`)
      ));
    }
  }

  console.log("╚" + line + "╝");
}
