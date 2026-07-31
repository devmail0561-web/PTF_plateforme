import type { PrismaClient } from "@prisma/client";
import type { IChainRegistry } from "../bal/chain.registry.js";
import type { TaskScoring, ReputationLevel } from "../types/index.js";
import { REPUTATION_LEVELS } from "../types/index.js";

export interface IReputationService {
  calculatePoints(scoring: TaskScoring, durationDays?: number): number;
  applyDelta(
    devAddress: string,
    chain: string,
    delta: number,
    reason: string,
    taskId?: string
  ): Promise<void>;
  getLevel(points: number): ReputationLevel;
  getScore(devAddress: string): Promise<{ total: number; level: ReputationLevel; completedTasks: number }>;
  isEligibleReviewer(devAddress: string): Promise<boolean>;
}

export class ReputationService implements IReputationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly chainRegistry: IChainRegistry
  ) {}

  calculatePoints(scoring: TaskScoring, durationDays = 30): number {
    const base = (scoring.complexity + scoring.effort + scoring.impact) * 10;
    let bonus = 0;
    if (durationDays < 7) bonus = Math.round(base * 0.1);
    else if (durationDays < 14) bonus = Math.round(base * 0.05);
    return base + bonus;
  }

  getLevel(points: number): ReputationLevel {
    for (const { level, min } of REPUTATION_LEVELS) {
      if (points >= min) return level;
    }
    return "Unranked";
  }

  async applyDelta(
    devAddress: string,
    chain: string,
    delta: number,
    reason: string,
    taskId?: string
  ): Promise<void> {
    // Mise à jour on-chain via ChainAdapter
    const adapter = this.chainRegistry.get(chain);
    const txHash = await adapter.setReputation(
      devAddress,
      BigInt(delta),
      reason
    );

    // Mise à jour en base via l'userId lié au wallet
    const walletLink = await this.prisma.walletLink.findFirst({
      where: { address: devAddress.toLowerCase(), chain },
    });

    if (!walletLink) return;

    const rep = await this.prisma.reputation.upsert({
      where: { userId: walletLink.userId },
      create: {
        userId: walletLink.userId,
        totalPoints: Math.max(0, delta),
        level: this.getLevel(Math.max(0, delta)),
        completedTasks: delta > 0 ? 1 : 0,
      },
      update: {
        totalPoints: { increment: delta },
      },
    });

    const newTotal = Math.max(0, rep.totalPoints);
    await this.prisma.reputation.update({
      where: { userId: walletLink.userId },
      data: {
        totalPoints: newTotal,
        level: this.getLevel(newTotal),
        completedTasks: delta > 0 ? { increment: 1 } : undefined,
      },
    });

    await this.prisma.reputationEvent.create({
      data: {
        reputationId: rep.id,
        delta,
        reason,
        taskId,
        chain,
        txHash,
      },
    });
  }

  async getScore(
    devAddress: string
  ): Promise<{ total: number; level: ReputationLevel; completedTasks: number }> {
    const walletLink = await this.prisma.walletLink.findFirst({
      where: { address: devAddress.toLowerCase() },
      include: { user: { include: { reputation: true } } },
    });

    if (!walletLink?.user.reputation) {
      return { total: 0, level: "Unranked", completedTasks: 0 };
    }

    const total = walletLink.user.reputation.totalPoints;
    return {
      total,
      level: this.getLevel(total),
      completedTasks: walletLink.user.reputation.completedTasks,
    };
  }

  async isEligibleReviewer(devAddress: string): Promise<boolean> {
    const score = await this.getScore(devAddress);
    return score.total >= 2000;
  }
}
