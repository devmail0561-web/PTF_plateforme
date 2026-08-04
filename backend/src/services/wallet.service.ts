import type { IChainRegistry } from "../bal/chain.registry.js";
import type { WalletVerificationResult, CreditBalance } from "../types/index.js";
import { PtfErrorCode } from "../types/errors.js";

const PTF_DECIMALS = 6;
const PTF_UNIT = 10 ** PTF_DECIMALS;
const SOFT_LOCK_RATE = 0.10;       // 10% of task reward
const SOFT_LOCK_MIN  = 10;         // PTF floor
const SOFT_LOCK_MAX  = 1000;       // PTF ceiling

export function computeSoftLock(taskRewardPTF: number): number {
  const amount = taskRewardPTF * SOFT_LOCK_RATE;
  return Math.min(Math.max(amount, SOFT_LOCK_MIN), SOFT_LOCK_MAX);
}

const MIN_CLAIM_BALANCE = BigInt(SOFT_LOCK_MIN * PTF_UNIT); // 10 PTF minimum

export interface IWalletService {
  verifyWallet(
    address: string,
    chain: string,
    signedNonce?: string
  ): Promise<WalletVerificationResult>;
  getBalance(address: string, chain: string): Promise<CreditBalance>;
  softLock(address: string, chain: string, lockAmount: number): Promise<string>;
  softUnlock(address: string, chain: string, lockAmount: number): Promise<string>;
  meetsMinBalance(address: string, chain: string, lockAmount?: number): Promise<boolean>;
}

export class WalletService implements IWalletService {
  constructor(
    private readonly chainRegistry: IChainRegistry
  ) {}

  async verifyWallet(
    address: string,
    chain: string,
    signedNonce?: string
  ): Promise<WalletVerificationResult> {
    const errors: string[] = [];
    const adapter = this.chainRegistry.get(chain);

    // 1. Format EIP-55
    const isValidAddress = adapter.isValidAddress(address);
    if (!isValidAddress) errors.push(PtfErrorCode.INVALID_ADDRESS);

    // 2. Wallet activé (au moins une tx)
    const txCount = isValidAddress ? await adapter.getTxCount(address) : 0;
    const isActivated = txCount > 0;
    if (!isActivated) errors.push(PtfErrorCode.WALLET_NOT_ACTIVATED);

    // 3. Solde gas (natif)
    const nativeBalance = isValidAddress
      ? await adapter.getBalance(address, "native")
      : 0n;
    const hasGasFees = nativeBalance > BigInt(1e15); // > 0.001 token natif

    // 4. Non banni — le contrat ReputationRegistry ne gère pas de ban explicite.
    // Un score négatif est traité comme alerte côté applicatif, pas comme un ban on-chain.
    const isNotBanned = true;

    // 5. Ownership (signature du nonce)
    // signedNonce is the EIP-712 *signature* produced by the client over the typed
    // data { value: address }. The message being signed is the address itself.
    let ownershipProven = false;
    if (signedNonce && isValidAddress) {
      try {
        const signer = await adapter.verifyEIP712Signature(
          { name: "PTF", version: "1" },
          { Nonce: [{ name: "value", type: "string" }] },
          { value: address },
          signedNonce
        );
        ownershipProven = signer.toLowerCase() === address.toLowerCase();
      } catch {
        ownershipProven = false;
      }
    }
    if (!ownershipProven && signedNonce) {
      errors.push(PtfErrorCode.OWNERSHIP_NOT_PROVEN);
    }

    return {
      isValidAddress,
      isActivated,
      hasGasFees,
      isNotBanned,
      ownershipProven: ownershipProven || !signedNonce,
      errors,
    };
  }

  async getBalance(address: string, chain: string): Promise<CreditBalance> {
    const adapter = this.chainRegistry.get(chain);
    const raw = await adapter.getBalance(address, "PTF");
    const balance = Number(raw) / 10 ** PTF_DECIMALS;

    let softLocked = 0;
    try {
      const lockedRaw = await adapter.getSoftLocked(address);
      softLocked = Number(lockedRaw) / 10 ** PTF_DECIMALS;
    } catch {
      softLocked = 0;
    }

    return {
      address,
      balance,
      softLocked,
      available: Math.max(0, balance - softLocked),
    };
  }

  async softLock(address: string, chain: string, lockAmount: number): Promise<string> {
    const adapter = this.chainRegistry.get(chain);
    return adapter.softLock(address, lockAmount);
  }

  async softUnlock(address: string, chain: string, lockAmount: number): Promise<string> {
    const adapter = this.chainRegistry.get(chain);
    return adapter.softUnlock(address, lockAmount);
  }

  async meetsMinBalance(address: string, chain: string, lockAmount?: number): Promise<boolean> {
    const adapter = this.chainRegistry.get(chain);
    const balance = await adapter.getBalance(address, "PTF");
    const required = BigInt(Math.round((lockAmount ?? SOFT_LOCK_MIN) * PTF_UNIT));
    return balance >= required;
  }
}
