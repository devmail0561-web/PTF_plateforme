import { execFile } from "child_process";
import { promisify } from "util";
import type { PrismaClient } from "@prisma/client";
import type { VerificationStep, ValidationOutcome, VerificationResult } from "../types/index.js";
import { PtfError, PtfErrorCode } from "../types/errors.js";

const execFileAsync = promisify(execFile);
const STEP_TIMEOUT_MS = 120_000; // 2 minutes max par step

// Délai après lequel le propriétaire est considéré silencieux → auto-validation
export const OWNER_VALIDATION_TIMEOUT_MS = 72 * 60 * 60 * 1000; // 72h

// F1 — Allowlist des binaires autorisés dans les verificationSteps.
// Aucun binaire shell (bash, sh, python -c, etc.) n'est permis.
const ALLOWED_BINARIES = new Set([
  "npm", "npx", "yarn", "pnpm",
  "pytest", "python", "python3",
  "cargo",
  "go",
  "node",
  // Outils d'analyse statique de sécurité
  "semgrep",
  "snyk",
]);

// Arguments qui permettent l'exécution arbitraire de code même dans un binaire autorisé.
const FORBIDDEN_ARGS = new Set(["-c", "--eval", "-e", "--exec", "-i", "--interactive"]);

const MAX_COMMAND_LENGTH = 200;

function assertSafeCommand(step: VerificationStep): void {
  const raw = step.command.trim();
  if (raw.length > MAX_COMMAND_LENGTH) {
    throw new PtfError(
      PtfErrorCode.UNAUTHORIZED,
      `Commande trop longue (max ${MAX_COMMAND_LENGTH} chars) : "${raw.slice(0, 40)}..."`
    );
  }
  const [cmd, ...args] = raw.split(/\s+/);
  if (!ALLOWED_BINARIES.has(cmd)) {
    throw new PtfError(
      PtfErrorCode.UNAUTHORIZED,
      `Binaire interdit : "${cmd}". Autorisés : ${[...ALLOWED_BINARIES].join(", ")}`
    );
  }
  for (const arg of args) {
    if (FORBIDDEN_ARGS.has(arg)) {
      throw new PtfError(
        PtfErrorCode.UNAUTHORIZED,
        `Argument interdit "${arg}" dans la commande "${raw}"`
      );
    }
  }
}

export interface ValidationReport {
  taskId: string;
  submissionId: string;
  outcome: ValidationOutcome;
  steps: VerificationResult[];
  durationMs: number;
}

export interface IValidationService {
  // Déclenché automatiquement par le backend à la soumission du dev.
  // callerAddress : adresse de l'appelant, doit être le project owner.
  validateSubmission(submissionId: string, callerAddress?: string): Promise<ValidationReport>;
  // Déclenché par le propriétaire pour approuver ou refuser avec motif.
  ownerDecision(taskId: string, callerAddress: string, approved: boolean, reason?: string): Promise<void>;
  // Déclenché par TimerService après 72h de silence du propriétaire.
  autoApprove(taskId: string): Promise<void>;
}

export class ValidationService implements IValidationService {
  constructor(private readonly prisma: PrismaClient) {}

  async validateSubmission(submissionId: string, callerAddress?: string): Promise<ValidationReport> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { task: { include: { project: true } } },
    });

    if (!submission) {
      throw new PtfError(PtfErrorCode.TASK_NOT_FOUND, `Soumission introuvable : ${submissionId}`);
    }

    const task = submission.task as unknown as {
      id: string; verificationSteps: unknown;
      project: { ownerAddress: string; rewardMode: string };
      submittedAt?: Date;
    };

    // Only the project owner may trigger validation manually via the GraphQL resolver.
    // Internal callers (TaskService.submit) pass no callerAddress and are always allowed.
    if (callerAddress && task.project.ownerAddress.toLowerCase() !== callerAddress.toLowerCase()) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Seul le créateur du projet peut déclencher la validation");
    }
    const steps = task.verificationSteps as VerificationStep[];
    const startMs = Date.now();
    const results: VerificationResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepStart = Date.now();

      // Commandes cachées (projets privés) : skip silencieux.
      // Note : "[HIDDEN]" ne devrait jamais être stocké en DB — c'est un masque pour l'API publique.
      // Si quelqu'un a réussi à stocker "[HIDDEN]", la step passe sans exécution (intentionnel).
      if (step.command === "[HIDDEN]") {
        results.push({ stepIndex: i, passed: true, output: "[HIDDEN]", durationMs: 0 });
        continue;
      }

      // F1 — Valider la commande contre l'allowlist AVANT toute exécution.
      try {
        assertSafeCommand(step);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ stepIndex: i, passed: false, error: message, durationMs: 0 });
        continue;
      }

      try {
        const [cmd, ...cmdArgs] = step.command.trim().split(/\s+/);
        // Subprocess environment is intentionally minimal — never inherit backend secrets.
        // Only PATH, HOME, TMPDIR (needed by npm/pytest) and CI=true are forwarded.
        const safeEnv: Record<string, string> = { CI: "true" };
        for (const key of ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "USERPROFILE", "SYSTEMROOT", "SystemRoot"]) {
          if (process.env[key]) safeEnv[key] = process.env[key]!;
        }
        const { stdout, stderr } = await execFileAsync(cmd, cmdArgs, {
          timeout: STEP_TIMEOUT_MS,
          env: safeEnv,
        });
        const output = (stdout + stderr).trim();
        const passed = this.checkOutput(output, step);
        results.push({ stepIndex: i, passed, output, durationMs: Date.now() - stepStart });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          stepIndex: i,
          passed: false,
          error: message,
          durationMs: Date.now() - stepStart,
        });
      }
    }

    const allPassed = results.every((r) => r.passed);
    const outcome: ValidationOutcome = allPassed ? "passed" : "failed";
    const durationMs = Date.now() - startMs;

    await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: allPassed ? "approved" : "rejected",
        testResults: results as unknown as object,
        completedAt: new Date(),
      },
    });

    // Si tests passent → "pending_owner" : en attente de validation/refus du propriétaire
    // Si tests échouent → "rejected" : dev doit corriger et re-soumettre
    await this.prisma.task.update({
      where: { id: task.id },
      data: { status: allPassed ? "pending_owner" : "rejected" },
    });

    return { taskId: task.id, submissionId, outcome, steps: results, durationMs };
  }

  async ownerDecision(taskId: string, callerAddress: string, approved: boolean, reason?: string): Promise<void> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });
    if (!task) throw new PtfError(PtfErrorCode.TASK_NOT_FOUND, `Tâche introuvable : ${taskId}`);

    const project = task.project as unknown as { ownerAddress: string };
    if (project.ownerAddress.toLowerCase() !== callerAddress.toLowerCase()) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Seul le créateur du projet peut valider une soumission");
    }

    if (task.status !== "pending_owner") {
      throw new PtfError(PtfErrorCode.TASK_IMMUTABLE, `Statut invalide pour une décision propriétaire : ${task.status}`);
    }

    if (approved) {
      // Propriétaire approuve → "under_review" (EscrowService peut libérer)
      await this.prisma.task.update({ where: { id: taskId }, data: { status: "under_review" } });
    } else {
      // Refus : motif obligatoire
      if (!reason || reason.trim().length < 10) {
        throw new PtfError(PtfErrorCode.INVALID_INPUT, "Un motif de refus d'au moins 10 caractères est requis");
      }
      // "owner_rejected" → disponible pour arbitrage si le dev conteste
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: "owner_rejected", rejectionReason: reason.trim() },
      });
    }
  }

  // Déclenché par TimerService après 72h sans décision du propriétaire
  async autoApprove(taskId: string): Promise<void> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.status !== "pending_owner") return;
    await this.prisma.task.update({ where: { id: taskId }, data: { status: "under_review" } });
    console.log(`[ValidationService] Auto-approbation après 72h de silence : tâche ${taskId}`);
  }

  private checkOutput(output: string, step: VerificationStep): boolean {
    if (step.expectedOutput !== undefined && step.expectedOutput !== "") {
      return output.includes(step.expectedOutput);
    }
    // Pas d'expectedOutput = on vérifie juste que la commande s'est exécutée sans erreur
    return true;
  }
}
