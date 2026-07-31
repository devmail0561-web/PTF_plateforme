// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../CreditToken.sol";
import "../ReputationRegistry.sol";
import "../ProjectRegistry.sol";
import "../EscrowVault.sol";

contract MockUSDC2 is ERC20("Mock USDC", "USDC") {
    uint8 private constant DEC = 6;
    function decimals() public pure override returns (uint8) { return DEC; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * Invariant tests for EscrowVault.
 *
 * Invariant 1 — Solvency: sum of all escrow balances ≤ USDC balance of vault
 * Invariant 2 — Soft-lock coherence: softLocked[dev] ≤ ptfToken.balanceOf(dev)
 * Invariant 3 — Punishment distribution: 80% treasury + 20% project = 100%
 */
contract EscrowVaultHandler is Test {
    MockUSDC2 public usdc;
    CreditToken public ptf;
    EscrowVault public vault;

    address[] public devs;
    bytes32[] public projectIds;

    address owner = address(this);
    address operator;

    uint256 public totalEscrowFunded;

    constructor() {
        usdc = new MockUSDC2();
        ptf  = new CreditToken(owner);
        ReputationRegistry rep = new ReputationRegistry(owner);
        ProjectRegistry proj = new ProjectRegistry(owner);

        operator = makeAddr("operator");

        vault = new EscrowVault(
            owner,
            address(usdc),
            address(ptf),
            address(rep),
            address(proj),
            makeAddr("treasury")
        );

        ptf.addMinter(address(vault));
        ptf.addMinter(owner);
        vault.addOperator(operator);

        usdc.mint(operator, 10_000_000e6);
        vm.prank(operator);
        usdc.approve(address(vault), type(uint256).max);

        // Register 3 projects
        for (uint256 i = 0; i < 3; i++) {
            bytes32 pid = keccak256(abi.encode("project", i));
            projectIds.push(pid);
        }

        // Create 5 devs with 50 PTF each
        for (uint256 i = 0; i < 5; i++) {
            address d = makeAddr(string(abi.encode("dev", i)));
            devs.push(d);
            ptf.mint(d, 50e6);
        }
    }

    function fundProject(uint256 projectIndex, uint96 amount) external {
        if (amount == 0) return;
        uint256 idx = projectIndex % projectIds.length;
        bytes32 pid = projectIds[idx];

        totalEscrowFunded += amount;
        vm.prank(operator);
        vault.fundProject(pid, amount);
    }

    function softLockDev(uint256 devIndex) external {
        address d = devs[devIndex % devs.length];
        if (ptf.balanceOf(d) >= vault.softLocked(d) + vault.SOFT_LOCK_AMOUNT()) {
            vm.prank(operator);
            vault.softLock(d);
        }
    }

    function softUnlockDev(uint256 devIndex) external {
        address d = devs[devIndex % devs.length];
        vm.prank(operator);
        vault.softUnlock(d);
    }

    function punishDev(uint256 devIndex, uint256 projectIndex, uint96 amount) external {
        if (amount == 0) return;
        address d = devs[devIndex % devs.length];
        bytes32 pid = projectIds[projectIndex % projectIds.length];
        bytes32 taskId = keccak256(abi.encode("task", devIndex, amount));
        vm.prank(operator);
        vault.executePunishment(pid, taskId, d, amount, "test");
    }
}

contract EscrowVaultInvariant is Test {
    EscrowVaultHandler handler;

    function setUp() public {
        handler = new EscrowVaultHandler();
        targetContract(address(handler));
    }

    /**
     * Invariant 1 — Solvency:
     * vault USDC balance ≥ sum of all project escrow balances
     */
    function invariant_solvency() public view {
        uint256 totalEscrow = 0;
        for (uint256 i = 0; i < 3; i++) {
            bytes32 pid = keccak256(abi.encode("project", i));
            totalEscrow += handler.vault().getEscrowBalance(pid);
        }
        assertGe(
            handler.usdc().balanceOf(address(handler.vault())),
            totalEscrow,
            "Solvency violated: vault USDC < sum of escrow balances"
        );
    }

    /**
     * Invariant 2 — Soft-lock coherence:
     * softLocked[dev] ≤ ptf.balanceOf(dev) for all known devs
     */
    function invariant_softLockCoherence() public view {
        for (uint256 i = 0; i < 5; i++) {
            address d = makeAddr(string(abi.encode("dev", i)));
            assertLe(
                handler.vault().getSoftLocked(d),
                handler.ptf().balanceOf(d),
                "Soft-lock exceeds PTF balance"
            );
        }
    }

    /**
     * Invariant 3 — BPS integrity:
     * PUNISHMENT_TREASURY_BPS + PUNISHMENT_PROJECT_BPS == BPS_DENOMINATOR
     */
    function invariant_punishmentBPS() public view {
        assertEq(
            handler.vault().PUNISHMENT_TREASURY_BPS() + handler.vault().PUNISHMENT_PROJECT_BPS(),
            handler.vault().BPS_DENOMINATOR(),
            "Punishment BPS do not sum to 10000"
        );
    }
}
