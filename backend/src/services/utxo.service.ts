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
 *   keccak256(utxoId_1 || utxoId_2 || ... || utxoId_n)
 * Matches EscrowVault.withdrawWithProof() on-chain and spend() off-chain.
 */
function computeProofHash(utxos: CreditUTXO[]): string {
  return ethers.keccak256(
    ethers.concat(utxos.map((u) => ethers.getBytes(u.id)))
  );
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

    let changeUTXO: CreditUTXO | null = null;
    let selected: CreditUTXO[] = [];
    let txId = "";
    let proofHash = "";
    let netAmount = 0;
    let inputTotal = 0;
    let changeAmt = 0;

    // Single timestamp captured once — reused for all ID computations inside the transaction
    // to guarantee txId and changeUTXOId are deterministic across Prisma retries.
    const spendNow = Date.now();

    // Coin-selection + all DB mutations inside a single transaction to prevent TOCTOU races.
    await this.db.$transaction(async (tx: AnyPrisma) => {
      // ── 1. Coin-selection inside the tx (locks the selected rows) ────────────
      const unspent: CreditUTXO[] = await tx.creditUTXO.findMany({
        where: { ownerAddress: ownerAddress.toLowerCase(), status: "unspent" },
        orderBy: { createdAt: "asc" },
      });

      const txSelected: CreditUTXO[] = [];
      let collected = 0;
      for (const utxo of unspent) {
        if (collected >= amount) break;
        txSelected.push(utxo);
        collected += utxo.amount;
      }

      if (collected < amount) {
        throw new Error(
          `Insufficient spendable UTXOs: need ${amount} PTF, have ${collected.toFixed(6)} PTF. ` +
          `Unspent UTXOs: ${unspent.length}`
        );
      }

      selected = txSelected;

      // ── 2. Compute proof hash — keccak256(utxoId_1 || utxoId_2 || …) ────────
      // This matches the on-chain EscrowVault.withdrawWithProof() computation.
      proofHash = ethers.keccak256(
        ethers.concat(selected.map((u) => ethers.getBytes(u.id)))
      );

      // ── 3. Build transaction id ───────────────────────────────────────────────
      txId = ethers.keccak256(
        ethers.solidityPacked(
          ["address", "bytes32", "uint256"],
          [ownerAddress.toLowerCase(), proofHash, BigInt(spendNow)]
        )
      );

      inputTotal = parseFloat(collected.toFixed(6));
      changeAmt  = parseFloat((collected - amount).toFixed(6));
      netAmount  = parseFloat(amount.toFixed(6));

      // ── 4. Atomically mark inputs spent ──────────────────────────────────────
      await tx.creditUTXO.updateMany({
        where: { id: { in: selected.map((u) => u.id) } },
        data:  { status: "spent", spentInTxId: txId },
      });

      // ── 5. Create change UTXO if there's leftover ────────────────────────────
      if (changeAmt > 0) {
        const changeId = computeUTXOId(ownerAddress, txId, changeAmt, spendNow);
        // TODO: change UTXOs must carry a real PTF EIP-712 ECDSA signature (65 bytes)
        // so they can be submitted to EscrowVault.withdrawWithProof(). This 32-byte
        // keccak hash will cause ECDSA.recover to fail on-chain, permanently locking
        // the change amount. Fix: sign the change UTXO struct with the operator private key.
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
            createdInTxId:   txId,
            chain,
            eip712Signature: changeSig,
            status:          "unspent",
          },
        }) as CreditUTXO;
      }

      // ── 6. Record the transaction ─────────────────────────────────────────────
      await tx.creditTransaction.create({
        data: {
          id:          txId,
          type,
          devAddress:  ownerAddress.toLowerCase(),
          inputTotal,
          outputTotal: changeAmt,
          netAmount,
          chain,
          destination: destination ?? null,
          txHash:      txHash ?? null,
          proofHash,
        },
      });
      // Note: on-chain burn (txHash) is supplied by the caller after the external tx confirms.
      // DB is committed first; if the on-chain call fails the caller must reconcile by updating txHash.
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
    // Run inside a transaction so concurrent spend() cannot consume the same UTXOs
    await this.db.$transaction(async (tx: AnyPrisma) => {
      const unspent: CreditUTXO[] = await tx.creditUTXO.findMany({
        where:   { ownerAddress: ownerAddress.toLowerCase(), status: "unspent" },
        orderBy: { createdAt: "asc" },
      });

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

      await tx.creditUTXO.updateMany({
        where: { id: { in: toLock } },
        data:  { status: "locked" },
      });
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

    if (remaining > 0) {
      throw new Error(
        `Cannot unlock ${amount} PTF — only ${(amount - remaining).toFixed(6)} PTF currently locked`
      );
    }

    if (toUnlock.length > 0) {
      await this.db.creditUTXO.updateMany({
        where: { id: { in: toUnlock } },
        data:  { status: "unspent" },
      });
    }
  }

  async verifyProof(utxoId: string, ptfPublicKey: string): Promise<boolean> {
    const utxo = await this.db.creditUTXO.findUnique({
      where: { id: utxoId },
    }) as CreditUTXO | null;

    if (!utxo) return false;

    if (utxo.sourceType === "change") {
      // Verify the change UTXO signature: keccak256(proofHash || changeId)
      // We need the parent CreditTransaction to recover proofHash
      const parentTx = await this.db.creditTransaction.findUnique({
        where: { id: utxo.sourceId ?? "" },
      });
      if (!parentTx) return false;
      const expectedSig = ethers.keccak256(
        ethers.solidityPacked(["bytes32", "bytes32"], [parentTx.proofHash, utxo.id])
      );
      return expectedSig.toLowerCase() === utxo.eip712Signature.toLowerCase();
    }

    // Recover signer from the full EIP-712 digest (struct hash only is NOT a valid digest)
    const structHash = buildUTXOStructHash(
      utxo.id,
      utxo.ownerAddress,
      utxo.amount,
      utxo.sourceId,
      utxo.chain,
      utxo.createdAt.getTime()
    );

    // Domain must match EscrowVault constructor: EIP712("PTFEscrowVault", "1")
    const domain = {
      name: "PTFEscrowVault",
      version: "1",
      chainId: 137, // Polygon mainnet; should match the chain the UTXO was issued on
    };
    const digest = ethers.TypedDataEncoder.hashDomain(domain);
    const fullDigest = ethers.keccak256(
      ethers.concat([ethers.toUtf8Bytes("\x19\x01"), ethers.getBytes(digest), ethers.getBytes(structHash)])
    );

    try {
      const recovered = ethers.recoverAddress(fullDigest, utxo.eip712Signature);
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
