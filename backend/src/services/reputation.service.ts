import type { IChainRegistry } from "../bal/chain.registry.js";
import type { TaskScoring, ReputationLevel } from "../types/index.js";
import { REPUTATION_LEVELS } from "../types/index.js";

export interface IReputationService {
  calculatePoints(scoring: TaskScoring, durationDays?: number): number;
  getLevel(points: number): ReputationLevel;
  getScore(devAddress: string, chain: string): Promise<{ total: number; level: ReputationLevel }>;
  applyDelta(
    devAddress: string,
    chain: string,
    delta: number,
    reason: string,
    taskId?: string
  ): Promise<void>;
  isEligibleReviewer(devAddress: string, chain: string): Promise<boolean>;
}

export class ReputationService implements IReputationService {
  constructor(
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

  async getScore(
    devAddress: string,
    chain: string
  ): Promise<{ total: number; level: ReputationLevel }> {
    const adapter = this.chainRegistry.get(chain);
    const raw = await adapter.getReputation(devAddress);
    const total = Number(raw);
    return { total, level: this.getLevel(total) };
  }

  async applyDelta(
    devAddress: string,
    chain: string,
    delta: number,
    reason: string,
    taskId?: string
  ): Promise<void> {
    const adapter = this.chainRegistry.get(chain);
    await adapter.applyReputationDelta(devAddress, BigInt(delta), taskId ?? "", reason);
  }

  async isEligibleReviewer(devAddress: string, chain: string): Promise<boolean> {
    const score = await this.getScore(devAddress, chain);
    return score.total >= 2000;
  }
}
