import type { PrismaClient } from "@prisma/client";
import type { IChainRegistry } from "../bal/chain.registry.js";
import type { IReputationService } from "./reputation.service.js";
import { PtfError, PtfErrorCode } from "../types/errors.js";

const PTF_DECIMALS = 6;

export interface IEscrowService {
  releaseTaskReward(taskId: string, chain: string): Promise<ReleaseResult>;
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

  async releaseTaskReward(taskId: string, chain: string): Promise<ReleaseResult> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });

    if (!task) {
      throw new PtfError(PtfErrorCode.TASK_NOT_FOUND, `Tâche introuvable : ${taskId}`);
    }
    if (task.status !== "submitted" && task.status !== "under_review") {
      throw new PtfError(
        PtfErrorCode.TASK_IMMUTABLE,
        `Impossible de libérer le reward : statut inattendu "${task.status}" (attendu : submitted | under_review)`
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
      amountRaw = BigInt(Math.round(task.rewardAmount * 10 ** PTF_DECIMALS));
      txHash = await adapter.releaseTaskReward(project.id, taskId, task.devAddress, amountRaw);
    } else {
      // Projets free : pas de transfert USDC — reward = réputation uniquement
      amountRaw = 0n;
      txHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
    }

    // Unlock du soft-lock (projets paid)
    if (project.rewardMode === "paid" && task.devAddress) {
      await adapter.softUnlock(task.devAddress, BigInt(10 * 10 ** PTF_DECIMALS)).catch(() => {});
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

    // UTXO receipt on-chain (projets paid uniquement)
    const utxoId = task.id.startsWith("0x")
      ? task.id
      : "0x" + Buffer.from(taskId).toString("hex").slice(0, 64).padEnd(64, "0");

    if (project.rewardMode === "paid" && amountRaw > 0n) {
      await adapter.mintCredits(task.devAddress, amountRaw, taskId).catch(() => {});
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
      amount: task.rewardAmount ?? 0,
      txHash,
      utxoId,
      releasedAt,
    };
  }
}
