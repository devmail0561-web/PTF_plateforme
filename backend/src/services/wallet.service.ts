import type { PrismaClient, WalletLink } from "@prisma/client";
import type { IChainRegistry } from "../bal/chain.registry.js";
import type { IAuthService } from "./auth.service.js";
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
  softUnlock(address: string, chain: string, amount: number): Promise<string>;
  meetsMinBalance(address: string, chain: string): Promise<boolean>;
  getLinkedChains(userId: string): Promise<WalletLink[]>;
}

export class WalletService implements IWalletService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly chainRegistry: IChainRegistry,
    private readonly authService: IAuthService
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

    // 4. Non banni
    const isBanned = isValidAddress ? await adapter.isBanned(address) : false;
    const isNotBanned = !isBanned;
    if (isBanned) errors.push(PtfErrorCode.WALLET_BANNED);

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

    // Soft-locked : uniquement les tâches paid actives (projets free n'ont pas de soft-lock PTF)
    const activePaidTasks = await this.prisma.task.findMany({
      where: {
        devAddress: address.toLowerCase(),
        status: { in: ["claimed", "in_progress"] },
        project: { rewardMode: "paid" },
      },
      include: { project: { select: { rewardMode: true } } },
    });

    const softLocked = activePaidTasks.length * 10;

    return {
      address,
      balance,
      softLocked,
      available: Math.max(0, balance - softLocked),
    };
  }

  async softLock(address: string, chain: string, amount: number): Promise<string> {
    const adapter = this.chainRegistry.get(chain);
    const amountRaw = BigInt(Math.round(amount * 10 ** PTF_DECIMALS));
    return adapter.softLock(address, amountRaw);
  }

  async softUnlock(address: string, chain: string, amount: number): Promise<string> {
    const adapter = this.chainRegistry.get(chain);
    const amountRaw = BigInt(Math.round(amount * 10 ** PTF_DECIMALS));
    return adapter.softUnlock(address, amountRaw);
  }

  async meetsMinBalance(address: string, chain: string): Promise<boolean> {
    const adapter = this.chainRegistry.get(chain);
    const balance = await adapter.getBalance(address, "PTF");
    return balance >= MIN_CLAIM_BALANCE;
  }

  async getLinkedChains(userId: string): Promise<WalletLink[]> {
    return this.prisma.walletLink.findMany({ where: { userId } });
  }
}
