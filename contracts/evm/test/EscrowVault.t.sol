// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../CreditToken.sol";
import "../ReputationRegistry.sol";
import "../ProjectRegistry.sol";
import "../EscrowVault.sol";

// Minimal ERC-20 mock for USDC
contract MockUSDC is ERC20("Mock USDC", "USDC") {
    uint8 private constant DEC = 6;
    function decimals() public pure override returns (uint8) { return DEC; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract EscrowVaultTest is Test {
    MockUSDC usdc;
    CreditToken ptf;
    ReputationRegistry rep;
    ProjectRegistry proj;
    EscrowVault vault;

    address owner     = address(this);
    address operator  = makeAddr("operator");
    address treasury  = makeAddr("treasury");
    address creator   = makeAddr("creator");
    address dev       = makeAddr("dev");

    bytes32 constant PROJECT_ID = keccak256("project-001");
    bytes32 constant TASK_ID    = keccak256("task-001");

    function setUp() public {
        usdc = new MockUSDC();
        ptf  = new CreditToken(owner);
        rep  = new ReputationRegistry(owner);
        proj = new ProjectRegistry(owner);

        vault = new EscrowVault(
            owner,
            address(usdc),
            address(ptf),
            address(rep),
            address(proj),
            treasury
        );

        // Wire permissions
        ptf.addMinter(address(vault));
        rep.addWriter(address(vault));
        proj.addRegistrar(address(vault));
        vault.addOperator(operator);

        // Fund operator with USDC for project funding
        usdc.mint(operator, 1_000_000e6);
        vm.prank(operator);
        usdc.approve(address(vault), type(uint256).max);

        // Give dev 20 PTF
        ptf.addMinter(owner);
        ptf.mint(dev, 20e6);
    }

    // ── Project funding ──────────────────────────────────────────────────────

    function test_fundProject() public {
        vm.prank(operator);
        vault.fundProject(PROJECT_ID, 3000e6);
        assertEq(vault.getEscrowBalance(PROJECT_ID), 3000e6);
    }

    function test_fundProjectZeroReverts() public {
        vm.expectRevert(EscrowVault.ZeroAmount.selector);
        vm.prank(operator);
        vault.fundProject(PROJECT_ID, 0);
    }

    function test_nonOperatorFundReverts() public {
        vm.expectRevert(EscrowVault.NotOperator.selector);
        vault.fundProject(PROJECT_ID, 1000e6);
    }

    // ── Soft lock ────────────────────────────────────────────────────────────

    function test_softLock() public {
        // Dev must approve vault to pull PTF tokens (custodial lock — H6 fix)
        vm.prank(dev);
        ptf.approve(address(vault), 10e6);

        uint256 devBefore = ptf.balanceOf(dev);
        vm.prank(operator);
        vault.softLock(dev);

        assertEq(vault.getSoftLocked(dev), 10e6);
        // Tokens are now in vault custody
        assertEq(ptf.balanceOf(dev), devBefore - 10e6);
        assertEq(ptf.balanceOf(address(vault)), 10e6);
    }

    function test_softLockInsufficientBalance_reverts() public {
        address poorDev = makeAddr("poordev");
        // poorDev has 0 PTF
        vm.expectRevert(EscrowVault.InsufficientSoftLock.selector);
        vm.prank(operator);
        vault.softLock(poorDev);
    }

    function test_softUnlock() public {
        vm.prank(dev);
        ptf.approve(address(vault), 10e6);

        uint256 devBefore = ptf.balanceOf(dev);
        vm.prank(operator);
        vault.softLock(dev);

        vm.prank(operator);
        vault.softUnlock(dev);

        assertEq(vault.getSoftLocked(dev), 0);
        // Tokens returned to dev
        assertEq(ptf.balanceOf(dev), devBefore);
    }

    // ── Task reward release ──────────────────────────────────────────────────

    function _buildReleaseSignature(
        uint256 signerPk,
        bytes32 projectId,
        bytes32 taskId,
        address _dev,
        uint256 amount,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                vault.TASK_RELEASE_TYPEHASH(),
                projectId,
                taskId,
                _dev,
                amount,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", vault.domainSeparator(), structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_releaseTaskReward() public {
        // Fund project
        vm.prank(operator);
        vault.fundProject(PROJECT_ID, 1000e6);

        uint256 ownerPk = 0xA11CE;
        vault.transferOwnership(vm.addr(ownerPk));

        uint256 amount   = 150e6;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _buildReleaseSignature(ownerPk, PROJECT_ID, TASK_ID, dev, amount, 0, deadline);

        uint256 devBefore = usdc.balanceOf(dev);

        vm.prank(operator);
        vault.releaseTaskReward(PROJECT_ID, TASK_ID, dev, amount, deadline, sig);

        assertEq(usdc.balanceOf(dev), devBefore + amount);
        assertEq(vault.getEscrowBalance(PROJECT_ID), 1000e6 - amount);
        assertTrue(vault.taskReleased(TASK_ID));
    }

    function test_releaseTaskReward_replay_reverts() public {
        vm.prank(operator);
        vault.fundProject(PROJECT_ID, 1000e6);

        uint256 ownerPk = 0xA11CE;
        vault.transferOwnership(vm.addr(ownerPk));

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _buildReleaseSignature(ownerPk, PROJECT_ID, TASK_ID, dev, 150e6, 0, deadline);

        vm.prank(operator);
        vault.releaseTaskReward(PROJECT_ID, TASK_ID, dev, 150e6, deadline, sig);

        vm.expectRevert(EscrowVault.TaskAlreadyReleased.selector);
        vm.prank(operator);
        vault.releaseTaskReward(PROJECT_ID, TASK_ID, dev, 150e6, deadline, sig);
    }

    function test_releaseTaskReward_expired_reverts() public {
        vm.prank(operator);
        vault.fundProject(PROJECT_ID, 1000e6);

        uint256 ownerPk = 0xA11CE;
        vault.transferOwnership(vm.addr(ownerPk));

        uint256 deadline = block.timestamp - 1;
        bytes memory sig = _buildReleaseSignature(ownerPk, PROJECT_ID, TASK_ID, dev, 150e6, 0, deadline);

        vm.expectRevert(EscrowVault.DeadlineExpired.selector);
        vm.prank(operator);
        vault.releaseTaskReward(PROJECT_ID, TASK_ID, dev, 150e6, deadline, sig);
    }

    // ── Punishment 80/20 distribution ────────────────────────────────────────

    // Helper: soft-lock dev (requires prior approval)
    function _softLockDev(address _dev, uint256 _amount) internal {
        vm.prank(_dev);
        ptf.approve(address(vault), _amount);
        vm.prank(operator);
        vault.softLock(_dev);
    }

    function test_punishment_distribution_8020() public {
        // H6 fix: punishment now slashes from vault custody, not from dev wallet.
        // Dev must first soft-lock (transferring 10 PTF into vault).
        _softLockDev(dev, 10e6);

        uint256 slashAmount = 50e6; // 50 PTF requested

        uint256 treasuryBefore = ptf.balanceOf(treasury);

        vm.prank(operator);
        vault.executePunishment(PROJECT_ID, TASK_ID, dev, slashAmount, "maliciousCode");

        // dev soft-locked 10 PTF in vault → actualSlash = min(10, 50) = 10
        uint256 actualSlash    = 10e6;
        uint256 expectedTreasury = (actualSlash * 8000) / 10000; // 8 PTF
        uint256 expectedProjectFund = actualSlash - expectedTreasury; // 2 PTF → treasury (H7 fix)

        // Vault burned the 10 PTF it held; treasury got 80% + 20%
        assertEq(ptf.balanceOf(treasury), treasuryBefore + expectedTreasury + expectedProjectFund);
        assertEq(vault.getSoftLocked(dev), 0);
    }

    function test_punishment_exact_slash() public {
        // Soft-lock 10 PTF first
        _softLockDev(dev, 10e6);

        vm.prank(operator);
        vault.executePunishment(PROJECT_ID, TASK_ID, dev, 10e6, "criticalBug");

        uint256 expectedTreasury = (10e6 * 8000) / 10000; // 8 PTF
        uint256 expectedProject  = 10e6 - expectedTreasury; // 2 PTF → treasury (H7 fix)

        assertEq(ptf.balanceOf(treasury), expectedTreasury + expectedProject);
        assertEq(vault.getSoftLocked(dev), 0);
    }

    function test_punishment_zeroLocked_noRevert() public {
        address brokedev = makeAddr("brokedev");
        // No soft-lock — punishment emits but does nothing financially
        vm.prank(operator);
        vault.executePunishment(PROJECT_ID, TASK_ID, brokedev, 100e6, "lateDelivery");
        assertEq(ptf.balanceOf(brokedev), 0);
    }

    // ── Refund ───────────────────────────────────────────────────────────────

    function test_refundProject() public {
        vm.prank(operator);
        vault.fundProject(PROJECT_ID, 500e6);

        uint256 before = usdc.balanceOf(creator);
        vm.prank(operator);
        vault.refundProject(PROJECT_ID, creator, 200e6);

        assertEq(usdc.balanceOf(creator), before + 200e6);
        assertEq(vault.getEscrowBalance(PROJECT_ID), 300e6);
    }

    function test_refundExceedsBalance_reverts() public {
        vm.prank(operator);
        vault.fundProject(PROJECT_ID, 100e6);

        vm.expectRevert(EscrowVault.InsufficientEscrow.selector);
        vm.prank(operator);
        vault.refundProject(PROJECT_ID, creator, 200e6);
    }

    // ── Reputation penalty ───────────────────────────────────────────────────

    function test_applyReputationPenalty() public {
        // First give some reputation
        vm.prank(operator);
        vault.applyReputationPenalty(dev, 200, TASK_ID, "task_validated");

        vm.prank(operator);
        vault.applyReputationPenalty(dev, -50, TASK_ID, "punishment:lateDelivery");

        assertEq(rep.getScore(dev), 150);
    }
}
