import {
  ethers,
  solidityPackedKeccak256,
  TypedDataEncoder,
} from "ethers";

export function generateProjectId(
  owner: string,
  name: string,
  timestamp: number
): string {
  return solidityPackedKeccak256(
    ["string", "string", "uint256"],
    [owner, name, timestamp]
  );
}

export function generateTaskId(
  projectId: string,
  parentId: string | null,
  title: string,
  nonce: number
): string {
  return solidityPackedKeccak256(
    ["string", "string", "string", "uint256"],
    [projectId, parentId ?? "", title, nonce]
  );
}

export function computeMerkleRoot(taskIds: string[]): string {
  if (taskIds.length === 0) {
    return ethers.ZeroHash;
  }

  let layer = taskIds.map((id) =>
    id.startsWith("0x") ? id : ethers.keccak256(ethers.toUtf8Bytes(id))
  );

  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = layer[i + 1] ?? layer[i];
      const sorted =
        left.toLowerCase() < right.toLowerCase()
          ? [left, right]
          : [right, left];
      next.push(
        solidityPackedKeccak256(["bytes32", "bytes32"], sorted)
      );
    }
    layer = next;
  }

  return layer[0];
}

export function isValidAddress(address: string): boolean {
  try {
    const checksummed = ethers.getAddress(address);
    return checksummed === address || address.toLowerCase() === address;
  } catch {
    return false;
  }
}

export function checksumAddress(address: string): string {
  return ethers.getAddress(address);
}

export async function signEIP712(
  domain: ethers.TypedDataDomain,
  types: Record<string, ethers.TypedDataField[]>,
  value: Record<string, unknown>,
  privateKey: string
): Promise<string> {
  const wallet = new ethers.Wallet(privateKey);
  return wallet.signTypedData(domain, types, value);
}

export function hashConditions(conditions: Record<string, unknown>): string {
  const sorted = JSON.stringify(conditions, Object.keys(conditions).sort());
  return ethers.keccak256(ethers.toUtf8Bytes(sorted));
}

export function generateNonce(): number {
  return Math.floor(Date.now() / 1000);
}

export function shortHash(hash: string, len = 8): string {
  if (!hash || hash.length < len + 2) return hash;
  return hash.slice(0, 2 + len) + "...";
}
