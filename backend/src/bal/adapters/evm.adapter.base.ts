import { ethers } from "ethers";
import type { IChainAdapter, IContractAddresses } from "../chain.adapter.js";

// ── Circuit breaker ────────────────────────────────────────────────────────────
// Three-state machine: CLOSED (normal) → OPEN (tripped) → HALF_OPEN (probing).
// Opens after FAILURE_THRESHOLD consecutive failures, resets after RESET_TIMEOUT_MS.
// When OPEN all calls throw immediately without hitting the RPC — prevents a slow
// node from blocking claim/submit flows under load.

const FAILURE_THRESHOLD = 5;
const RESET_TIMEOUT_MS  = 30_000;

type CBState = "CLOSED" | "OPEN" | "HALF_OPEN";

class CircuitBreaker {
  private state: CBState = "CLOSED";
  private failures = 0;
  private openedAt = 0;

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.openedAt >= RESET_TIMEOUT_MS) {
        this.state = "HALF_OPEN";
      } else {
        throw new Error("RPC circuit breaker OPEN — retrying in a moment");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = "CLOSED";
  }

  private onFailure(): void {
    this.failures++;
    if (this.failures >= FAILURE_THRESHOLD || this.state === "HALF_OPEN") {
      this.state    = "OPEN";
      this.openedAt = Date.now();
      console.error(`[CircuitBreaker] OPEN after ${this.failures} failures`);
    }
  }

  isOpen(): boolean { return this.state === "OPEN"; }
}

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const CREDIT_TOKEN_ABI = [
  ...ERC20_ABI,
  // Contrat réel : mint(address to, uint256 amount) — pas de taskId on-chain.
  "function mint(address to, uint256 amount) external",
  "function burn(address from, uint256 amount) external",
];

const REPUTATION_ABI = [
  "function getScore(address dev) view returns (uint256)",
  "function getRawScore(address dev) view returns (int256)",
  "function applyDelta(address dev, int256 delta, bytes32 taskId, string reason) external",
];

const PROJECT_REGISTRY_ABI = [
  "function markTaskClaimed(bytes32 projectId, bytes32 taskId) external",
  "function updateMerkleRoot(bytes32 projectId, bytes32 newRoot) external",
  "function verifyTask(bytes32 projectId, bytes32 taskId, bytes32[] proof) view returns (bool)",
  "function registerProject(bytes32 projectId, address projectOwner, uint8 projectType, uint8 rewardMode) external",
];

const ESCROW_VAULT_ABI = [
  "function softLock(address dev) external",
  // F2 — Le contrat prend uniquement (address dev), montant fixe SOFT_LOCK_AMOUNT en interne.
  "function softUnlock(address dev) external",
  // F4 — La fonction s'appelle executePunishment, pas deductPenalty.
  "function executePunishment(bytes32 projectId, bytes32 taskId, address dev, uint256 amount, string punishmentType) external",
  "function releaseTaskReward(bytes32 projectId, bytes32 taskId, address dev, uint256 amount, uint256 deadline, bytes signature) external",
  "function mintUTXOReceipt(bytes32 utxoId, address dev, uint256 amount, bytes32 sourceId) external",
  // F5 — Lecture du nonce on-chain pour signer correctement.
  "function releaseNonces(address dev, bytes32 taskId) view returns (uint256)",
  "function softLocked(address dev) view returns (uint256)",
];

export abstract class EvmAdapterBase implements IChainAdapter {
  abstract readonly chainId: string;

  readonly contractAddresses: IContractAddresses;

  protected provider: ethers.JsonRpcProvider;
  protected signer: ethers.Wallet;

  protected creditToken: ethers.Contract;
  protected reputationRegistry: ethers.Contract;
  protected projectRegistry: ethers.Contract;
  protected escrowVault: ethers.Contract;

  private readonly cb = new CircuitBreaker();
  // Secondary RPC endpoint — used when the primary trips the circuit breaker.
  private fallbackProvider: ethers.JsonRpcProvider | null = null;
  private fallbackSigner: ethers.Wallet | null = null;

  constructor(
    rpcUrl: string,
    privateKey: string,
    addresses: IContractAddresses,
    fallbackRpcUrl?: string
  ) {
    this.contractAddresses = addresses;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);

    if (fallbackRpcUrl) {
      this.fallbackProvider = new ethers.JsonRpcProvider(fallbackRpcUrl);
      this.fallbackSigner   = new ethers.Wallet(privateKey, this.fallbackProvider);
    }

    this.creditToken         = new ethers.Contract(addresses.creditToken,         CREDIT_TOKEN_ABI,     this.signer);
    this.reputationRegistry  = new ethers.Contract(addresses.reputationRegistry,  REPUTATION_ABI,       this.signer);
    this.projectRegistry     = new ethers.Contract(addresses.projectRegistry,     PROJECT_REGISTRY_ABI, this.signer);
    this.escrowVault         = new ethers.Contract(addresses.escrowVault,         ESCROW_VAULT_ABI,     this.signer);
  }

  // All RPC calls go through rpc() — circuit breaker wraps the primary; if the
  // breaker is OPEN and a fallback is configured, the fallback is used directly.
  protected async rpc<T>(primaryFn: () => Promise<T>, fallbackFn?: () => Promise<T>): Promise<T> {
    if (this.cb.isOpen() && fallbackFn) {
      console.warn(`[${this.chainId}] Circuit breaker OPEN — using fallback RPC`);
      return fallbackFn();
    }
    try {
      return await this.cb.call(primaryFn);
    } catch (err) {
      if (fallbackFn) {
        console.warn(`[${this.chainId}] Primary RPC failed, trying fallback:`, (err as Error).message);
        return fallbackFn();
      }
      throw err;
    }
  }

  // Convenience: returns [primarySigner, fallbackSigner] for contract calls
  protected signers(): [ethers.Wallet, ethers.Wallet | null] {
    return [this.signer, this.fallbackSigner];
  }

  async getBalance(address: string, token: "PTF" | "native"): Promise<bigint> {
    const [s, fb] = this.signers();
    return this.rpc(
      () => token === "native"
        ? this.provider.getBalance(address)
        : (new ethers.Contract(this.contractAddresses.creditToken, CREDIT_TOKEN_ABI, s).balanceOf(address) as Promise<bigint>),
      fb ? () => token === "native"
        ? this.fallbackProvider!.getBalance(address)
        : (new ethers.Contract(this.contractAddresses.creditToken, CREDIT_TOKEN_ABI, fb).balanceOf(address) as Promise<bigint>)
      : undefined
    );
  }

  async getTxCount(address: string): Promise<number> {
    const [, fb] = this.signers();
    return this.rpc(
      () => this.provider.getTransactionCount(address),
      fb ? () => this.fallbackProvider!.getTransactionCount(address) : undefined
    );
  }

  async claimTask(taskId: string, devAddress: string, projectId: string): Promise<string> {
    const [s, fb] = this.signers();
    const pId = projectId.startsWith("0x") ? projectId : ethers.keccak256(ethers.toUtf8Bytes(projectId));
    const tId = taskId.startsWith("0x")    ? taskId    : ethers.keccak256(ethers.toUtf8Bytes(taskId));
    return this.rpc(
      async () => { const tx = await new ethers.Contract(this.contractAddresses.projectRegistry, PROJECT_REGISTRY_ABI, s).markTaskClaimed(pId, tId); return tx.hash as string; },
      fb ? async () => { const tx = await new ethers.Contract(this.contractAddresses.projectRegistry, PROJECT_REGISTRY_ABI, fb).markTaskClaimed(pId, tId); return tx.hash as string; } : undefined
    );
  }

  async softLock(devAddress: string): Promise<string> {
    const [s, fb] = this.signers();
    return this.rpc(
      async () => { const tx = await new ethers.Contract(this.contractAddresses.escrowVault, ESCROW_VAULT_ABI, s).softLock(devAddress); return tx.hash as string; },
      fb ? async () => { const tx = await new ethers.Contract(this.contractAddresses.escrowVault, ESCROW_VAULT_ABI, fb).softLock(devAddress); return tx.hash as string; } : undefined
    );
  }

  // F2 — Un seul argument : le contrat utilise SOFT_LOCK_AMOUNT constant en interne.
  async softUnlock(devAddress: string): Promise<string> {
    const [s, fb] = this.signers();
    return this.rpc(
      async () => { const tx = await new ethers.Contract(this.contractAddresses.escrowVault, ESCROW_VAULT_ABI, s).softUnlock(devAddress); return tx.hash as string; },
      fb ? async () => { const tx = await new ethers.Contract(this.contractAddresses.escrowVault, ESCROW_VAULT_ABI, fb).softUnlock(devAddress); return tx.hash as string; } : undefined
    );
  }

  async getSoftLocked(devAddress: string): Promise<bigint> {
    const [s, fb] = this.signers();
    return this.rpc(
      () => new ethers.Contract(this.contractAddresses.escrowVault, ESCROW_VAULT_ABI, s).softLocked(devAddress) as Promise<bigint>,
      fb ? () => new ethers.Contract(this.contractAddresses.escrowVault, ESCROW_VAULT_ABI, fb).softLocked(devAddress) as Promise<bigint> : undefined
    );
  }

  async mintCredits(devAddress: string, amount: bigint, _taskId: string): Promise<string> {
    const [s, fb] = this.signers();
    return this.rpc(
      async () => { const tx = await new ethers.Contract(this.contractAddresses.creditToken, CREDIT_TOKEN_ABI, s).mint(devAddress, amount); return tx.hash as string; },
      fb ? async () => { const tx = await new ethers.Contract(this.contractAddresses.creditToken, CREDIT_TOKEN_ABI, fb).mint(devAddress, amount); return tx.hash as string; } : undefined
    );
  }

  async burnCredits(devAddress: string, amount: bigint): Promise<string> {
    const [s, fb] = this.signers();
    return this.rpc(
      async () => { const tx = await new ethers.Contract(this.contractAddresses.creditToken, CREDIT_TOKEN_ABI, s).burn(devAddress, amount); return tx.hash as string; },
      fb ? async () => { const tx = await new ethers.Contract(this.contractAddresses.creditToken, CREDIT_TOKEN_ABI, fb).burn(devAddress, amount); return tx.hash as string; } : undefined
    );
  }

  async releaseTaskReward(projectId: string, taskId: string, devAddress: string, amountPtf: bigint): Promise<string> {
    const [s, fb] = this.signers();
    const pId = (projectId.startsWith("0x") ? projectId : ethers.keccak256(ethers.toUtf8Bytes(projectId))) as `0x${string}`;
    const tId = (taskId.startsWith("0x")    ? taskId    : ethers.keccak256(ethers.toUtf8Bytes(taskId)))    as `0x${string}`;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

    const signRelease = async (signer: ethers.Wallet, provider: ethers.JsonRpcProvider): Promise<string> => {
      const domain = { name: "PTFEscrowVault", version: "1", chainId: (await provider.getNetwork()).chainId, verifyingContract: this.contractAddresses.escrowVault };
      const types  = { TaskRelease: [{ name: "projectId", type: "bytes32" }, { name: "taskId", type: "bytes32" }, { name: "dev", type: "address" }, { name: "amount", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
      const vault  = new ethers.Contract(this.contractAddresses.escrowVault, ESCROW_VAULT_ABI, signer);
      // F5 — Lire le nonce on-chain pour éviter les signatures rejouables.
      const nonce: bigint = await vault.releaseNonces(devAddress, tId);
      const sig = await signer.signTypedData(domain, types, { projectId: pId, taskId: tId, dev: devAddress, amount: amountPtf, nonce, deadline });
      const tx  = await vault.releaseTaskReward(pId, tId, devAddress, amountPtf, deadline, sig);
      return tx.hash as string;
    };

    return this.rpc(
      () => signRelease(s, this.provider),
      fb ? () => signRelease(fb, this.fallbackProvider!) : undefined
    );
  }

  // F4 — executePunishment(bytes32 projectId, bytes32 taskId, address dev, uint256 amount, string punishmentType)
  async executePunishment(projectId: string, taskId: string, devAddress: string, amount: bigint, punishmentType: string): Promise<string> {
    const [s, fb] = this.signers();
    const pId = projectId.startsWith("0x") ? projectId : ethers.keccak256(ethers.toUtf8Bytes(projectId));
    const tId = taskId.startsWith("0x")    ? taskId    : ethers.keccak256(ethers.toUtf8Bytes(taskId));
    return this.rpc(
      async () => { const tx = await new ethers.Contract(this.contractAddresses.escrowVault, ESCROW_VAULT_ABI, s).executePunishment(pId, tId, devAddress, amount, punishmentType); return tx.hash as string; },
      fb ? async () => { const tx = await new ethers.Contract(this.contractAddresses.escrowVault, ESCROW_VAULT_ABI, fb).executePunishment(pId, tId, devAddress, amount, punishmentType); return tx.hash as string; } : undefined
    );
  }

  // Alias déprécié — conservé pour compatibilité, délègue vers executePunishment.
  // @deprecated Utiliser executePunishment directement.
  async deductPenalty(
    devAddress: string,
    amount: bigint,
    reason: string,
    projectId: string
  ): Promise<string> {
    // taskId inconnu à ce niveau — utiliser un placeholder; migration vers executePunishment recommandée.
    return this.executePunishment(projectId, "unknown", devAddress, amount, reason);
  }

  async getReputation(address: string): Promise<bigint> {
    return this.reputationRegistry.getScore(address) as Promise<bigint>;
  }

  async applyReputationDelta(
    devAddress: string,
    delta: bigint,
    taskId: string,
    reason: string
  ): Promise<string> {
    const taskIdBytes = taskId.startsWith("0x")
      ? taskId
      : ethers.keccak256(ethers.toUtf8Bytes(taskId));
    const tx = await this.reputationRegistry.applyDelta(
      devAddress,
      delta,
      taskIdBytes,
      reason
    );
    return tx.hash as string;
  }

  async anchorMerkleRoot(
    projectId: string,
    merkleRoot: string
  ): Promise<string> {
    const projectIdBytes = projectId.startsWith("0x")
      ? projectId
      : ethers.keccak256(ethers.toUtf8Bytes(projectId));
    const tx = await this.projectRegistry.updateMerkleRoot(projectIdBytes, merkleRoot);
    return tx.hash as string;
  }

  async verifyMerkleProof(
    projectId: string,
    taskId: string,
    proof: string[]
  ): Promise<boolean> {
    const projectIdBytes = projectId.startsWith("0x")
      ? projectId
      : ethers.keccak256(ethers.toUtf8Bytes(projectId));
    const taskIdBytes = taskId.startsWith("0x")
      ? taskId
      : ethers.keccak256(ethers.toUtf8Bytes(taskId));
    return this.projectRegistry.verifyTask(
      projectIdBytes,
      taskIdBytes,
      proof
    ) as Promise<boolean>;
  }

  async verifyEIP712Signature(
    domain: Record<string, unknown>,
    types: Record<string, unknown>,
    value: Record<string, unknown>,
    signature: string
  ): Promise<string> {
    return ethers.verifyTypedData(
      domain as ethers.TypedDataDomain,
      types as Record<string, ethers.TypedDataField[]>,
      value,
      signature
    );
  }

  async estimateGas(method: string, params: unknown[]): Promise<bigint> {
    const iface = new ethers.Interface([`function ${method}`]);
    const data = iface.encodeFunctionData(method.split("(")[0], params as ethers.ParamType[]);
    return this.provider.estimateGas({ data });
  }

  isValidAddress(address: string): boolean {
    try {
      ethers.getAddress(address);
      return true;
    } catch {
      return false;
    }
  }
}
