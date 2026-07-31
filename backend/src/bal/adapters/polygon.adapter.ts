import { EvmAdapterBase } from "./evm.adapter.base.js";

export class PolygonAdapter extends EvmAdapterBase {
  readonly chainId = "polygon";

  constructor() {
    super(
      process.env["RPC_POLYGON"] ?? "https://polygon-rpc.com",
      process.env["SIGNER_PRIVATE_KEY"] ?? "0x" + "0".repeat(64),
      {
        projectRegistry: process.env["CONTRACT_PROJECT_REGISTRY_POLYGON"] ?? "",
        escrowVault: process.env["CONTRACT_ESCROW_VAULT_POLYGON"] ?? "",
        creditToken: process.env["CONTRACT_CREDIT_TOKEN_POLYGON"] ?? "",
        reputationRegistry: process.env["CONTRACT_REPUTATION_REGISTRY_POLYGON"] ?? "",
      }
    );
  }
}
