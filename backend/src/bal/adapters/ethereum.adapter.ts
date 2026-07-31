import { EvmAdapterBase } from "./evm.adapter.base.js";

export class EthereumAdapter extends EvmAdapterBase {
  readonly chainId = "ethereum";

  constructor() {
    const signerKey = process.env["SIGNER_PRIVATE_KEY"];
    if (!signerKey) {
      throw new Error(
        "[PTF] SIGNER_PRIVATE_KEY env var is required for EthereumAdapter. " +
        "The fallback zero-key is a known compromised address."
      );
    }
    super(
      process.env["RPC_ETHEREUM"] ?? "https://ethereum-rpc.publicnode.com",
      signerKey,
      {
        projectRegistry: process.env["CONTRACT_PROJECT_REGISTRY_ETHEREUM"] ?? "",
        escrowVault: process.env["CONTRACT_ESCROW_VAULT_ETHEREUM"] ?? "",
        creditToken: process.env["CONTRACT_CREDIT_TOKEN_ETHEREUM"] ?? "",
        reputationRegistry: process.env["CONTRACT_REPUTATION_REGISTRY_ETHEREUM"] ?? "",
      }
    );
  }
}
