import type { PrismaClient } from "@prisma/client";
import type { IChainRegistry } from "../bal/chain.registry.js";

export const REPORT_REASONS = [
  "malicious_code",
  "plagiarism",
  "fraud",
  "harassment",
  "spam",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export interface IReportService {
  submit(input: {
    reporterId: string;
    reportedAddress: string;
    taskId?: string;
    reason: ReportReason;
    evidence: string;
  }): Promise<{ reportId: string }>;
  resolve(reportId: string, resolution: string): Promise<void>;
}

export class ReportService implements IReportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly chainRegistry: IChainRegistry
  ) {}

  async submit(input: {
    reporterId: string;
    reportedAddress: string;
    taskId?: string;
    reason: ReportReason;
    evidence: string;
  }): Promise<{ reportId: string }> {
    const reportedUser = await this.prisma.walletLink.findFirst({
      where: { address: input.reportedAddress.toLowerCase() },
    });

    if (!reportedUser) {
      // Créer un user ghost si inconnu
      const ghost = await this.prisma.user.create({
        data: {},
      });
      await this.prisma.walletLink.create({
        data: {
          userId: ghost.id,
          chain: "polygon",
          address: input.reportedAddress.toLowerCase(),
        },
      });
    }

    const reportedWallet = await this.prisma.walletLink.findFirstOrThrow({
      where: { address: input.reportedAddress.toLowerCase() },
    });

    const report = await this.prisma.report.create({
      data: {
        reporterId: input.reporterId,
        reportedUserId: reportedWallet.userId,
        taskId: input.taskId,
        reason: input.reason,
        evidence: input.evidence,
        status: "pending",
      },
    });

    // Analyse automatique — escalade si raison critique
    if (input.reason === "malicious_code" || input.reason === "fraud") {
      await this.prisma.report.update({
        where: { id: report.id },
        data: { status: "escalated" },
      });
    }

    return { reportId: report.id };
  }

  async resolve(reportId: string, resolution: string): Promise<void> {
    await this.prisma.report.update({
      where: { id: reportId },
      data: { status: "resolved", resolution },
    });
  }
}
