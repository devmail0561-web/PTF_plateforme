import { ethers } from "ethers";
import type { IChainAdapter, IContractAddresses } from "../chain.adapter.js";

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

  constructor(
    rpcUrl: string,
    privateKey: string,
    addresses: IContractAddresses
  ) {
    this.contractAddresses = addresses;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);

    this.creditToken = new ethers.Contract(
      addresses.creditToken,
      CREDIT_TOKEN_ABI,
      this.signer
    );
    this.reputationRegistry = new ethers.Contract(
      addresses.reputationRegistry,
      REPUTATION_ABI,
      this.signer
    );
    this.projectRegistry = new ethers.Contract(
      addresses.projectRegistry,
      PROJECT_REGISTRY_ABI,
      this.signer
    );
    this.escrowVault = new ethers.Contract(
      addresses.escrowVault,
      ESCROW_VAULT_ABI,
      this.signer
    );
  }

  async getBalance(address: string, token: "PTF" | "native"): Promise<bigint> {
    if (token === "native") {
      return this.provider.getBalance(address);
    }
    return this.creditToken.balanceOf(address) as Promise<bigint>;
  }

  async getTxCount(address: string): Promise<number> {
    return this.provider.getTransactionCount(address);
  }

  async claimTask(
    taskId: string,
    devAddress: string,
    projectId: string
  ): Promise<string> {
    const projectIdBytes = projectId.startsWith("0x")
      ? projectId
      : ethers.keccak256(ethers.toUtf8Bytes(projectId));
    const taskIdBytes = taskId.startsWith("0x")
      ? taskId
      : ethers.keccak256(ethers.toUtf8Bytes(taskId));
    const tx = await this.projectRegistry.markTaskClaimed(projectIdBytes, taskIdBytes);
    return tx.hash as string;
  }

  async softLock(devAddress: string): Promise<string> {
    const tx = await this.escrowVault.softLock(devAddress);
    return tx.hash as string;
  }

  // F2 — Un seul argument : le contrat utilise SOFT_LOCK_AMOUNT constant en interne.
  async softUnlock(devAddress: string): Promise<string> {
    const tx = await this.escrowVault.softUnlock(devAddress);
    return tx.hash as string;
  }

  async getSoftLocked(devAddress: string): Promise<bigint> {
    return this.escrowVault.softLocked(devAddress) as Promise<bigint>;
  }

  async mintCredits(
    devAddress: string,
    amount: bigint,
    taskId: string
  ): Promise<string> {
    const tx = await this.creditToken.mint(devAddress, amount);
    return tx.hash as string;
  }

  async burnCredits(devAddress: string, amount: bigint): Promise<string> {
    const tx = await this.creditToken.burn(devAddress, amount);
    return tx.hash as string;
  }

  async releaseTaskReward(
    projectId: string,
    taskId: string,
    devAddress: string,
    amountPtf: bigint
  ): Promise<string> {
    // Deadline = now + 10 minutes (operator signs immediately)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    // The operator signer IS the contract owner — sign the EIP-712 release voucher
    const domain = {
      name: "PTFEscrowVault",
      version: "1",
      chainId: (await this.provider.getNetwork()).chainId,
      verifyingContract: this.contractAddresses.escrowVault,
    };
    const types = {
      TaskRelease: [
        { name: "projectId", type: "bytes32" },
        { name: "taskId", type: "bytes32" },
        { name: "dev", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const projectIdBytes = (projectId.startsWith("0x")
      ? projectId
      : ethers.keccak256(ethers.toUtf8Bytes(projectId))) as `0x${string}`;
    // F7 — keccak256 pour taskId > 32 octets, cohérent avec EscrowService.
    const taskIdBytes = taskId.startsWith("0x")
      ? taskId as `0x${string}`
      : ethers.keccak256(ethers.toUtf8Bytes(taskId)) as `0x${string}`;

    // F5 — Lire le nonce on-chain pour éviter les signatures rejoables.
    const nonce: bigint = await this.escrowVault.releaseNonces(devAddress, taskIdBytes);

    const value = { projectId: projectIdBytes, taskId: taskIdBytes, dev: devAddress, amount: amountPtf, nonce, deadline };
    const signature = await this.signer.signTypedData(domain, types, value);

    const tx = await this.escrowVault.releaseTaskReward(
      projectIdBytes,
      taskIdBytes,
      devAddress,
      amountPtf,
      deadline,
      signature
    );
    return tx.hash as string;
  }

  // F4 — La fonction du contrat s'appelle executePunishment avec une signature différente :
  // executePunishment(bytes32 projectId, bytes32 taskId, address dev, uint256 amount, string punishmentType)
  async executePunishment(
    projectId: string,
    taskId: string,
    devAddress: string,
    amount: bigint,
    punishmentType: string
  ): Promise<string> {
    const projectIdBytes = projectId.startsWith("0x")
      ? projectId
      : ethers.keccak256(ethers.toUtf8Bytes(projectId));
    const taskIdBytes = taskId.startsWith("0x")
      ? taskId
      : ethers.keccak256(ethers.toUtf8Bytes(taskId));
    const tx = await this.escrowVault.executePunishment(
      projectIdBytes,
      taskIdBytes,
      devAddress,
      amount,
      punishmentType
    );
    return tx.hash as string;
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
