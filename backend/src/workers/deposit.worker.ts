/**
 * Deposit Worker (N1) — listens to on-chain EscrowVault events and materialises
 * them as CreditUTXOs in the database.
 *
 * Events handled:
 *   - CreditClaimed(utxoId, dev, amount)   → UTXOService.mint()
 *   - UTXOSpent(utxoId, txId)              → mark UTXO spent in DB (reconcile)
 *   - WithdrawalExecuted(txId, dev, net)   → no-op (spend() already handled it)
 *
 * Idempotency: UTXOs with an existing DB record are silently skipped so the worker
 * can be restarted or catch up from an old block without creating duplicates.
 *
 * Usage:
 *   import { DepositWorker } from "./workers/deposit.worker.js";
 *   const worker = new DepositWorker(prisma, chainRegistry);
 *   await worker.start();
 *   // on shutdown:
 *   await worker.stop();
 */

import { ethers } from "ethers";
import type { PrismaClient } from "@prisma/client";
import { UTXOService } from "../services/utxo.service.js";

// Minimal ABI — only the events we care about.
const ESCROW_VAULT_ABI = [
  "event CreditClaimed(bytes32 indexed utxoId, address indexed dev, uint256 amount, string chain)",
  "event UTXOSpent(bytes32 indexed utxoId, bytes32 indexed txId)",
  "event WithdrawalExecuted(bytes32 indexed txId, address indexed dev, uint256 netAmount)",
];

export interface DepositWorkerConfig {
  /** Ethereum JSON-RPC URL, e.g. wss://polygon-mainnet.infura.io/ws/v3/<key> */
  rpcUrl: string;
  /** Deployed EscrowVault contract address */
  vaultAddress: string;
  /** PTF public key (hex) used to verify UTXO signatures — the operator's address */
  ptfOperatorAddress: string;
  /** Chain identifier matching UTXOService / UTXO records (e.g. "polygon") */
  chain: string;
}

export class DepositWorker {
  private provider: ethers.WebSocketProvider | null = null;
  private contract: ethers.Contract | null = null;
  private utxoService: UTXOService;
  private readonly db: PrismaClient;

  constructor(
    prisma: PrismaClient,
    private readonly config: DepositWorkerConfig
  ) {
    this.db = prisma;
    this.utxoService = new UTXOService(prisma);
  }

  async start(): Promise<void> {
    this.provider = new ethers.WebSocketProvider(this.config.rpcUrl);
    this.contract = new ethers.Contract(
      this.config.vaultAddress,
      ESCROW_VAULT_ABI,
      this.provider
    );

    this.contract.on(
      "CreditClaimed",
      async (utxoId: string, dev: string, amountWei: bigint, chain: string) => {
        await this.handleCreditClaimed(utxoId, dev, amountWei, chain);
      }
    );

    this.contract.on(
      "UTXOSpent",
      async (utxoId: string, txId: string) => {
        await this.handleUtxoSpent(utxoId, txId);
      }
    );

    console.log(
      `[DepositWorker] Listening on ${this.config.chain} vault ${this.config.vaultAddress}`
    );
  }

  async stop(): Promise<void> {
    if (this.contract) {
      this.contract.removeAllListeners();
      this.contract = null;
    }
    if (this.provider) {
      await this.provider.destroy();
      this.provider = null;
    }
    console.log("[DepositWorker] Stopped.");
  }

  private async handleCreditClaimed(
    utxoId: string,
    dev: string,
    amountWei: bigint,
    chain: string
  ): Promise<void> {
    try {
      // Idempotency: skip if the UTXO already exists in DB.
      const existing = await this.db.creditUTXO.findUnique({ where: { id: utxoId } });
      if (existing) return;

      // Convert from on-chain fixed-point (1e6) to float PTF amount.
      const amount = Number(amountWei) / 1e6;

      await this.utxoService.mint({
        ownerAddress:  dev,
        amount,
        sourceType:    "deposit",
        sourceId:      utxoId,
        chain:         chain || this.config.chain,
        // On-chain deposits carry the on-chain tx hash as their signature proof.
        // The signature will be verified by verifyProof() using the operator address.
        ptfSignature:  utxoId, // placeholder — real sig is in the on-chain CreditClaimed event
        txHash:        utxoId,
      });

      console.log(`[DepositWorker] Minted UTXO ${utxoId} for ${dev} — ${amount} PTF`);
    } catch (err) {
      console.error(`[DepositWorker] handleCreditClaimed failed for ${utxoId}:`, err);
    }
  }

  private async handleUtxoSpent(utxoId: string, txId: string): Promise<void> {
    try {
      const utxo = await this.db.creditUTXO.findUnique({ where: { id: utxoId } });
      if (!utxo || utxo.status === "spent") return;

      // Reconcile: mark as spent in DB if the on-chain event fired but the DB wasn't updated
      // (covers the crash-after-on-chain / before-DB-commit scenario from N3).
      await this.db.creditUTXO.update({
        where: { id: utxoId },
        data:  { status: "spent", spentInTxId: txId },
      });

      console.log(`[DepositWorker] Reconciled spent UTXO ${utxoId} via txId ${txId}`);
    } catch (err) {
      console.error(`[DepositWorker] handleUtxoSpent failed for ${utxoId}:`, err);
    }
  }
}

/**
 * Boot the deposit worker from environment variables.
 * Call this from server.ts in production when RPC_URL and VAULT_ADDRESS are set.
 *
 * Example:
 *   import { maybeStartDepositWorker } from "./workers/deposit.worker.js";
 *   await maybeStartDepositWorker(prisma);
 */
export async function maybeStartDepositWorker(prisma: PrismaClient): Promise<DepositWorker | null> {
  const rpcUrl       = process.env["RPC_WS_URL"];
  const vaultAddress = process.env["ESCROW_VAULT_ADDRESS"];
  const operatorAddr = process.env["PTF_OPERATOR_ADDRESS"];
  const chain        = process.env["DEFAULT_CHAIN"] ?? "polygon";

  if (!rpcUrl || !vaultAddress) {
    console.warn(
      "[DepositWorker] RPC_WS_URL or ESCROW_VAULT_ADDRESS not set — deposit worker disabled. " +
      "On-chain deposits will not be reflected in DB until configured."
    );
    return null;
  }

  const worker = new DepositWorker(prisma, {
    rpcUrl,
    vaultAddress,
    ptfOperatorAddress: operatorAddr ?? "",
    chain,
  });
  await worker.start();
  return worker;
}
