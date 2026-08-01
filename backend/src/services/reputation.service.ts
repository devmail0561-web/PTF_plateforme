import type { PrismaClient } from "@prisma/client";
import type { IChainRegistry } from "../bal/chain.registry.js";
import type { TaskScoring, ReputationLevel } from "../types/index.js";
import { REPUTATION_LEVELS } from "../types/index.js";

export interface ReputationHistoryEntry {
  id: string;
  delta: number;
  reason: string;
  taskId?: string | null;
  chain?: string | null;
  txHash?: string | null;
  createdAt: Date;
}

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
  getHistory(devAddress: string, limit?: number, offset?: number): Promise<ReputationHistoryEntry[]>;
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
    // Vérifier le WalletLink AVANT l'appel on-chain pour éviter le no-op post-write
    const walletLink = await this.prisma.walletLink.findFirst({
      where: { address: devAddress.toLowerCase(), chain },
    });

    if (!walletLink) {
      // Log mais ne pas lancer d'erreur — le dev peut ne pas avoir lié son wallet sur cette chaîne
      console.warn(`[ReputationService] No WalletLink for ${devAddress} on ${chain} — skipping DB update`);
      return;
    }

    // Appel on-chain
    const adapter = this.chainRegistry.get(chain);
    const txHash = await adapter.setReputation(devAddress, BigInt(delta), reason);

    // Mise à jour atomique en un seul upsert + event dans une transaction
    await this.prisma.$transaction(async (tx) => {
      // Récupérer le score actuel pour calculer le nouveau total
      const existing = await tx.reputation.findUnique({ where: { userId: walletLink.userId } });
      const currentTotal = existing?.totalPoints ?? 0;
      const newTotal = Math.max(0, currentTotal + delta);
      const newLevel = this.getLevel(newTotal);

      const rep = await tx.reputation.upsert({
        where: { userId: walletLink.userId },
        create: {
          userId: walletLink.userId,
          totalPoints: newTotal,
          level: newLevel,
          completedTasks: delta > 0 ? 1 : 0,
        },
        update: {
          totalPoints: newTotal,
          level: newLevel,
          ...(delta > 0 ? { completedTasks: { increment: 1 } } : {}),
        },
      });

      await tx.reputationEvent.create({
        data: {
          reputationId: rep.id,
          delta,
          reason,
          taskId,
          chain,
          txHash,
        },
      });
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

  async getHistory(
    devAddress: string,
    limit = 50,
    offset = 0
  ): Promise<ReputationHistoryEntry[]> {
    const walletLink = await this.prisma.walletLink.findFirst({
      where: { address: devAddress.toLowerCase() },
      include: {
        user: {
          include: {
            reputation: {
              include: {
                history: {
                  orderBy: { createdAt: "desc" },
                  take: limit,
                  skip: offset,
                },
              },
            },
          },
        },
      },
    });

    return walletLink?.user.reputation?.history ?? [];
  }

  async isEligibleReviewer(devAddress: string): Promise<boolean> {
    const score = await this.getScore(devAddress);
    return score.total >= 2000;
  }
}
