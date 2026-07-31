import type { IChainAdapter } from "./chain.adapter.js";
import { PtfError, PtfErrorCode } from "../types/errors.js";

export interface IChainRegistry {
  register(chainId: string, adapter: IChainAdapter): void;
  get(chainId: string): IChainAdapter;
  getDefault(): IChainAdapter;
  listChains(): string[];
  has(chainId: string): boolean;
}

export class ChainRegistry implements IChainRegistry {
  private readonly adapters = new Map<string, IChainAdapter>();
  private defaultChain: string;

  constructor(defaultChain = "polygon") {
    this.defaultChain = defaultChain;
  }

  register(chainId: string, adapter: IChainAdapter): void {
    this.adapters.set(chainId, adapter);
  }

  get(chainId: string): IChainAdapter {
    const adapter = this.adapters.get(chainId);
    if (!adapter) {
      throw new PtfError(
        PtfErrorCode.INVALID_CHAIN,
        `Chaîne non supportée : ${chainId}. Chaînes disponibles : ${this.listChains().join(", ")}`
      );
    }
    return adapter;
  }

  getDefault(): IChainAdapter {
    return this.get(this.defaultChain);
  }

  listChains(): string[] {
    return [...this.adapters.keys()];
  }

  has(chainId: string): boolean {
    return this.adapters.has(chainId);
  }

  setDefault(chainId: string): void {
    if (!this.has(chainId)) {
      throw new PtfError(PtfErrorCode.INVALID_CHAIN, `Chaîne inconnue : ${chainId}`);
    }
    this.defaultChain = chainId;
  }
}
