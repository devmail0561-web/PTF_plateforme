/**
 * Deposit Worker (N1) — stub.
 *
 * The UTXO model has been removed from the backend. On-chain deposit tracking
 * is now handled entirely by the smart contracts (EscrowVault). This worker
 * is kept as a stub for future use (e.g. syncing ContributorRecord on deposit).
 */

import type { PrismaClient } from "@prisma/client";

export interface DepositWorkerConfig {
  rpcUrl: string;
  vaultAddress: string;
  ptfOperatorAddress: string;
  chain: string;
}

export class DepositWorker {
  constructor(
    _prisma: PrismaClient,
    private readonly config: DepositWorkerConfig
  ) {}

  async start(): Promise<void> {
    console.log(
      `[DepositWorker] Stub mode — on-chain deposits are tracked by EscrowVault contracts. Chain: ${this.config.chain}`
    );
  }

  async stop(): Promise<void> {
    // no-op
  }
}

export async function maybeStartDepositWorker(_prisma: PrismaClient): Promise<DepositWorker | null> {
  const rpcUrl       = process.env["RPC_WS_URL"];
  const vaultAddress = process.env["ESCROW_VAULT_ADDRESS"];

  if (!rpcUrl || !vaultAddress) {
    return null;
  }

  const worker = new DepositWorker(_prisma, {
    rpcUrl,
    vaultAddress,
    ptfOperatorAddress: process.env["PTF_OPERATOR_ADDRESS"] ?? "",
    chain: process.env["DEFAULT_CHAIN"] ?? "polygon",
  });
  await worker.start();
  return worker;
}
