export interface IContractAddresses {
  projectRegistry: string;
  escrowVault: string;
  creditToken: string;
  reputationRegistry: string;
}

export interface IChainAdapter {
  readonly chainId: string;
  readonly contractAddresses: IContractAddresses;

  // Balances
  getBalance(address: string, token: "PTF" | "native"): Promise<bigint>;
  getTxCount(address: string): Promise<number>;

  // Task lifecycle
  claimTask(
    taskId: string,
    devAddress: string,
    conditionsHash: string
  ): Promise<string>; // txHash

  // Credits soft-lock (proportionnel : 10% reward, min 10 PTF, max 1000 PTF)
  softLock(devAddress: string, lockAmount: number): Promise<string>;
  softUnlock(devAddress: string, lockAmount: number): Promise<string>;
  getSoftLocked(devAddress: string): Promise<bigint>;

  // Credits lifecycle
  mintCredits(devAddress: string, amount: bigint, taskId: string): Promise<string>;
  burnCredits(devAddress: string, amount: bigint): Promise<string>;

  // Escrow — release USDC reward to developer after task validation
  releaseTaskReward(
    projectId: string,
    taskId: string,
    devAddress: string,
    amountPtf: bigint
  ): Promise<string>;

  // F4 — La fonction du contrat s'appelle executePunishment (pas deductPenalty).
  executePunishment(
    projectId: string,
    taskId: string,
    devAddress: string,
    amount: bigint,
    punishmentType: string
  ): Promise<string>;

  // @deprecated Utiliser executePunishment — conservé pour rétrocompatibilité.
  deductPenalty(
    devAddress: string,
    amount: bigint,
    reason: string,
    projectId: string
  ): Promise<string>;

  // Reputation
  getReputation(address: string): Promise<bigint>;
  applyReputationDelta(
    devAddress: string,
    delta: bigint,
    taskId: string,
    reason: string
  ): Promise<string>;

  // Merkle
  anchorMerkleRoot(projectId: string, merkleRoot: string): Promise<string>;
  verifyMerkleProof(
    projectId: string,
    taskId: string,
    proof: string[]
  ): Promise<boolean>;

  // Content-addressed metadata
  registerTaskMetadata(taskId: string, hash: string): Promise<string>;
  registerProjectMetadata(projectId: string, hash: string): Promise<string>;
  setTaskArchiveId(taskId: string, arweaveId: string, contentHash: string): Promise<string>;
  setProjectArchiveId(projectId: string, arweaveId: string, contentHash: string): Promise<string>;
  verifyTaskMetadata(taskId: string, contentHash: string): Promise<boolean>;
  getTaskMetadataHash(taskId: string): Promise<string | null>;

  // EIP-712
  verifyEIP712Signature(
    domain: Record<string, unknown>,
    types: Record<string, unknown>,
    value: Record<string, unknown>,
    signature: string
  ): Promise<string>;

  // Utility
  estimateGas(method: string, params: unknown[]): Promise<bigint>;
  isValidAddress(address: string): boolean;
}
