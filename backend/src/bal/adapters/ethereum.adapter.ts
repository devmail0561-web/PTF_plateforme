import { EvmAdapterBase } from "./evm.adapter.base.js";

export class EthereumAdapter extends EvmAdapterBase {
  readonly chainId = "ethereum";

  constructor() {
    super(
      process.env["RPC_ETHEREUM"] ?? "https://ethereum-rpc.publicnode.com",
      process.env["SIGNER_PRIVATE_KEY"] ?? "0x" + "0".repeat(64),
      {
        projectRegistry: process.env["CONTRACT_PROJECT_REGISTRY_ETHEREUM"] ?? "",
        escrowVault: process.env["CONTRACT_ESCROW_VAULT_ETHEREUM"] ?? "",
        creditToken: process.env["CONTRACT_CREDIT_TOKEN_ETHEREUM"] ?? "",
        reputationRegistry: process.env["CONTRACT_REPUTATION_REGISTRY_ETHEREUM"] ?? "",
      }
    );
  }
}
