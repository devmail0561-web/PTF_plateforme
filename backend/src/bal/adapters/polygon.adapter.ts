import { EvmAdapterBase } from "./evm.adapter.base.js";

export class PolygonAdapter extends EvmAdapterBase {
  readonly chainId = "polygon";

  constructor() {
    const signerKey = process.env["SIGNER_PRIVATE_KEY"];
    if (!signerKey) {
      throw new Error(
        "[PTF] SIGNER_PRIVATE_KEY env var is required for PolygonAdapter. " +
        "The fallback zero-key is a known compromised address."
      );
    }
    super(
      process.env["RPC_POLYGON"] ?? "https://polygon-rpc.com",
      signerKey,
      {
        projectRegistry: process.env["CONTRACT_PROJECT_REGISTRY_POLYGON"] ?? "",
        escrowVault: process.env["CONTRACT_ESCROW_VAULT_POLYGON"] ?? "",
        creditToken: process.env["CONTRACT_CREDIT_TOKEN_POLYGON"] ?? "",
        reputationRegistry: process.env["CONTRACT_REPUTATION_REGISTRY_POLYGON"] ?? "",
      }
    );
  }
}
