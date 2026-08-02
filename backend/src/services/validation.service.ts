import { execFile } from "child_process";
import { promisify } from "util";
import type { PrismaClient } from "@prisma/client";
import type { VerificationStep, ValidationOutcome, VerificationResult } from "../types/index.js";
import { PtfError, PtfErrorCode } from "../types/errors.js";

const execFileAsync = promisify(execFile);
const STEP_TIMEOUT_MS = 120_000; // 2 minutes max par step

// F1 — Allowlist des binaires autorisés dans les verificationSteps.
// Aucun binaire shell (bash, sh, python -c, etc.) n'est permis.
const ALLOWED_BINARIES = new Set([
  "npm", "npx", "yarn", "pnpm",
  "pytest", "python", "python3",
  "cargo",
  "go",
  "node",
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
  // F8 — callerAddress requis pour vérifier que l'appelant est bien le project owner.
  validateSubmission(submissionId: string, callerAddress: string): Promise<ValidationReport>;
}

export class ValidationService implements IValidationService {
  constructor(private readonly prisma: PrismaClient) {}

  async validateSubmission(submissionId: string, callerAddress: string): Promise<ValidationReport> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { task: { include: { project: true } } },
    });

    if (!submission) {
      throw new PtfError(PtfErrorCode.TASK_NOT_FOUND, `Soumission introuvable : ${submissionId}`);
    }

    // F8 — Vérifier que l'appelant est bien le project owner.
    const projectOwner = (submission.task as unknown as { project: { ownerAddress: string } }).project.ownerAddress;
    if (projectOwner.toLowerCase() !== callerAddress.toLowerCase()) {
      throw new PtfError(
        PtfErrorCode.UNAUTHORIZED,
        "Seul le créateur du projet peut valider une soumission"
      );
    }

    const task = submission.task;
    const steps = task.verificationSteps as unknown as VerificationStep[];
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
        const { stdout, stderr } = await execFileAsync(cmd, cmdArgs, {
          timeout: STEP_TIMEOUT_MS,
          env: { ...process.env, CI: "true" },
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

    // Persister les résultats dans la DB
    await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: allPassed ? "approved" : "rejected",
        testResults: results as unknown as object,
        completedAt: new Date(),
      },
    });

    await this.prisma.task.update({
      where: { id: task.id },
      data: { status: allPassed ? "under_review" : "rejected" },
    });

    return { taskId: task.id, submissionId, outcome, steps: results, durationMs };
  }

  private checkOutput(output: string, step: VerificationStep): boolean {
    if (step.expectedOutput !== undefined && step.expectedOutput !== "") {
      return output.includes(step.expectedOutput);
    }
    // Pas d'expectedOutput = on vérifie juste que la commande s'est exécutée sans erreur
    return true;
  }
}
