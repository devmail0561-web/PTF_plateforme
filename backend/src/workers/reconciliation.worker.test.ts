import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { ReconciliationWorker, maybeStartReconciliationWorker } from "./reconciliation.worker.js";

// ── Mocks ────────────────────────────────────────────────────────────────────

function makeMockPrisma() {
  return {
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
