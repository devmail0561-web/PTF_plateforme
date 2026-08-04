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

function printLines(icon: string, msg: string): void {
  const indent = "       "; // 7 chars — aligne avec icon (2) + 2 spaces + icon (1) + 2 spaces
  const lines  = msg.split("\n");
  console.log(icon + "  " + lines[0]);
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]) console.log(indent + lines[i]);
  }
}

export function printSuccess(msg: string): void {
  printLines(chalk.green("  ✓"), msg);
}

export function printError(msg: string): void {
  const lines  = msg.split("\n");
  const indent = "       ";
  process.stderr.write(chalk.red("  ✗") + "  " + lines[0] + "\n");
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]) process.stderr.write(indent + lines[i] + "\n");
  }
}

export function printWarning(msg: string): void {
  printLines(chalk.yellow("  ⚠"), msg);
}

export function printInfo(msg: string): void {
  printLines(chalk.blue("  ℹ"), msg);
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

const LOGO = [
  "██████╗ ████████╗███████╗",
  "██╔══██╗╚══██╔══╝██╔════╝",
  "██████╔╝   ██║   █████╗  ",
  "██╔═══╝    ██║   ██╔══╝  ",
  "██║        ██║   ██║     ",
  "╚═╝        ╚═╝   ╚═╝     ",
];

// Gradient violet → indigo → cyan — une teinte par ligne
const LOGO_COLORS: ChalkInstance[] = [
  chalk.magenta.bold,
  chalk.magenta.bold,
  chalk.blueBright.bold,
  chalk.blueBright.bold,
  chalk.cyan.bold,
  chalk.cyan,
];

interface BannerStatus {
  online:        boolean;
  authenticated: boolean;
  walletAddress: string | undefined;
}

export function printBanner(version = "0.1.0", status?: BannerStatus): void {
  const LOGO_START = 2;
  const LOGO_W     = 24;
  const CENTER     = LOGO_START + Math.floor(LOGO_W / 2);
  const logopad    = " ".repeat(LOGO_START);

  const cline = (text: string, visLen: number): string => {
    const indent = Math.max(LOGO_START + 1, CENTER - Math.floor(visLen / 2));
    return " ".repeat(indent) + text;
  };

  console.log();
  for (let i = 0; i < LOGO.length; i++) {
    const color = LOGO_COLORS[i] ?? chalk.cyan.bold;
    console.log(color(logopad + LOGO[i]));
  }
  console.log();

  // Titre
  const titleStr   = "Pay-Task Framework";
  const verStr     = `  v${version}`;
  const titleColor = chalk.magenta.bold("Pay") + chalk.blueBright.bold("-Task") + chalk.cyan.bold(" Framework");
  console.log(cline(titleColor + chalk.dim(verStr), titleStr.length + verStr.length));

  // Sous-titre
  const sub = "Réseau décentralisé de tâches rémunérées";
  console.log(cline(chalk.dim(sub), sub.length));

  // Badge de statut réseau — centré sous le logo
  if (status) {
    const { online, authenticated, walletAddress } = status;

    // Badge connectivité
    const netBadge  = online
      ? chalk.bgGreen.black.bold(" ● ONLINE ")
      : chalk.bgYellow.black.bold(" ○ OFFLINE ");
    const netLen    = online ? 9 : 10;

    // Badge session
    const sessBadge = authenticated
      ? chalk.green.bold("✓") + " " + chalk.dim(walletAddress ? walletAddress.slice(0, 10) + "…" + walletAddress.slice(-4) : "connecté")
      : chalk.dim("○ non connecté");
    const sessLen   = authenticated
      ? 2 + (walletAddress ? 16 : 9)
      : 14;

    const row    = netBadge + "  " + sessBadge;
    const rowLen = netLen + 2 + sessLen;
    console.log(cline(row, rowLen));
  }

  // Séparateur
  const sep = "─".repeat(22);
  console.log(cline(chalk.dim(sep), sep.length));

  // Commandes
  const cmdStr   = "tasks  ·  wallet  ·  auth  ·  generate  ·  --help";
  const cmdColor = ["tasks", "wallet", "auth", "generate"]
    .map((c) => chalk.cyan(c)).join(chalk.dim("  ·  ")) + chalk.dim("  ·  --help");
  console.log(cline(cmdColor, cmdStr.length));

  console.log();
}

// ── Offline banner ─────────────────────────────────────────────────────────────

export function printOfflineBanner(): void {
  console.log(
    "\n" + chalk.yellow("  ⚠  Mode offline") + chalk.dim(" — données simulées\n")
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
  const W    = 54;
  const line = "─".repeat(W);
  const row  = (label: string, value: string) => {
    const raw = "  " + label;
    const pad = Math.max(1, W - raw.length - stripAnsi(value).length - 2);
    console.log("   " + chalk.dim("│") + raw + " ".repeat(pad) + value + "  " + chalk.dim("│"));
  };

  console.log("\n   " + chalk.dim("┌" + line + "┐"));
  row(chalk.bold("Estimation du projet"), "");
  console.log("   " + chalk.dim("├" + line + "┤"));
  row("Tâches estimées      ", chalk.cyan(`~${est.taskCount}`));
  row("Effort total         ", chalk.cyan(`~${est.totalEffortHours} h`));
  row("Reward pool          ", chalk.green.bold(est.rewardPoolSuggested.toFixed(0) + " PTF"));
  row(`Commission (${(est.commissionRate * 100).toFixed(0)}%)     `, chalk.yellow(est.commissionAmount.toFixed(0) + " PTF"));
  row(chalk.bold("Total à déposer      "), chalk.green.bold(est.totalDeposit.toFixed(0) + " PTF"));
  console.log("   " + chalk.dim("├" + line + "┤"));
  row(chalk.dim("< 5k USD → 12%   5–50k → 10%   >50k → 8%"), "");

  if (est.byPhase && est.byPhase.length > 0) {
    console.log("   " + chalk.dim("├" + line + "┤"));
    for (const p of est.byPhase) {
      row(
        chalk.dim(truncate(p.name, 20).padEnd(20)),
        chalk.dim(`${p.taskCount} tâches  ${p.rewardPool.toFixed(0)} PTF`)
      );
    }
  }

  console.log("   " + chalk.dim("└" + line + "┘"));
}
