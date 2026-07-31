import type { IChainAdapter, IContractAddresses } from "../chain.adapter.js";

export class MockChainAdapter implements IChainAdapter {
  readonly chainId: string;
  readonly contractAddresses: IContractAddresses = {
    projectRegistry: "0x0000000000000000000000000000000000000001",
    escrowVault: "0x0000000000000000000000000000000000000002",
    creditToken: "0x0000000000000000000000000000000000000003",
    reputationRegistry: "0x0000000000000000000000000000000000000004",
  };

  private balances = new Map<string, bigint>();
  private softLocks = new Map<string, bigint>();
  private reputations = new Map<string, bigint>();
  private banned = new Set<string>();
  private txCounter = 0;

  constructor(chainId = "mock") {
    this.chainId = chainId;
  }

  private mockTxHash(): string {
    return "0x" + (++this.txCounter).toString(16).padStart(64, "0");
  }

  async getBalance(address: string, token: "PTF" | "native"): Promise<bigint> {
    if (token === "native") return BigInt(1e18); // 1 ETH/MATIC
    return this.balances.get(address) ?? BigInt(25e6); // 25 PTF par défaut
  }

  async getTxCount(address: string): Promise<number> {
    return address ? 10 : 0;
  }

  async claimTask(
    _taskId: string,
    _devAddress: string,
    _conditionsHash: string
  ): Promise<string> {
    return this.mockTxHash();
  }

  async softLock(devAddress: string, amountPtf: bigint): Promise<string> {
    const current = this.softLocks.get(devAddress) ?? 0n;
    this.softLocks.set(devAddress, current + amountPtf);
    return this.mockTxHash();
  }

  async softUnlock(devAddress: string, amountPtf: bigint): Promise<string> {
    const current = this.softLocks.get(devAddress) ?? 0n;
    this.softLocks.set(devAddress, current > amountPtf ? current - amountPtf : 0n);
    return this.mockTxHash();
  }

  async mintCredits(
    devAddress: string,
    amount: bigint,
    _taskId: string
  ): Promise<string> {
    const current = this.balances.get(devAddress) ?? 0n;
    this.balances.set(devAddress, current + amount);
    return this.mockTxHash();
  }

  async burnCredits(devAddress: string, amount: bigint): Promise<string> {
    const current = this.balances.get(devAddress) ?? 0n;
    this.balances.set(devAddress, current > amount ? current - amount : 0n);
    return this.mockTxHash();
  }

  async deductPenalty(
    devAddress: string,
    amount: bigint,
    _reason: string,
    _projectId: string
  ): Promise<string> {
    const current = this.balances.get(devAddress) ?? 0n;
    this.balances.set(devAddress, current > amount ? current - amount : 0n);
    return this.mockTxHash();
  }

  async getReputation(address: string): Promise<bigint> {
    return this.reputations.get(address) ?? 350n;
  }

  async setReputation(
    address: string,
    delta: bigint,
    _reason: string
  ): Promise<string> {
    const current = this.reputations.get(address) ?? 350n;
    const next = current + delta;
    this.reputations.set(address, next < 0n ? 0n : next);
    return this.mockTxHash();
  }

  async anchorMerkleRoot(
    _projectId: string,
    _merkleRoot: string
  ): Promise<string> {
    return this.mockTxHash();
  }

  async verifyMerkleProof(
    _leaf: string,
    _proof: string[],
    _root: string
  ): Promise<boolean> {
    return true;
  }

  async verifyEIP712Signature(
    _domain: Record<string, unknown>,
    _types: Record<string, unknown>,
    _value: Record<string, unknown>,
    _signature: string
  ): Promise<string> {
    return "0x0000000000000000000000000000000000000099";
  }

  async isBanned(address: string): Promise<boolean> {
    return this.banned.has(address.toLowerCase());
  }

  ban(address: string): void {
    this.banned.add(address.toLowerCase());
  }

  async estimateGas(_method: string, _params: unknown[]): Promise<bigint> {
    return BigInt(21000);
  }

  isValidAddress(address: string): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(address);
  }
}
