import type { IChainAdapter, IContractAddresses } from "../chain.adapter.js";

export class MockChainAdapter implements IChainAdapter {
  readonly chainId: string;
  readonly contractAddresses: IContractAddresses = {
    projectRegistry: "0x0000000000000000000000000000000000000001",
    escrowVault: "0x0000000000000000000000000000000000000002",
    creditToken: "0x0000000000000000000000000000000000000003",
    reputationRegistry: "0x0000000000000000000000000000000000000004",
  };

  private balances      = new Map<string, bigint>();
  private softLocks     = new Map<string, bigint>();
  private reputations   = new Map<string, bigint>();
  private banned        = new Set<string>();
  private txCounter     = 0;
  private metadataHashes = new Map<string, string>();   // taskId/projectId → hash
  private archiveIds     = new Map<string, string>();   // taskId/projectId → arweaveId

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

  async softLock(devAddress: string, lockAmount: number): Promise<string> {
    const amount = BigInt(Math.round(lockAmount * 10 ** 6));
    const current = this.softLocks.get(devAddress) ?? 0n;
    this.softLocks.set(devAddress, current + amount);
    return this.mockTxHash();
  }

  async getSoftLocked(devAddress: string): Promise<bigint> {
    return this.softLocks.get(devAddress) ?? 0n;
  }

  async softUnlock(devAddress: string, lockAmount: number): Promise<string> {
    const amount = BigInt(Math.round(lockAmount * 10 ** 6));
    const current = this.softLocks.get(devAddress) ?? 0n;
    this.softLocks.set(devAddress, current >= amount ? current - amount : 0n);
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

  async releaseTaskReward(
    _projectId: string,
    _taskId: string,
    devAddress: string,
    amountPtf: bigint
  ): Promise<string> {
    const current = this.balances.get(devAddress) ?? 0n;
    this.balances.set(devAddress, current + amountPtf);
    return this.mockTxHash();
  }

  // F4 — executePunishment remplace deductPenalty.
  async executePunishment(
    _projectId: string,
    _taskId: string,
    devAddress: string,
    amount: bigint,
    _punishmentType: string
  ): Promise<string> {
    const current = this.balances.get(devAddress) ?? 0n;
    this.balances.set(devAddress, current > amount ? current - amount : 0n);
    return this.mockTxHash();
  }

  // @deprecated — alias pour rétrocompatibilité.
  async deductPenalty(
    devAddress: string,
    amount: bigint,
    reason: string,
    projectId: string
  ): Promise<string> {
    return this.executePunishment(projectId, "unknown", devAddress, amount, reason);
  }

  async getReputation(address: string): Promise<bigint> {
    return this.reputations.get(address) ?? 350n;
  }

  async applyReputationDelta(
    address: string,
    delta: bigint,
    _taskId: string,
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
    _projectId: string,
    _taskId: string,
    _proof: string[]
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

  async estimateGas(_method: string, _params: unknown[]): Promise<bigint> {
    return BigInt(21000);
  }

  isValidAddress(address: string): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(address);
  }

  // ── Content-addressed metadata (mock) ──────────────────────────────────────

  async registerTaskMetadata(taskId: string, hash: string): Promise<string> {
    this.metadataHashes.set(taskId, hash);
    return this.mockTxHash();
  }

  async registerProjectMetadata(projectId: string, hash: string): Promise<string> {
    this.metadataHashes.set(projectId, hash);
    return this.mockTxHash();
  }

  async setTaskArchiveId(taskId: string, arweaveId: string, _contentHash: string): Promise<string> {
    this.archiveIds.set(taskId, arweaveId);
    return this.mockTxHash();
  }

  async setProjectArchiveId(projectId: string, arweaveId: string, _contentHash: string): Promise<string> {
    this.archiveIds.set(projectId, arweaveId);
    return this.mockTxHash();
  }

  async verifyTaskMetadata(taskId: string, contentHash: string): Promise<boolean> {
    const stored = this.metadataHashes.get(taskId);
    return stored !== undefined && stored === contentHash;
  }

  async getTaskMetadataHash(taskId: string): Promise<string | null> {
    return this.metadataHashes.get(taskId) ?? null;
  }
}
