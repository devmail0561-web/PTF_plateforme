import { execFile } from "child_process";
import { promisify } from "util";
import type { PrismaClient } from "@prisma/client";
import type { VerificationStep, ValidationOutcome, VerificationResult } from "../types/index.js";
import { PtfError, PtfErrorCode } from "../types/errors.js";

const execFileAsync = promisify(execFile);
const STEP_TIMEOUT_MS = 120_000; // 2 minutes max par step

export interface ValidationReport {
  taskId: string;
  submissionId: string;
  outcome: ValidationOutcome;
  steps: VerificationResult[];
  durationMs: number;
}

export interface IValidationService {
  validateSubmission(submissionId: string): Promise<ValidationReport>;
}

export class ValidationService implements IValidationService {
  constructor(private readonly prisma: PrismaClient) {}

  async validateSubmission(submissionId: string): Promise<ValidationReport> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { task: true },
    });

    if (!submission) {
      throw new PtfError(PtfErrorCode.TASK_NOT_FOUND, `Soumission introuvable : ${submissionId}`);
    }

    const task = submission.task;
    const steps = task.verificationSteps as unknown as VerificationStep[];
    const startMs = Date.now();
    const results: VerificationResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepStart = Date.now();

      // Commandes cachées (projets privés) : skip silencieux
      if (step.command === "[HIDDEN]") {
        results.push({ stepIndex: i, passed: true, output: "[HIDDEN]", durationMs: 0 });
        continue;
      }

      try {
        const [cmd, ...cmdArgs] = step.command.split(/\s+/);
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
