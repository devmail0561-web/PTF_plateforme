/**
 * Reconciliation Worker (N3) — scans historical on-chain events from a stored
 * checkpoint and reconciles the DB with on-chain truth.
 *
 * Handles two reconciliation scenarios:
 *   1. Missed CreditClaimed events → mints UTXOs that the DepositWorker missed (crash/downtime)
 *   2. Missed UTXOSpent events → marks UTXOs as spent that were consumed on-chain
 *      but DB still shows as unspent (CIA-I9: DB commit before on-chain confirmation)
 *
 * The worker runs on a configurable interval (default: every 60s) and processes
 * blocks in batches to avoid RPC rate limits.
 *
 * Usage:
 *   import { ReconciliationWorker } from "./workers/reconciliation.worker.js";
 *   const worker = new ReconciliationWorker(prisma, config);
 *   await worker.start();
 *   await worker.stop();
 */

import { ethers } from "ethers";
import type { PrismaClient } from "@prisma/client";
import { UTXOService } from "../services/utxo.service.js";

const ESCROW_VAULT_ABI = [
  "event CreditClaimed(bytes32 indexed utxoId, address indexed dev, uint256 amount, string chain)",
  "event UTXOSpent(bytes32 indexed utxoId, bytes32 indexed txId)",
  "event WithdrawalExecuted(bytes32 indexed txId, address indexed dev, uint256 netAmount)",
];

export interface ReconciliationWorkerConfig {
  rpcUrl: string;
  vaultAddress: string;
  chain: string;
  intervalMs?: number;
  batchSize?: number;
  startBlock?: number;
}

export class ReconciliationWorker {
  private readonly db: PrismaClient;
  private readonly utxoService: UTXOService;
  private readonly config: Required<ReconciliationWorkerConfig>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(prisma: PrismaClient, config: ReconciliationWorkerConfig) {
    this.db = prisma;
    this.utxoService = new UTXOService(prisma);
    this.config = {
      ...config,
      intervalMs: config.intervalMs ?? 60_000,
      batchSize: config.batchSize ?? 2000,
      startBlock: config.startBlock ?? 0,
    };
  }

  async start(): Promise<void> {
    console.log(
      `[ReconciliationWorker] Starting on ${this.config.chain} — interval ${this.config.intervalMs}ms, batch ${this.config.batchSize} blocks`
    );
    await this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.config.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("[ReconciliationWorker] Stopped.");
  }

  private async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = await this.getCheckpoint();
      const toBlock = currentBlock;

      if (fromBlock >= toBlock) {
        this.running = false;
        return;
      }

      const contract = new ethers.Contract(
        this.config.vaultAddress,
        ESCROW_VAULT_ABI,
        provider
      );

      let processed = fromBlock;
      while (processed < toBlock) {
        const batchEnd = Math.min(processed + this.config.batchSize, toBlock);

        await this.processBatch(contract, processed + 1, batchEnd);
        await this.saveCheckpoint(batchEnd);
        processed = batchEnd;
      }

      console.log(
        `[ReconciliationWorker] Synced blocks ${fromBlock + 1}..${toBlock} (${toBlock - fromBlock} blocks)`
      );

      // CIA-I9: detect stale "spent" UTXOs that were marked spent in DB but never confirmed
      // on-chain (e.g. withdrawal tx reverted). Only runs after full catch-up.
      await this.detectStaleSpent();
    } catch (err) {
      console.error("[ReconciliationWorker] Error during reconciliation:", err);
    } finally {
      this.running = false;
    }
  }

  private async processBatch(
    contract: ethers.Contract,
    from: number,
    to: number
  ): Promise<void> {
    const [claimEvents, spentEvents] = await Promise.all([
      contract.queryFilter(contract.filters.CreditClaimed(), from, to),
      contract.queryFilter(contract.filters.UTXOSpent(), from, to),
    ]);

    for (const event of claimEvents) {
      await this.handleCreditClaimed(event);
    }

    for (const event of spentEvents) {
      await this.handleUTXOSpent(event);
    }
  }

  private async handleCreditClaimed(event: ethers.EventLog | ethers.Log): Promise<void> {
    const parsed = new ethers.Interface(ESCROW_VAULT_ABI).parseLog({
      topics: event.topics as string[],
      data: event.data,
    });
    if (!parsed) return;

    const [utxoId, dev, amountWei, chain] = parsed.args;

    const existing = await this.db.creditUTXO.findFirst({
      where: { sourceId: utxoId as string, sourceType: "deposit" },
    });
    if (existing) return;

    const amount = Number(amountWei as bigint) / 1e6;

    await this.utxoService.mint({
      ownerAddress: dev as string,
      amount,
      sourceType: "deposit",
      sourceId: utxoId as string,
      chain: (chain as string) || this.config.chain,
      ptfSignature: `deposit:${utxoId}`,
      txHash: event.transactionHash,
    });

    console.log(`[ReconciliationWorker] Backfilled CreditClaimed UTXO ${utxoId} for ${dev}`);
  }

  private async handleUTXOSpent(event: ethers.EventLog | ethers.Log): Promise<void> {
    const parsed = new ethers.Interface(ESCROW_VAULT_ABI).parseLog({
      topics: event.topics as string[],
      data: event.data,
    });
    if (!parsed) return;

    const [utxoId, txId] = parsed.args;

    const utxo = await this.db.creditUTXO.findFirst({
      where: {
        OR: [
          { id: utxoId as string },
          { sourceId: utxoId as string },
        ],
      },
    });

    if (!utxo || utxo.status === "spent") return;

    await this.db.creditUTXO.update({
      where: { id: utxo.id },
      data: { status: "spent", spentInTxId: txId as string },
    });

    console.log(`[ReconciliationWorker] Reconciled spent UTXO ${utxo.id} (on-chain: ${utxoId})`);
  }

  /**
   * CIA-I9: Detect UTXOs marked "spent" in DB whose associated CreditTransaction
   * has no txHash (on-chain confirmation) and is older than 10 minutes.
   * These represent failed/reverted on-chain withdrawals — revert them to "unspent".
   */
  private async detectStaleSpent(): Promise<void> {
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);

    const staleUtxos = await this.db.creditUTXO.findMany({
      where: {
        status: "spent",
        spentInTxId: { not: null },
        spendingTx: {
          txHash: null,
          createdAt: { lt: staleThreshold },
        },
      },
      include: { spendingTx: true },
      take: 100,
    });

    for (const utxo of staleUtxos) {
      if (!utxo.spendingTx) continue;
      // Only revert withdrawal transactions — punishments are authoritative from DB
      if (utxo.spendingTx.type !== "withdrawal") continue;

      await this.db.creditUTXO.update({
        where: { id: utxo.id },
        data: { status: "unspent", spentInTxId: null },
      });

      console.log(
        `[ReconciliationWorker] CIA-I9: Reverted stale spent UTXO ${utxo.id} — ` +
        `withdrawal tx ${utxo.spentInTxId} never confirmed on-chain`
      );
    }
  }

  private async getCheckpoint(): Promise<number> {
    const cp = await this.db.syncCheckpoint.findUnique({
      where: {
        chain_contractAddress: {
          chain: this.config.chain,
          contractAddress: this.config.vaultAddress.toLowerCase(),
        },
      },
    });
    return cp?.lastBlock ?? this.config.startBlock;
  }

  private async saveCheckpoint(block: number): Promise<void> {
    await this.db.syncCheckpoint.upsert({
      where: {
        chain_contractAddress: {
          chain: this.config.chain,
          contractAddress: this.config.vaultAddress.toLowerCase(),
        },
      },
      create: {
        chain: this.config.chain,
        contractAddress: this.config.vaultAddress.toLowerCase(),
        lastBlock: block,
      },
      update: {
        lastBlock: block,
      },
    });
  }
}

export async function maybeStartReconciliationWorker(
  prisma: PrismaClient
): Promise<ReconciliationWorker | null> {
  const rpcUrl = process.env["RPC_HTTP_URL"] ?? process.env["RPC_URL"];
  const vaultAddress = process.env["ESCROW_VAULT_ADDRESS"];
  const chain = process.env["DEFAULT_CHAIN"] ?? "polygon";
  const intervalMs = parseInt(process.env["RECONCILIATION_INTERVAL_MS"] ?? "60000");
  const batchSize = parseInt(process.env["RECONCILIATION_BATCH_SIZE"] ?? "2000");
  const startBlock = parseInt(process.env["RECONCILIATION_START_BLOCK"] ?? "0");

  if (!rpcUrl || !vaultAddress) {
    console.warn(
      "[ReconciliationWorker] RPC_HTTP_URL or ESCROW_VAULT_ADDRESS not set — reconciliation disabled."
    );
    return null;
  }

  const worker = new ReconciliationWorker(prisma, {
    rpcUrl,
    vaultAddress,
    chain,
    intervalMs,
    batchSize,
    startBlock,
  });
  await worker.start();
  return worker;
}
