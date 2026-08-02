import type { PrismaClient, Task } from "@prisma/client";
import type { IChainRegistry } from "../bal/chain.registry.js";
import type { IReputationService } from "./reputation.service.js";
import type { IWalletService } from "./wallet.service.js";
import type {
  TaskFilter,
  PublicTaskView,
  ClaimResult,
  SubmitResult,
  TaskDraft,
  TaskScoring,
  ClaimCriteria,
  Punishments,
  TaskConstraints,
  VerificationStep,
  TaskStatus,
} from "../types/index.js";
import { PtfError, PtfErrorCode } from "../types/errors.js";
import { ethers } from "ethers";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — redlock exports are not resolved via package.json "exports"
import Redlock from "redlock";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRedis = any;

const LOCK_TTL_MS = 10_000;
const DURATION_RE = /^(\d+)([dhm])$/;

function parseDurationDays(duration: string): number {
  const m = DURATION_RE.exec(duration);
  if (!m) return 30;
  const v = parseInt(m[1]);
  switch (m[2]) {
    case "d": return v;
    case "h": return Math.ceil(v / 24);
    case "m": return Math.ceil(v / 1440);
    default: return 30;
  }
}

function computeMerkleRoot(ids: string[]): string {
  if (ids.length === 0) return ethers.ZeroHash;
  let layer = ids.map((id) =>
    id.startsWith("0x") ? id : ethers.keccak256(ethers.toUtf8Bytes(id))
  );
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const l = layer[i];
      const r = layer[i + 1] ?? layer[i];
      const [a, b] = l.toLowerCase() < r.toLowerCase() ? [l, r] : [r, l];
      next.push(
        ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [a, b])
      );
    }
    layer = next;
  }
  return layer[0];
}

/**
 * Returns true if the 15% grace period since claim has elapsed.
 * Grace period = 15% of (deadline - claimedAt). If either date is missing, no forfeit.
 */
function shouldForfeitGuarantee(claimedAt: Date | null, deadline: Date | null): boolean {
  if (!claimedAt || !deadline) return false;
  const totalMs = deadline.getTime() - claimedAt.getTime();
  if (totalMs <= 0) return false;
  const gracePeriodMs = totalMs * 0.15;
  return Date.now() - claimedAt.getTime() >= gracePeriodMs;
}

export interface ITaskService {
  create(projectId: string, draft: TaskDraft): Promise<Task>;
  bulkCreate(projectId: string, drafts: TaskDraft[]): Promise<Task[]>;
  findById(id: string): Promise<Task | null>;
  list(filter: TaskFilter): Promise<Task[]>;
  claim(
    taskId: string,
    devAddress: string,
    chain: string,
    signedNonce?: string
  ): Promise<ClaimResult>;
  submit(
    taskId: string,
    commitHash: string,
    branchRef: string,
    devAddress: string
  ): Promise<SubmitResult>;
  cancel(taskId: string, callerAddress: string): Promise<void>;
  expire(taskId: string): Promise<void>;
  computeMerkleRoot(projectId: string): Promise<string>;
  assertMutable(task: Task): void;
  getPublicView(task: Task, projectType: string, projectRewardMode?: string): PublicTaskView;
}

export class TaskService implements ITaskService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private redlock: any;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly chainRegistry: IChainRegistry,
    private readonly reputationService: IReputationService,
    private readonly walletService: IWalletService,
    redis: AnyRedis
  ) {
    this.redlock = new Redlock([redis], { retryCount: 3, retryDelay: 200 });
  }

  async create(projectId: string, draft: TaskDraft): Promise<Task> {
    const nonce = Date.now();
    const taskId = ethers.solidityPackedKeccak256(
      ["string", "string", "string", "uint256"],
      [projectId, draft.parentId ?? "", draft.title, nonce]
    );

    const scoring = draft.scoring as unknown as TaskScoring;
    const durationDays = parseDurationDays(draft.duration ?? "30d");

    // Reputation points are only awarded for open-source projects.
    const project = await this.prisma.project.findUnique({
      where:  { id: projectId },
      select: { isOpenSource: true },
    });
    const reputationPoints = project?.isOpenSource
      ? this.reputationService.calculatePoints(scoring, durationDays)
      : 0;

    return this.prisma.task.create({
      data: {
        id: taskId,
        projectId,
        parentId: draft.parentId ?? null,
        title: draft.title,
        type: draft.type,
        priority: draft.priority,
        status: "open",
        context: draft.context,
        objective: draft.objective,
        deliverable: draft.deliverable,
        outOfScope: draft.outOfScope,
        constraints: draft.constraints as unknown as object,
        verificationSteps: draft.verificationSteps as unknown as object,
        claimCriteria: draft.claimCriteria as unknown as object,
        punishments: draft.punishments as unknown as object,
        scoring: draft.scoring as unknown as object,
        reputationPoints,
        dependencies: draft.dependencies ?? [],
        blockedBy: [],
        unlocks: [],
        duration: draft.duration ?? "30d",
        rewardAmount: draft.rewardAmount,
        rewardToken: draft.rewardAmount ? "PTF" : undefined,
      },
    });
  }

  async bulkCreate(projectId: string, drafts: TaskDraft[]): Promise<Task[]> {
    return Promise.all(drafts.map((draft) => this.create(projectId, draft)));
  }

  async findById(id: string): Promise<Task | null> {
    return this.prisma.task.findUnique({ where: { id } });
  }

  async list(filter: TaskFilter): Promise<Task[]> {
    const limit  = Math.min(filter.limit  ?? 50, 200);
    const offset = filter.offset ?? 0;
    return this.prisma.task.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.devAddress ? { devAddress: filter.devAddress.toLowerCase() } : {}),
        ...(filter.minReward ? { rewardAmount: { gte: filter.minReward } } : {}),
        ...(filter.maxReward ? { rewardAmount: { lte: filter.maxReward } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take:    limit,
      skip:    offset,
    });
  }

  async claim(
    taskId: string,
    devAddress: string,
    chain: string,
    signedNonce?: string
  ): Promise<ClaimResult> {
    const task = await this.findById(taskId);
    if (!task) {
      throw new PtfError(PtfErrorCode.TASK_NOT_FOUND, `Tâche introuvable : ${taskId}`);
    }
    if (task.status !== "open") {
      throw new PtfError(PtfErrorCode.TASK_NOT_OPEN, `Tâche non disponible : ${task.status}`);
    }

    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: task.projectId },
    });

    // Vérification solde PTF ≥ 10 (projets paid uniquement — première barrière)
    if (project.rewardMode === "paid") {
      const meetsBalance = await this.walletService.meetsMinBalance(devAddress, chain);
      if (!meetsBalance) {
        throw new PtfError(
          PtfErrorCode.INSUFFICIENT_PTF_BALANCE,
          "Solde PTF insuffisant. Minimum 10 PTF requis pour les projets paid."
        );
      }
    }

    // Vérification wallet
    const walletCheck = await this.walletService.verifyWallet(devAddress, chain, signedNonce);
    if (!walletCheck.isNotBanned) {
      throw new PtfError(PtfErrorCode.WALLET_BANNED, "Wallet banni");
    }
    if (!walletCheck.isActivated) {
      throw new PtfError(PtfErrorCode.WALLET_NOT_ACTIVATED, "Wallet non activé");
    }

    // Vérification claimCriteria
    const criteria = task.claimCriteria as unknown as ClaimCriteria;
    if (criteria.minReputation) {
      const score = await this.reputationService.getScore(devAddress, chain);
      if (score.total < criteria.minReputation) {
        throw new PtfError(
          PtfErrorCode.INSUFFICIENT_PTF_BALANCE,
          `Réputation insuffisante : ${score.total}/${criteria.minReputation}`
        );
      }
    }

    if (criteria.maxActiveTasks) {
      const activeCount = await this.prisma.task.count({
        where: {
          devAddress: devAddress.toLowerCase(),
          status: { in: ["claimed", "in_progress", "submitted", "under_review"] },
        },
      });
      if (activeCount >= criteria.maxActiveTasks) {
        throw new PtfError(
          PtfErrorCode.INSUFFICIENT_PTF_BALANCE,
          `Trop de tâches actives : ${activeCount}/${criteria.maxActiveTasks}`
        );
      }
    }
    // requiredSkills, minCompletedTasks : pas de données on-chain pour l'instant — skip silencieux documenté

    // Vérification dépendances
    if (task.dependencies.length > 0) {
      const deps = await this.prisma.task.findMany({
        where: { id: { in: task.dependencies } },
        select: { id: true, status: true },
      });
      const unresolved = deps.filter((d) => d.status !== "validated");
      if (unresolved.length > 0) {
        throw new PtfError(
          PtfErrorCode.DEPENDENCY_NOT_VALIDATED,
          `Dépendances non validées : ${unresolved.map((d) => d.id).join(", ")}`
        );
      }
    }

    // Anti-collision via Redlock
    const lock = await this.redlock.acquire([`lock:task:${taskId}`], LOCK_TTL_MS);

    try {
      // Double-check sous lock
      const fresh = await this.prisma.task.findUnique({
        where: { id: taskId },
        select: { status: true },
      });
      if (fresh?.status !== "open") {
        throw new PtfError(PtfErrorCode.TASK_ALREADY_CLAIMED, "Tâche déjà réclamée");
      }

      const claimedAt = new Date();
      const durationDays = parseDurationDays(task.duration);
      const deadline = new Date(claimedAt.getTime() + durationDays * 86400000);

      const conditionsHash = ethers.keccak256(
        ethers.toUtf8Bytes(
          JSON.stringify({
            taskId,
            duration: task.duration,
            punishments: task.punishments,
            constraints: task.constraints,
            verificationSteps: task.verificationSteps,
            rewardAmount: task.rewardAmount,
          })
        )
      );

      // Mark as claim_pending before any on-chain call so a crash mid-flight
      // leaves the task in a recoverable state instead of silently claimed.
      await this.prisma.task.update({
        where: { id: taskId, status: "open" },
        data: {
          status: "claim_pending",
          claimedAt,
          deadline,
          devAddress: devAddress.toLowerCase(),
          conditionsHash,
        },
      });

      let signature: string;
      try {
        // Soft-lock 10 PTF (projets paid) — on-chain uniquement
        if (project.rewardMode === "paid") {
          await this.walletService.softLock(devAddress, chain, 10);
        }

        // Enregistrement on-chain
        const adapter = this.chainRegistry.get(chain);
        signature = await adapter.claimTask(taskId, devAddress, conditionsHash);
      } catch (onChainErr) {
        // Compensate: roll the task back to "open" so it can be claimed again.
        await this.prisma.task.update({
          where: { id: taskId },
          data: {
            status: "open",
            claimedAt: null,
            deadline: null,
            devAddress: null,
            conditionsHash: null,
          },
        }).catch((rollbackErr: unknown) => {
          // Log but don't swallow — operator must reconcile manually.
          console.error(`[TaskService] CRITICAL: rollback failed for task ${taskId}`, rollbackErr);
        });
        throw onChainErr;
      }

      // On-chain succeeded — finalize the DB record.
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: "claimed", eip712Signature: signature },
      });

      return {
        taskId,
        devAddress,
        claimedAt: claimedAt.toISOString(),
        deadline: deadline.toISOString(),
        conditionsHash,
        signature,
      };
    } finally {
      await lock.release();
    }
  }

  async submit(
    taskId: string,
    commitHash: string,
    branchRef: string,
    callerAddress: string
  ): Promise<SubmitResult> {
    const task = await this.findById(taskId);
    if (!task) {
      throw new PtfError(PtfErrorCode.TASK_NOT_FOUND, `Tâche introuvable : ${taskId}`);
    }

    if (!task.devAddress || task.devAddress.toLowerCase() !== callerAddress.toLowerCase()) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Vous ne pouvez soumettre que vos propres tâches");
    }

    if (task.status !== "claimed") {
      throw new PtfError(
        PtfErrorCode.TASK_IMMUTABLE,
        `La tâche ${taskId} ne peut pas être soumise (statut : ${task.status})`
      );
    }

    const submittedAt = new Date();
    const validationJobId = `job_${taskId.slice(2, 10)}_${Date.now()}`;

    await this.prisma.submission.create({
      data: {
        taskId,
        devAddress: task.devAddress.toLowerCase(),
        commitHash,
        branchRef,
        status: "pending",
        validationJobId,
      },
    });

    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: "submitted",
        commitHash,
        branchRef,
      },
    });

    return {
      taskId,
      commitHash,
      branchRef,
      submittedAt: submittedAt.toISOString(),
      validationJobId,
    };
  }

  async cancel(taskId: string, callerAddress: string): Promise<void> {
    const task = await this.findById(taskId);
    if (!task) {
      throw new PtfError(PtfErrorCode.TASK_NOT_FOUND, `Tâche introuvable : ${taskId}`);
    }

    if (!task.devAddress || task.devAddress.toLowerCase() !== callerAddress.toLowerCase()) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Vous ne pouvez annuler que vos propres tâches");
    }

    const UNCANCELLABLE: string[] = ["submitted", "under_review", "validated", "rejected", "disputed", "blocked"];
    if (UNCANCELLABLE.includes(task.status)) {
      throw new PtfError(
        PtfErrorCode.TASK_IMMUTABLE,
        `La tâche ${taskId} ne peut pas être annulée (statut : ${task.status})`
      );
    }

    const lock = await this.redlock.acquire([`lock:task:${taskId}`], LOCK_TTL_MS);
    try {
      // Re-check status sous lock
      const fresh = await this.prisma.task.findUnique({ where: { id: taskId }, select: { status: true } });
      if (fresh && UNCANCELLABLE.includes(fresh.status)) {
        throw new PtfError(PtfErrorCode.TASK_IMMUTABLE, `La tâche ${taskId} ne peut pas être annulée (statut : ${fresh.status})`);
      }

      const project = await this.prisma.project.findUniqueOrThrow({
        where: { id: task.projectId },
      });

      if (project.rewardMode === "paid" && task.devAddress) {
        const forfeit = shouldForfeitGuarantee(task.claimedAt, task.deadline);
        // F2 — softUnlock sans montant (contrat utilise SOFT_LOCK_AMOUNT constant).
        await this.walletService.softUnlock(task.devAddress, project.chain).catch((err: unknown) => {
          console.error(`[TaskService] softUnlock failed on cancel for ${task.devAddress}:`, err);
        });
        if (forfeit) {
          // The on-chain penalty is handled by the contract — the guarantee is forfeited
          console.log(`[TaskService] Cancel after grace period: 10 PTF forfeited for task ${taskId}`);
        }
      }

      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          status: "open",
          devAddress: null,
          claimedAt: null,
          deadline: null,
          conditionsHash: null,
          eip712Signature: null,
        },
      });
    } finally {
      await lock.release();
    }
  }

  async expire(taskId: string): Promise<void> {
    const task = await this.findById(taskId);

    if (task?.devAddress) {
      const project = await this.prisma.project.findUnique({
        where: { id: task.projectId },
      });
      if (project?.rewardMode === "paid") {
        // F2 — softUnlock sans montant.
        await this.walletService.softUnlock(task.devAddress, project.chain).catch((err: unknown) => {
          console.error(`[TaskService] softUnlock failed on expire for ${task.devAddress}:`, err);
        });
        // The on-chain contract handles penalty — no UTXO/ledger needed
        console.log(`[TaskService] Expired: guarantee forfeited on-chain for task ${taskId}`);
      }
    }

    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: "expired" },
    });
  }

  async computeMerkleRoot(projectId: string): Promise<string> {
    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      select: { id: true },
    });
    return computeMerkleRoot(tasks.map((t) => t.id));
  }

  assertMutable(task: Task): void {
    if (task.status !== "open") {
      throw new PtfError(
        PtfErrorCode.TASK_IMMUTABLE,
        `La tâche ${task.id} est immuable (statut : ${task.status}). Seules les tâches "open" peuvent être modifiées.`
      );
    }
  }

  getPublicView(task: Task, projectType: string, projectRewardMode?: string): PublicTaskView {
    const isPrivate = projectType === "private";
    const constraints = task.constraints as unknown as TaskConstraints;
    const steps = task.verificationSteps as unknown as VerificationStep[];
    const criteria = task.claimCriteria as unknown as ClaimCriteria;
    const punishments = task.punishments as unknown as Punishments;

    const maskedSteps = isPrivate
      ? steps.map((s) =>
          s.command.includes("/") || s.command.includes("src/")
            ? { ...s, command: "[HIDDEN]" }
            : s
        )
      : steps;

    return {
      taskId: task.id,
      projectId: task.projectId,
      projectName: isPrivate
        ? `Private Project #${task.projectId.slice(2, 6)}`
        : task.projectId,
      type: task.type,
      rewardMode: (projectRewardMode as "free" | "paid") ?? (task.rewardAmount ? "paid" : "free"),
      priority: task.priority as import("../types/index.js").TaskPriority,
      title: task.title,
      reward: task.rewardAmount
        ? { amount: Number(task.rewardAmount), token: task.rewardToken ?? "PTF" }
        : null,
      duration: task.duration,
      deadline: task.deadline?.toISOString(),
      claimCriteria: criteria,
      punishments,
      verificationSteps: maskedSteps,
      status: task.status as TaskStatus,
      dependencies: task.dependencies,
      context: isPrivate
        ? task.context.replace(/[a-z0-9-]+\.(com|org|io|dev)/gi, "[HIDDEN]")
        : task.context,
    };
  }
}
