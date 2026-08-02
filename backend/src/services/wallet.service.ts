import type { IChainRegistry } from "../bal/chain.registry.js";
import type { WalletVerificationResult, CreditBalance } from "../types/index.js";
import { PtfErrorCode } from "../types/errors.js";

const PTF_DECIMALS = 6;
const MIN_CLAIM_BALANCE = BigInt(10 * 10 ** PTF_DECIMALS); // 10 PTF

export interface IWalletService {
  verifyWallet(
    address: string,
    chain: string,
    signedNonce?: string
  ): Promise<WalletVerificationResult>;
  getBalance(address: string, chain: string): Promise<CreditBalance>;
  softLock(address: string, chain: string, amount: number): Promise<string>;
  // F2 — Le contrat ne prend qu'une adresse; montant fixe SOFT_LOCK_AMOUNT géré on-chain.
  softUnlock(address: string, chain: string): Promise<string>;
  meetsMinBalance(address: string, chain: string): Promise<boolean>;
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
    let ownershipProven = false;
    if (signedNonce && isValidAddress) {
      try {
        const signer = await adapter.verifyEIP712Signature(
          { name: "PTF", version: "1" },
          { Nonce: [{ name: "value", type: "string" }] },
          { value: signedNonce },
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

  async softLock(address: string, chain: string, amount: number): Promise<string> {
    const adapter = this.chainRegistry.get(chain);
    return adapter.softLock(address);
  }

  // F2 — Délègue directement; le contrat gère SOFT_LOCK_AMOUNT en interne.
  async softUnlock(address: string, chain: string): Promise<string> {
    const adapter = this.chainRegistry.get(chain);
    return adapter.softUnlock(address);
  }

  async meetsMinBalance(address: string, chain: string): Promise<boolean> {
    const adapter = this.chainRegistry.get(chain);
    const balance = await adapter.getBalance(address, "PTF");
    return balance >= MIN_CLAIM_BALANCE;
  }
}
