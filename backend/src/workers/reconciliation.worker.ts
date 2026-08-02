/**
 * Reconciliation Worker (N3) — synchronises DB task statuses with on-chain events.
 *
 * Polls EscrowVault and ProjectRegistry logs in batches (batchSize blocks at a time),
 * saves the last processed block as a checkpoint in DB, and corrects any DB rows
 * whose status diverged from the on-chain truth (e.g. after a server crash mid-claim).
 *
 * Handles:
 *   TaskClaimed  → ensure DB status = "claimed"   (catches crashed claim_pending rows)
 *   SoftLocked   → no DB change needed (wallet state only)
 *   SoftUnlocked → no DB change needed
 *   TaskRewarded → ensure DB status = "validated"
 */

import { ethers } from "ethers";
import type { PrismaClient } from "@prisma/client";

const PROJECT_REGISTRY_ABI = [
  "event TaskClaimed(bytes32 indexed projectId, bytes32 indexed taskId, address indexed dev)",
  "event MerkleRootUpdated(bytes32 indexed projectId, bytes32 newRoot)",
];

const ESCROW_VAULT_ABI = [
  "event SoftLocked(address indexed dev, uint256 amount)",
  "event SoftUnlocked(address indexed dev, uint256 amount)",
  "event TaskRewarded(bytes32 indexed projectId, bytes32 indexed taskId, address indexed dev, uint256 amount)",
];

export interface ReconciliationWorkerConfig {
  rpcUrl: string;
  registryAddress: string;
  vaultAddress: string;
  chain: string;
  intervalMs?: number;
  batchSize?: number;
  startBlock?: number;
}

export class ReconciliationWorker {
  private readonly db: PrismaClient;
  private readonly config: Required<ReconciliationWorkerConfig>;
  private readonly provider: ethers.JsonRpcProvider;
  private readonly registry: ethers.Contract;
  private readonly vault: ethers.Contract;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(prisma: PrismaClient, config: ReconciliationWorkerConfig) {
    this.db     = prisma;
    this.config = {
      ...config,
      intervalMs: config.intervalMs ?? 60_000,
      batchSize:  config.batchSize  ?? 2000,
      startBlock: config.startBlock ?? 0,
    };
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.registry = new ethers.Contract(config.registryAddress, PROJECT_REGISTRY_ABI, this.provider);
    this.vault    = new ethers.Contract(config.vaultAddress,    ESCROW_VAULT_ABI,     this.provider);
  }

  async start(): Promise<void> {
    console.log(`[ReconciliationWorker] Starting on ${this.config.chain} — interval ${this.config.intervalMs}ms`);
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
      const fromBlock  = await this.getCheckpoint();
      const latestBlock = await this.provider.getBlockNumber();

      if (fromBlock >= latestBlock) return;

      const toBlock = Math.min(fromBlock + this.config.batchSize, latestBlock);

      await Promise.all([
        this.reconcileTaskClaimed(fromBlock, toBlock),
        this.reconcileTaskRewarded(fromBlock, toBlock),
        this.reconcileStaleClaimPending(),
      ]);

      await this.saveCheckpoint(toBlock);
      console.log(`[ReconciliationWorker] Reconciled blocks ${fromBlock}→${toBlock} on ${this.config.chain}`);
    } catch (err) {
      console.error("[ReconciliationWorker] Error during reconciliation:", err);
    } finally {
      this.running = false;
    }
  }

  // TaskClaimed on-chain → fix any DB row stuck in claim_pending
  private async reconcileTaskClaimed(from: number, to: number): Promise<void> {
    const filter = this.registry.filters["TaskClaimed"]();
    const events = await this.registry.queryFilter(filter, from, to);

    for (const ev of events) {
      const taskId = (ev as ethers.EventLog).args[1] as string;
      await this.db.task.updateMany({
        where:  { id: taskId, status: "claim_pending" },
        data:   { status: "claimed" },
      });
    }
  }

  // TaskRewarded on-chain → ensure DB status = validated
  private async reconcileTaskRewarded(from: number, to: number): Promise<void> {
    const filter = this.vault.filters["TaskRewarded"]();
    const events = await this.vault.queryFilter(filter, from, to);

    for (const ev of events) {
      const taskId = (ev as ethers.EventLog).args[1] as string;
      await this.db.task.updateMany({
        where:  { id: taskId, status: { not: "validated" } },
        data:   { status: "validated" },
      });
    }
  }

  // Any row stuck in claim_pending for > 5 min without an on-chain confirmation
  // is rolled back to open — the on-chain call clearly failed.
  private async reconcileStaleClaimPending(): Promise<void> {
    const staleThreshold = new Date(Date.now() - 5 * 60_000);
    await this.db.task.updateMany({
      where: {
        status:    "claim_pending",
        claimedAt: { lt: staleThreshold },
      },
      data: {
        status:        "open",
        claimedAt:     null,
        deadline:      null,
        devAddress:    null,
        conditionsHash: null,
      },
    });
  }

  private async getCheckpoint(): Promise<number> {
    const cp = await this.db.syncCheckpoint.findUnique({
      where: {
        chain_contractAddress: {
          chain:           this.config.chain,
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
          chain:           this.config.chain,
          contractAddress: this.config.vaultAddress.toLowerCase(),
        },
      },
      create: { chain: this.config.chain, contractAddress: this.config.vaultAddress.toLowerCase(), lastBlock: block },
      update: { lastBlock: block },
    });
  }
}

export async function maybeStartReconciliationWorker(prisma: PrismaClient): Promise<ReconciliationWorker | null> {
  const rpcUrl          = process.env["RPC_HTTP_URL"] ?? process.env["RPC_URL"] ?? process.env["RPC_POLYGON"];
  const vaultAddress    = process.env["ESCROW_VAULT_ADDRESS"]   ?? process.env["CONTRACT_ESCROW_VAULT_POLYGON"];
  const registryAddress = process.env["CONTRACT_PROJECT_REGISTRY_POLYGON"];
  const chain           = process.env["DEFAULT_CHAIN"] ?? "polygon";

  if (!rpcUrl || !vaultAddress || !registryAddress) {
    console.warn("[ReconciliationWorker] RPC_URL, ESCROW_VAULT_ADDRESS or CONTRACT_PROJECT_REGISTRY_POLYGON not set — reconciliation disabled.");
    return null;
  }

  const worker = new ReconciliationWorker(prisma, {
    rpcUrl,
    vaultAddress,
    registryAddress,
    chain,
    intervalMs: parseInt(process.env["RECONCILIATION_INTERVAL_MS"] ?? "60000"),
    batchSize:  parseInt(process.env["RECONCILIATION_BATCH_SIZE"]  ?? "2000"),
    startBlock: parseInt(process.env["RECONCILIATION_START_BLOCK"] ?? "0"),
  });
  await worker.start();
  return worker;
}
