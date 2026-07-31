// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../CreditToken.sol";
import "../ReputationRegistry.sol";
import "../ProjectRegistry.sol";
import "../EscrowVault.sol";

/**
 * PTF deployment script — deploys all 4 contracts in dependency order.
 *
 * Usage:
 *   forge script scripts/Deploy.s.sol --rpc-url $POLYGON_AMOY_RPC --broadcast --verify
 *
 * Env vars required:
 *   DEPLOYER_PK       — private key of the deployer
 *   USDC_ADDRESS      — USDC contract address on target chain
 *   TREASURY_ADDRESS  — PTF treasury multisig address
 */
contract DeployPTF is Script {
    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast(vm.envUint("DEPLOYER_PK"));

        // 1. CreditToken
        CreditToken creditToken = new CreditToken(deployer);
        console.log("CreditToken:", address(creditToken));

        // 2. ReputationRegistry
        ReputationRegistry reputationRegistry = new ReputationRegistry(deployer);
        console.log("ReputationRegistry:", address(reputationRegistry));

        // 3. ProjectRegistry
        ProjectRegistry projectRegistry = new ProjectRegistry(deployer);
        console.log("ProjectRegistry:", address(projectRegistry));

        // 4. EscrowVault (depends on all above)
        EscrowVault escrowVault = new EscrowVault(
            deployer,
            usdc,
            address(creditToken),
            address(reputationRegistry),
            address(projectRegistry),
            treasury
        );
        console.log("EscrowVault:", address(escrowVault));

        // Wire up permissions
        creditToken.addMinter(address(escrowVault));
        reputationRegistry.addWriter(address(escrowVault));
        projectRegistry.addRegistrar(address(escrowVault));

        // EscrowVault is its own operator at deploy (backend operator added separately)
        escrowVault.addOperator(deployer);

        vm.stopBroadcast();

        // Print summary
        console.log("=== PTF Deployment Summary ===");
        console.log("CreditToken       :", address(creditToken));
        console.log("ReputationRegistry:", address(reputationRegistry));
        console.log("ProjectRegistry   :", address(projectRegistry));
        console.log("EscrowVault       :", address(escrowVault));
        console.log("Treasury          :", treasury);
        console.log("USDC              :", usdc);
    }
}
