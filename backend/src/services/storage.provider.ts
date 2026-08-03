export interface ContentRef {
  protocol: "arweave" | "ipfs" | "local";
  id: string;    // txId (Arweave) or CID (IPFS) or local path
  url: string;   // gateway URL for retrieval
  hash: string;  // keccak256 of content
}

export interface IStorageProvider {
  store(content: string, metadata: Record<string, string>): Promise<ContentRef>;
  retrieve(ref: ContentRef): Promise<string>;
  isAvailable(ref: ContentRef): Promise<boolean>;
}

// Dev/test stub — stores in memory, returns fake arweave-like refs.
export class MockStorageProvider implements IStorageProvider {
  private store_ = new Map<string, string>();
  private counter = 0;

  async store(content: string, _metadata: Record<string, string>): Promise<ContentRef> {
    const id   = `mock-ar-${++this.counter}`;
    this.store_.set(id, content);
    return { protocol: "arweave", id, url: `https://arweave.net/${id}`, hash: "" };
  }

  async retrieve(ref: ContentRef): Promise<string> {
    return this.store_.get(ref.id) ?? "";
  }

  async isAvailable(ref: ContentRef): Promise<boolean> {
    return this.store_.has(ref.id);
  }
}
