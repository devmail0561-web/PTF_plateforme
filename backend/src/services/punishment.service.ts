import type { PrismaClient } from "@prisma/client";
import type { IChainRegistry } from "../bal/chain.registry.js";
import type { IReputationService } from "./reputation.service.js";
import type { ICreditLedgerService } from "./creditLedger.service.js";
import type { PunishmentType, Punishments } from "../types/index.js";

export interface IPunishmentService {
  execute(
    type: PunishmentType,
    devAddress: string,
    taskId: string,
    chain: string,
    rewardMode: "free" | "paid",
    customPunishments?: Punishments
  ): Promise<void>;
  detectLateDelivery(deadline: Date): boolean;
}

const DEFAULT_PUNISHMENTS: Punishments = {
  lateDelivery: { credits: 20, reputation: 10 },
  maliciousCode: { credits: 100, reputation: 500 },
  criticalBug: { credits: 50, reputation: 30 },
  nonCriticalBug: { credits: 5, reputation: 2 },
};

const PTF_DECIMALS = 6;

export class PunishmentService implements IPunishmentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly chainRegistry: IChainRegistry,
    private readonly reputationService: IReputationService,
    private readonly creditLedger: ICreditLedgerService
  ) {}

  async execute(
    type: PunishmentType,
    devAddress: string,
    taskId: string,
    chain: string,
    rewardMode: "free" | "paid",
    customPunishments?: Punishments
  ): Promise<void> {
    const punishments = customPunishments ?? DEFAULT_PUNISHMENTS;
    const rule = punishments[type];

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });
    const projectId = task?.projectId ?? "";

    let txHash: string | undefined;

    // Pénalité crédits (projets paid uniquement)
    if (rewardMode === "paid" && rule.credits && rule.credits > 0) {
      const amountRaw = BigInt(Math.round(rule.credits * 10 ** PTF_DECIMALS));
      const adapter = this.chainRegistry.get(chain);
      // EscrowVault distribue : 80% trésorerie PTF / 20% fonds projet
      txHash = await adapter.deductPenalty(devAddress, amountRaw, type, projectId);

      // Journalisation traçabilité crédits
      await this.creditLedger.record({
        devAddress,
        type: "punishment_deducted",
        amount: rule.credits,
        taskId,
        projectId,
        chain,
        txHash,
        note: `punishment:${type}`,
      });
    }

    // Pénalité réputation (tous projets)
    await this.reputationService.applyDelta(
      devAddress,
      chain,
      -rule.reputation,
      `punishment:${type}`,
      taskId
    );

    // Enregistrement immuable
    await this.prisma.punishmentRecord.create({
      data: {
        devAddress: devAddress.toLowerCase(),
        taskId,
        type,
        creditsPenalty: rewardMode === "paid" ? (rule.credits ?? 0) : null,
        reputationPenalty: rule.reputation,
        txHash,
      },
    });
  }

  detectLateDelivery(deadline: Date): boolean {
    return new Date() > deadline;
  }
}
