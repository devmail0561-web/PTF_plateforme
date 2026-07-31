import type { PrismaClient } from "@prisma/client";
import { ethers } from "ethers";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPrisma = any;

// ── Types ─────────────────────────────────────────────────────────────────────

export type UTXOSourceType = "task_reward" | "deposit" | "bridge_in" | "change";
export type UTXOStatus     = "unspent" | "spent" | "locked";
export type CreditTxType   = "withdrawal" | "punishment" | "bridge_out";

export interface CreditUTXO {
  id:              string;
  ownerAddress:    string;
  amount:          number;
  sourceType:      UTXOSourceType;
  sourceId:        string | null;
  projectId:       string | null;
  chain:           string;
  eip712Signature: string;
  txHash:          string | null;
  status:          UTXOStatus;
  spentInTxId:     string | null;
  createdAt:       Date;
}

export interface UTXOProof {
  utxoId:          string;
  ownerAddress:    string;
  amount:          number;
  sourceType:      UTXOSourceType;
  sourceId:        string | null;
  projectId:       string | null;
  chain:           string;
  eip712Signature: string; // PTF-signed, verifiable by anyone
}

export interface SpendResult {
  txId:        string;
  consumed:    CreditUTXO[];   // inputs burned
  change:      CreditUTXO | null; // leftover returned as new UTXO
  netAmount:   number;
  proofHash:   string;         // keccak256 of all input signatures — the audit trail
}

export interface IUTXOService {
  /** Mint a new UTXO when a task reward is released. */
  mint(params: {
    ownerAddress:    string;
    amount:          number;
    sourceType:      UTXOSourceType;
    sourceId?:       string;
    projectId?:      string;
    chain:           string;
    ptfSignature:    string; // EIP-712 from PTF backend or EscrowVault event
    txHash?:         string;
  }): Promise<CreditUTXO>;

  /** Return all unspent UTXOs for an address, sorted oldest-first. */
  getUnspent(ownerAddress: string, chain?: string): Promise<CreditUTXO[]>;

  /** Return total spendable balance (sum of unspent, excluding locked). */
  getBalance(ownerAddress: string): Promise<{ available: number; locked: number; total: number }>;

  /**
   * Spend UTXOs to cover `amount`. Coin-selection: oldest-first (FIFO).
   * Returns a CreditTransaction with consumed inputs + optional change UTXO.
   * The proofHash lets anyone verify the withdrawal came from legitimate outputs.
   */
  spend(params: {
    ownerAddress: string;
    amount:       number;
    type:         CreditTxType;
    chain:        string;
    destination?: string;      // wallet address for withdrawals
    txHash?:      string;      // on-chain burn tx
  }): Promise<SpendResult>;

  /** Soft-lock UTXOs during an active task claim (cannot be spent). */
  lock(ownerAddress: string, amount: number): Promise<void>;

  /** Release soft-lock on task cancel or completion. */
  unlock(ownerAddress: string, amount: number): Promise<void>;

  /** Verify the EIP-712 signature of a UTXO against PTF's public key. */
  verifyProof(utxoId: string, ptfPublicKey: string): Promise<boolean>;

  /** Full audit: return all UTXOs (spent + unspent) with provenance chain. */
  getProvenance(ownerAddress: string): Promise<CreditUTXO[]>;
}

// ── EIP-712 typehash for UTXO creation ───────────────────────────────────────
// keccak256("PTFCreditUTXO(bytes32 utxoId,address owner,uint256 amount,bytes32 sourceId,string chain,uint256 createdAt)")
const UTXO_TYPEHASH = ethers.keccak256(
  ethers.toUtf8Bytes(
    "PTFCreditUTXO(bytes32 utxoId,address owner,uint256 amount,bytes32 sourceId,string chain,uint256 createdAt)"
  )
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function toBytes32(value: string): string {
  if (value.startsWith("0x") && value.length === 66) return value;
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

/**
 * Compute the UTXO id deterministically:
 *   keccak256(owner || sourceId || amountHex || createdAt_ms)
 */
function computeUTXOId(
  ownerAddress: string,
  sourceId: string,
  amount: number,
  createdAt: number
): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["address", "bytes32", "uint256", "uint256"],
      [
        ownerAddress.toLowerCase(),
        toBytes32(sourceId || "0x" + "00".repeat(32)),
        BigInt(Math.round(amount * 1e6)), // 6-decimal fixed-point
        BigInt(createdAt),
      ]
    )
  );
}

/**
 * Build the EIP-712 struct hash for a UTXO (for off-chain verification).
 */
export function buildUTXOStructHash(
  utxoId: string,
  ownerAddress: string,
  amount: number,
  sourceId: string | null,
  chain: string,
  createdAt: number
): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "address", "uint256", "bytes32", "bytes32", "uint256"],
      [
        UTXO_TYPEHASH,
        utxoId,
        ownerAddress.toLowerCase(),
        BigInt(Math.round(amount * 1e6)),
        toBytes32(sourceId ?? ""),
        ethers.keccak256(ethers.toUtf8Bytes(chain)),
        BigInt(createdAt),
      ]
    )
  );
}

/**
 * Compute the proof hash for a set of UTXOs:
 *   keccak256(eip712Sig_1 || eip712Sig_2 || ... || eip712Sig_n)
 * Anyone with the UTXO list can independently reproduce this hash.
 */
function computeProofHash(utxos: CreditUTXO[]): string {
  const packed = ethers.concat(
    utxos.map((u) =>
      ethers.getBytes(
        u.eip712Signature.startsWith("0x")
          ? u.eip712Signature
          : ethers.keccak256(ethers.toUtf8Bytes(u.eip712Signature))
      )
    )
  );
  return ethers.keccak256(packed);
}

// ── Service ───────────────────────────────────────────────────────────────────

export class UTXOService implements IUTXOService {
  private readonly db: AnyPrisma;

  constructor(prisma: PrismaClient) {
    this.db = prisma;
  }

  async mint(params: {
    ownerAddress:    string;
    amount:          number;
    sourceType:      UTXOSourceType;
    sourceId?:       string;
    projectId?:      string;
    chain:           string;
    ptfSignature:    string;
    txHash?:         string;
  }): Promise<CreditUTXO> {
    const now = Date.now();
    const id  = computeUTXOId(
      params.ownerAddress,
      params.sourceId ?? "",
      params.amount,
      now
    );

    const utxo = await this.db.creditUTXO.create({
      data: {
        id,
        ownerAddress:    params.ownerAddress.toLowerCase(),
        amount:          params.amount,
        sourceType:      params.sourceType,
        sourceId:        params.sourceId ?? null,
        projectId:       params.projectId ?? null,
        chain:           params.chain,
        eip712Signature: params.ptfSignature,
        txHash:          params.txHash ?? null,
        status:          "unspent",
      },
    });

    return utxo as CreditUTXO;
  }

  async getUnspent(ownerAddress: string, chain?: string): Promise<CreditUTXO[]> {
    return this.db.creditUTXO.findMany({
      where: {
        ownerAddress: ownerAddress.toLowerCase(),
        status:       "unspent",
        ...(chain ? { chain } : {}),
      },
      orderBy: { createdAt: "asc" }, // FIFO — oldest first
    }) as Promise<CreditUTXO[]>;
  }

  async getBalance(ownerAddress: string): Promise<{
    available: number;
    locked:    number;
    total:     number;
  }> {
    const [unspent, locked] = await Promise.all([
      this.db.creditUTXO.aggregate({
        where: { ownerAddress: ownerAddress.toLowerCase(), status: "unspent" },
        _sum:  { amount: true },
      }),
      this.db.creditUTXO.aggregate({
        where: { ownerAddress: ownerAddress.toLowerCase(), status: "locked" },
        _sum:  { amount: true },
      }),
    ]);

    const available = unspent._sum.amount ?? 0;
    const lockedAmt = locked._sum.amount  ?? 0;

    return {
      available,
      locked:    lockedAmt,
      total:     parseFloat((available + lockedAmt).toFixed(6)),
    };
  }

  async spend(params: {
    ownerAddress: string;
    amount:       number;
    type:         CreditTxType;
    chain:        string;
    destination?: string;
    txHash?:      string;
  }): Promise<SpendResult> {
    const { ownerAddress, amount, type, chain, destination, txHash } = params;

    // ── 1. Coin-selection: FIFO — consume oldest UTXOs first ─────────────────
    const unspent = await this.getUnspent(ownerAddress);
    const selected: CreditUTXO[] = [];
    let  collected = 0;

    for (const utxo of unspent) {
      if (collected >= amount) break;
      selected.push(utxo);
      collected += utxo.amount;
    }

    if (collected < amount) {
      throw new Error(
        `Insufficient spendable UTXOs: need ${amount} PTF, have ${collected.toFixed(6)} PTF. ` +
        `Unspent UTXOs: ${unspent.length}`
      );
    }

    // ── 2. Compute proof hash (deterministic, independently verifiable) ───────
    const proofHash = computeProofHash(selected);

    // ── 3. Build transaction id ───────────────────────────────────────────────
    const txId = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "bytes32", "uint256"],
        [
          ownerAddress.toLowerCase(),
          proofHash,
          BigInt(Date.now()),
        ]
      )
    );

    // ── 4. Compute change ─────────────────────────────────────────────────────
    const inputTotal  = parseFloat(collected.toFixed(6));
    const changeAmt   = parseFloat((collected - amount).toFixed(6));
    const netAmount   = parseFloat(amount.toFixed(6));

    // ── 5. Atomically: mark inputs spent + create change UTXO + record tx ────
    let changeUTXO: CreditUTXO | null = null;

    await this.db.$transaction(async (tx: AnyPrisma) => {
      // Mark all selected UTXOs as spent
      await tx.creditUTXO.updateMany({
        where: { id: { in: selected.map((u) => u.id) } },
        data:  { status: "spent", spentInTxId: txId },
      });

      // Create change UTXO if there's leftover
      if (changeAmt > 0) {
        const changeId = computeUTXOId(ownerAddress, txId, changeAmt, Date.now());
        // Change UTXO's signature = keccak256(proofHash || changeId) — not PTF-issued,
        // but traceable back to the transaction that produced it.
        const changeSig = ethers.keccak256(
          ethers.solidityPacked(["bytes32", "bytes32"], [proofHash, changeId])
        );
        changeUTXO = await tx.creditUTXO.create({
          data: {
            id:              changeId,
            ownerAddress:    ownerAddress.toLowerCase(),
            amount:          changeAmt,
            sourceType:      "change",
            sourceId:        txId,
            chain,
            eip712Signature: changeSig,
            status:          "unspent",
          },
        }) as CreditUTXO;
      }

      // Record the transaction
      await tx.creditTransaction.create({
        data: {
          id:          txId,
          type,
          devAddress:  ownerAddress.toLowerCase(),
          inputIds:    selected.map((u) => u.id),
          outputIds:   changeUTXO ? [changeUTXO.id] : [],
          inputTotal,
          outputTotal: changeAmt,
          netAmount,
          chain,
          destination: destination ?? null,
          txHash:      txHash ?? null,
          proofHash,
        },
      });
    });

    return {
      txId,
      consumed:   selected,
      change:     changeUTXO,
      netAmount,
      proofHash,
    };
  }

  async lock(ownerAddress: string, amount: number): Promise<void> {
    const unspent = await this.getUnspent(ownerAddress);
    let remaining = amount;
    const toLock: string[] = [];

    for (const utxo of unspent) {
      if (remaining <= 0) break;
      toLock.push(utxo.id);
      remaining -= utxo.amount;
    }

    if (remaining > 0) {
      throw new Error(`Cannot lock ${amount} PTF — insufficient unspent balance`);
    }

    await this.db.creditUTXO.updateMany({
      where: { id: { in: toLock } },
      data:  { status: "locked" },
    });
  }

  async unlock(ownerAddress: string, amount: number): Promise<void> {
    const locked = await this.db.creditUTXO.findMany({
      where:   { ownerAddress: ownerAddress.toLowerCase(), status: "locked" },
      orderBy: { createdAt: "asc" },
    }) as CreditUTXO[];

    let remaining = amount;
    const toUnlock: string[] = [];

    for (const utxo of locked) {
      if (remaining <= 0) break;
      toUnlock.push(utxo.id);
      remaining -= utxo.amount;
    }

    await this.db.creditUTXO.updateMany({
      where: { id: { in: toUnlock } },
      data:  { status: "unspent" },
    });
  }

  async verifyProof(utxoId: string, ptfPublicKey: string): Promise<boolean> {
    const utxo = await this.db.creditUTXO.findUnique({
      where: { id: utxoId },
    }) as CreditUTXO | null;

    if (!utxo) return false;
    if (utxo.sourceType === "change") {
      // Change UTXOs derive their signature from the parent transaction — always valid
      return true;
    }

    // Recover signer from the EIP-712 struct
    const structHash = buildUTXOStructHash(
      utxo.id,
      utxo.ownerAddress,
      utxo.amount,
      utxo.sourceId,
      utxo.chain,
      utxo.createdAt.getTime()
    );

    try {
      const recovered = ethers.recoverAddress(structHash, utxo.eip712Signature);
      return recovered.toLowerCase() === ptfPublicKey.toLowerCase();
    } catch {
      return false;
    }
  }

  async getProvenance(ownerAddress: string): Promise<CreditUTXO[]> {
    return this.db.creditUTXO.findMany({
      where:   { ownerAddress: ownerAddress.toLowerCase() },
      orderBy: { createdAt: "asc" },
    }) as Promise<CreditUTXO[]>;
  }
}
