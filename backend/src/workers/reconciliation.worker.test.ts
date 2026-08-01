import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { ReconciliationWorker, maybeStartReconciliationWorker } from "./reconciliation.worker.js";

// ── Mocks ────────────────────────────────────────────────────────────────────

function makeMockPrisma() {
  return {
    creditUTXO: {
      findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
    },
    syncCheckpoint: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
      upsert: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
    },
  };
}

describe("ReconciliationWorker", () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let worker: ReconciliationWorker;

  const baseConfig = {
    rpcUrl: "http://localhost:8545",
    vaultAddress: "0x1234567890abcdef1234567890abcdef12345678",
    chain: "polygon",
    intervalMs: 999_999,
    batchSize: 1000,
    startBlock: 0,
  };

  beforeEach(() => {
    prisma = makeMockPrisma();
    worker = new ReconciliationWorker(prisma as never, baseConfig);
    jest.clearAllMocks();
  });

  describe("getCheckpoint / saveCheckpoint", () => {
    it("returns startBlock when no checkpoint exists", async () => {
      prisma.syncCheckpoint.findUnique.mockResolvedValue(null);

      const cp = await (worker as any).getCheckpoint();
      expect(cp).toBe(0);
    });

    it("returns stored lastBlock from checkpoint", async () => {
      prisma.syncCheckpoint.findUnique.mockResolvedValue({ lastBlock: 3000 });

      const cp = await (worker as any).getCheckpoint();
      expect(cp).toBe(3000);
    });

    it("saves checkpoint via upsert with lowercase address", async () => {
      await (worker as any).saveCheckpoint(4500);

      expect(prisma.syncCheckpoint.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            chain_contractAddress: {
              chain: "polygon",
              contractAddress: baseConfig.vaultAddress.toLowerCase(),
            },
          },
          create: expect.objectContaining({ lastBlock: 4500 }),
          update: { lastBlock: 4500 },
        })
      );
    });
  });

  describe("detectStaleSpent — CIA-I9", () => {
    it("reverts stale withdrawal UTXOs to unspent", async () => {
      prisma.creditUTXO.findMany.mockResolvedValue([
        {
          id: "utxo-stale-1",
          status: "spent",
          spentInTxId: "tx-1",
          spendingTx: { id: "tx-1", type: "withdrawal", txHash: null, createdAt: new Date(0) },
        },
      ]);

      await (worker as any).detectStaleSpent();

      expect(prisma.creditUTXO.update).toHaveBeenCalledWith({
        where: { id: "utxo-stale-1" },
        data: { status: "unspent", spentInTxId: null },
      });
    });

    it("does NOT revert punishment transactions", async () => {
      prisma.creditUTXO.findMany.mockResolvedValue([
        {
          id: "utxo-punishment",
          status: "spent",
          spentInTxId: "tx-p",
          spendingTx: { id: "tx-p", type: "punishment", txHash: null, createdAt: new Date(0) },
        },
      ]);

      await (worker as any).detectStaleSpent();

      expect(prisma.creditUTXO.update).not.toHaveBeenCalled();
    });

    it("does NOT revert if spendingTx is null", async () => {
      prisma.creditUTXO.findMany.mockResolvedValue([
        {
          id: "utxo-no-tx",
          status: "spent",
          spentInTxId: "tx-x",
          spendingTx: null,
        },
      ]);

      await (worker as any).detectStaleSpent();

      expect(prisma.creditUTXO.update).not.toHaveBeenCalled();
    });

    it("handles multiple stale UTXOs", async () => {
      prisma.creditUTXO.findMany.mockResolvedValue([
        {
          id: "utxo-a",
          status: "spent",
          spentInTxId: "tx-a",
          spendingTx: { id: "tx-a", type: "withdrawal", txHash: null, createdAt: new Date(0) },
        },
        {
          id: "utxo-b",
          status: "spent",
          spentInTxId: "tx-b",
          spendingTx: { id: "tx-b", type: "withdrawal", txHash: null, createdAt: new Date(0) },
        },
      ]);

      await (worker as any).detectStaleSpent();

      expect(prisma.creditUTXO.update).toHaveBeenCalledTimes(2);
      expect(prisma.creditUTXO.update).toHaveBeenCalledWith({
        where: { id: "utxo-a" },
        data: { status: "unspent", spentInTxId: null },
      });
      expect(prisma.creditUTXO.update).toHaveBeenCalledWith({
        where: { id: "utxo-b" },
        data: { status: "unspent", spentInTxId: null },
      });
    });

    it("leaves empty result untouched", async () => {
      prisma.creditUTXO.findMany.mockResolvedValue([]);

      await (worker as any).detectStaleSpent();

      expect(prisma.creditUTXO.update).not.toHaveBeenCalled();
    });
  });

  describe("handleUTXOSpent", () => {
    it("skips if UTXO not found in DB (parseLog returns null)", async () => {
      const fakeEvent = {
        topics: ["0x01", "0x02", "0x03"],
        data: "0x",
        transactionHash: "0xdef",
      };

      // parseLog returns null → early return
      await (worker as any).handleUTXOSpent(fakeEvent);

      expect(prisma.creditUTXO.update).not.toHaveBeenCalled();
    });
  });

  describe("handleCreditClaimed", () => {
    it("exits early when parseLog returns null", async () => {
      const fakeEvent = {
        topics: ["0x01", "0x02", "0x03"],
        data: "0x",
        transactionHash: "0xabc",
      };

      // parseLog returns null in the real code when event doesn't match
      await (worker as any).handleCreditClaimed(fakeEvent);

      // Should not attempt any DB operation since parseLog returns null
      expect(prisma.creditUTXO.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("start / stop", () => {
    it("stop clears the interval timer", async () => {
      // Mock runOnce to do nothing (avoid real RPC calls)
      (worker as any).runOnce = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

      await worker.start();
      expect((worker as any).timer).not.toBeNull();

      await worker.stop();
      expect((worker as any).timer).toBeNull();
    });

    it("stop is safe to call when not started", async () => {
      await worker.stop();
      expect((worker as any).timer).toBeNull();
    });
  });

  describe("config defaults", () => {
    it("applies default intervalMs, batchSize, startBlock", () => {
      const w = new ReconciliationWorker(prisma as never, {
        rpcUrl: "http://localhost:8545",
        vaultAddress: "0xabc",
        chain: "ethereum",
      });
      const cfg = (w as any).config;
      expect(cfg.intervalMs).toBe(60_000);
      expect(cfg.batchSize).toBe(2000);
      expect(cfg.startBlock).toBe(0);
    });
  });
});

describe("maybeStartReconciliationWorker", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns null if RPC_HTTP_URL and RPC_URL are not set", async () => {
    delete process.env["RPC_HTTP_URL"];
    delete process.env["RPC_URL"];
    delete process.env["ESCROW_VAULT_ADDRESS"];

    const result = await maybeStartReconciliationWorker(makeMockPrisma() as never);
    expect(result).toBeNull();
  });

  it("returns null if ESCROW_VAULT_ADDRESS is not set", async () => {
    process.env["RPC_HTTP_URL"] = "http://localhost:8545";
    delete process.env["ESCROW_VAULT_ADDRESS"];

    const result = await maybeStartReconciliationWorker(makeMockPrisma() as never);
    expect(result).toBeNull();
  });
});
