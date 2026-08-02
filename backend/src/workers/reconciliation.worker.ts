/**
 * Reconciliation Worker (N3) — synchronises the DB with on-chain state.
 *
 * Since the UTXO/credit models have been removed from the backend (on-chain is now
 * the single source of truth), this worker only tracks block checkpoints for future
 * on-chain event subscriptions (e.g. project/task state changes).
 *
 * Usage:
 *   import { ReconciliationWorker } from "./workers/reconciliation.worker.js";
 *   const worker = new ReconciliationWorker(prisma, config);
 *   await worker.start();
 *   await worker.stop();
 */

import type { PrismaClient } from "@prisma/client";

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
  private readonly config: Required<ReconciliationWorkerConfig>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(prisma: PrismaClient, config: ReconciliationWorkerConfig) {
    this.db = prisma;
    this.config = {
      ...config,
      intervalMs: config.intervalMs ?? 60_000,
      batchSize: config.batchSize ?? 2000,
      startBlock: config.startBlock ?? 0,
    };
  }

  async start(): Promise<void> {
    console.log(
      `[ReconciliationWorker] Starting on ${this.config.chain} — interval ${this.config.intervalMs}ms`
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
      const fromBlock = await this.getCheckpoint();
      // No RPC call needed if there's nothing to process
      console.log(`[ReconciliationWorker] Checkpoint: block ${fromBlock} on ${this.config.chain}`);
    } catch (err) {
      console.error("[ReconciliationWorker] Error during reconciliation:", err);
    } finally {
      this.running = false;
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
