import type { PrismaClient } from "@prisma/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPrisma = any;

export type CreditEventType =
  | "reward_earned"
  | "punishment_deducted"
  | "soft_locked"
  | "soft_unlocked"
  | "deposit"
  | "withdrawal"
  | "bridge_out"
  | "bridge_in";

export interface CreditEventEntry {
  id: string;
  devAddress: string;
  type: CreditEventType;
  direction: "credit" | "debit";
  amount: number;
  balanceAfter?: number | null;
  taskId?: string | null;
  projectId?: string | null;
  chain: string;
  txHash?: string | null;
  note?: string | null;
  createdAt: Date;
}

export interface ICreditLedgerService {
  record(params: {
    devAddress: string;
    type: CreditEventType;
    amount: number;
    balanceAfter?: number;
    taskId?: string;
    projectId?: string;
    chain: string;
    txHash?: string;
    note?: string;
  }): Promise<void>;

  getHistory(
    devAddress: string,
    options?: { limit?: number; offset?: number; type?: CreditEventType }
  ): Promise<CreditEventEntry[]>;

  getBalance(devAddress: string): Promise<{
    totalCredits: number;
    totalDebits: number;
    net: number;
  }>;
}

const DIRECTION: Record<CreditEventType, "credit" | "debit"> = {
  reward_earned:      "credit",
  soft_unlocked:      "credit",
  deposit:            "credit",
  bridge_in:          "credit",
  punishment_deducted: "debit",
  soft_locked:        "debit",
  withdrawal:         "debit",
  bridge_out:         "debit",
};

export class CreditLedgerService implements ICreditLedgerService {
  // AnyPrisma because the generated client is regenerated after `prisma generate`
  // and won't include CreditEvent until then.
  private readonly db: AnyPrisma;

  constructor(prisma: PrismaClient) {
    this.db = prisma;
  }

  async record(params: {
    devAddress: string;
    type: CreditEventType;
    amount: number;
    balanceAfter?: number;
    taskId?: string;
    projectId?: string;
    chain: string;
    txHash?: string;
    note?: string;
  }): Promise<void> {
    await this.db.creditEvent.create({
      data: {
        devAddress: params.devAddress.toLowerCase(),
        type: params.type,
        direction: DIRECTION[params.type],
        amount: params.amount,
        balanceAfter: params.balanceAfter ?? null,
        taskId: params.taskId ?? null,
        projectId: params.projectId ?? null,
        chain: params.chain,
        txHash: params.txHash ?? null,
        note: params.note ?? null,
      },
    });
  }

  async getHistory(
    devAddress: string,
    options: { limit?: number; offset?: number; type?: CreditEventType } = {}
  ): Promise<CreditEventEntry[]> {
    const { limit = 50, offset = 0, type } = options;

    const events = await this.db.creditEvent.findMany({
      where: {
        devAddress: devAddress.toLowerCase(),
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    return events as CreditEventEntry[];
  }

  async getBalance(devAddress: string): Promise<{
    totalCredits: number;
    totalDebits: number;
    net: number;
  }> {
    const credits = await this.db.creditEvent.aggregate({
      where: { devAddress: devAddress.toLowerCase(), direction: "credit" },
      _sum: { amount: true },
    });
    const debits = await this.db.creditEvent.aggregate({
      where: { devAddress: devAddress.toLowerCase(), direction: "debit" },
      _sum: { amount: true },
    });

    const totalCredits = credits._sum.amount ?? 0;
    const totalDebits  = debits._sum.amount ?? 0;

    return {
      totalCredits,
      totalDebits,
      net: parseFloat((totalCredits - totalDebits).toFixed(6)),
    };
  }
}
