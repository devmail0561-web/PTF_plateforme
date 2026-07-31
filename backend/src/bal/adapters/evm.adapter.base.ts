import { ethers } from "ethers";
import type { IChainAdapter, IContractAddresses } from "../chain.adapter.js";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const CREDIT_TOKEN_ABI = [
  ...ERC20_ABI,
  "function mint(address to, uint256 amount, bytes32 taskId) external",
  "function burn(address from, uint256 amount) external",
];

const REPUTATION_ABI = [
  "function getReputation(address wallet) view returns (uint256)",
  "function setReputation(address wallet, int256 delta, string reason) external returns (bytes32)",
  "function isBanned(address wallet) view returns (bool)",
];

const PROJECT_REGISTRY_ABI = [
  "function claimTask(bytes32 taskId, address devAddress, bytes32 conditionsHash) external",
  "function anchorMerkleRoot(bytes32 projectId, bytes32 merkleRoot) external",
  "function verifyMerkleProof(bytes32 leaf, bytes32[] proof, bytes32 root) view returns (bool)",
];

const ESCROW_VAULT_ABI = [
  "function softLock(address dev, uint256 amount) external",
  "function softUnlock(address dev, uint256 amount) external",
  "function deductPenalty(address dev, uint256 amount, string reason, bytes32 projectId) external",
  "function releaseReward(bytes32 taskId, address dev, uint256 amount) external",
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
    conditionsHash: string
  ): Promise<string> {
    const tx = await this.projectRegistry.claimTask(
      ethers.hexlify(ethers.toUtf8Bytes(taskId)),
      devAddress,
      conditionsHash
    );
    return tx.hash as string;
  }

  async softLock(devAddress: string, amountPtf: bigint): Promise<string> {
    const tx = await this.escrowVault.softLock(devAddress, amountPtf);
    return tx.hash as string;
  }

  async softUnlock(devAddress: string, amountPtf: bigint): Promise<string> {
    const tx = await this.escrowVault.softUnlock(devAddress, amountPtf);
    return tx.hash as string;
  }

  async mintCredits(
    devAddress: string,
    amount: bigint,
    taskId: string
  ): Promise<string> {
    const tx = await this.creditToken.mint(
      devAddress,
      amount,
      ethers.hexlify(ethers.toUtf8Bytes(taskId))
    );
    return tx.hash as string;
  }

  async burnCredits(devAddress: string, amount: bigint): Promise<string> {
    const tx = await this.creditToken.burn(devAddress, amount);
    return tx.hash as string;
  }

  async deductPenalty(
    devAddress: string,
    amount: bigint,
    reason: string,
    projectId: string
  ): Promise<string> {
    const tx = await this.escrowVault.deductPenalty(
      devAddress,
      amount,
      reason,
      ethers.hexlify(ethers.toUtf8Bytes(projectId))
    );
    return tx.hash as string;
  }

  async getReputation(address: string): Promise<bigint> {
    return this.reputationRegistry.getReputation(address) as Promise<bigint>;
  }

  async setReputation(
    address: string,
    delta: bigint,
    reason: string
  ): Promise<string> {
    const tx = await this.reputationRegistry.setReputation(
      address,
      delta,
      reason
    );
    return tx.hash as string;
  }

  async anchorMerkleRoot(
    projectId: string,
    merkleRoot: string
  ): Promise<string> {
    const tx = await this.projectRegistry.anchorMerkleRoot(
      ethers.hexlify(ethers.toUtf8Bytes(projectId)),
      merkleRoot
    );
    return tx.hash as string;
  }

  async verifyMerkleProof(
    leaf: string,
    proof: string[],
    root: string
  ): Promise<boolean> {
    return this.projectRegistry.verifyMerkleProof(
      leaf,
      proof,
      root
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

  async isBanned(address: string): Promise<boolean> {
    return this.reputationRegistry.isBanned(address) as Promise<boolean>;
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
