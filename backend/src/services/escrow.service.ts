import { ethers } from "ethers";
import type { PrismaClient } from "@prisma/client";
import type { IChainRegistry } from "../bal/chain.registry.js";
import type { IReputationService } from "./reputation.service.js";
import { PtfError, PtfErrorCode } from "../types/errors.js";

const PTF_DECIMALS = 6;

export interface IEscrowService {
  // F3 — callerAddress requis pour vérifier que l'appelant est le project owner.
  releaseTaskReward(taskId: string, chain: string, callerAddress: string): Promise<ReleaseResult>;
}

export interface ReleaseResult {
  taskId: string;
  devAddress: string;
  amount: number;
  txHash: string;
  utxoId: string;
  releasedAt: string;
}

export class EscrowService implements IEscrowService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly chainRegistry: IChainRegistry,
    private readonly reputationService: IReputationService
  ) {}

  async releaseTaskReward(taskId: string, chain: string, callerAddress: string): Promise<ReleaseResult> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });

    if (!task) {
      throw new PtfError(PtfErrorCode.TASK_NOT_FOUND, `Tâche introuvable : ${taskId}`);
    }

    // F3 — Vérifier que l'appelant est bien le project owner.
    if (task.project.ownerAddress.toLowerCase() !== callerAddress.toLowerCase()) {
      throw new PtfError(
        PtfErrorCode.UNAUTHORIZED,
        "Seul le créateur du projet peut libérer les rewards"
      );
    }

    // F3 — Accepter uniquement "under_review" (validation automatique passée).
    // "submitted" seul n'est pas suffisant : les tests doivent avoir tourné et approuvé la soumission.
    if (task.status !== "under_review") {
      throw new PtfError(
        PtfErrorCode.TASK_IMMUTABLE,
        `Impossible de libérer le reward : statut "${task.status}" (requis : under_review)`
      );
    }

    // F3 — Vérifier qu'au moins une soumission est effectivement approuvée par validateSubmission.
    const approvedSubmission = await this.prisma.submission.findFirst({
      where: { taskId, status: "approved" },
    });
    if (!approvedSubmission) {
      throw new PtfError(
        PtfErrorCode.UNAUTHORIZED,
        "Aucune soumission approuvée pour cette tâche — exécutez validateSubmission d'abord"
      );
    }

    if (!task.devAddress) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Aucun développeur assigné à cette tâche");
    }

    const project = task.project;
    const adapter = this.chainRegistry.get(chain);

    let txHash: string;
    let amountRaw: bigint;

    if (project.rewardMode === "paid" && task.rewardAmount) {
      // F10 — task.rewardAmount est maintenant Decimal (Prisma). Convertir via toString() pour éviter
      // toute perte de précision IEEE 754 avant le BigInt.
      const rewardDecimal = task.rewardAmount.toString();
      const [intPart, fracPart = ""] = rewardDecimal.split(".");
      const fracPadded = fracPart.padEnd(PTF_DECIMALS, "0").slice(0, PTF_DECIMALS);
      amountRaw = BigInt(intPart + fracPadded);
      txHash = await adapter.releaseTaskReward(project.id, taskId, task.devAddress, amountRaw);
    } else {
      // Projets free : pas de transfert USDC — reward = réputation uniquement
      amountRaw = 0n;
      txHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
    }

    if (project.rewardMode === "paid" && task.devAddress) {
      const { computeSoftLock } = await import("./wallet.service.js");
      const lockAmount = computeSoftLock(Number(task.rewardAmount ?? 0));
      await adapter.softUnlock(task.devAddress, lockAmount).catch((err: unknown) => {
        console.error(`[EscrowService] softUnlock failed for ${task.devAddress} (task ${taskId}):`, err);
      });
    }

    // Récompense réputation (tous projets open-source)
    if (project.isOpenSource && task.reputationPoints > 0) {
      await this.reputationService.applyDelta(
        task.devAddress,
        chain,
        task.reputationPoints,
        "task:validated",
        taskId
      );
    }

    // F7 — utxoId : keccak256 du taskId pour obtenir un bytes32 sans troncature.
    // Buffer.from().hex.slice(0,64) tronque silencieusement les IDs > 32 octets (ex: UUID),
    // créant des collisions. keccak256 garantit un hash de longueur fixe, toujours correct.
    const utxoId = taskId.startsWith("0x")
      ? taskId
      : ethers.keccak256(ethers.toUtf8Bytes(taskId));

    if (project.rewardMode === "paid" && amountRaw > 0n) {
      await adapter.mintCredits(task.devAddress, amountRaw, taskId).catch((err: unknown) => {
        console.error(`[EscrowService] mintCredits failed for ${task.devAddress} (task ${taskId}):`, err);
      });
    }

    const releasedAt = new Date().toISOString();

    // Transition de statut DB + mise à jour contributeur
    await this.prisma.$transaction([
      this.prisma.task.update({
        where: { id: taskId },
        data: { status: "validated" },
      }),
      this.prisma.submission.updateMany({
        where: { taskId, status: "pending" },
        data: { status: "approved", completedAt: new Date() },
      }),
      this.prisma.contributorRecord.upsert({
        where: { projectId_devAddress: { projectId: project.id, devAddress: task.devAddress } },
        create: {
          projectId: project.id,
          devAddress: task.devAddress,
          tasksCompleted: 1,
          // F10 — Decimal; Prisma accepte string | Decimal | number pour les champs Decimal.
          totalEarned: task.rewardAmount ?? 0,
          lastActivity: new Date(),
        },
        update: {
          tasksCompleted: { increment: 1 },
          totalEarned: { increment: task.rewardAmount ?? 0 },
          lastActivity: new Date(),
        },
      }),
    ]);

    return {
      taskId,
      devAddress: task.devAddress,
      amount: Number(task.rewardAmount ?? 0),
      txHash,
      utxoId,
      releasedAt,
    };
  }
}
