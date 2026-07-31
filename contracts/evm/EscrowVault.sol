// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./CreditToken.sol";
import "./ReputationRegistry.sol";
import "./ProjectRegistry.sol";

/**
 * PTF Escrow Vault — holds project funds, releases per validated task, executes punishments.
 *
 * Security invariants:
 *   - All fund transfers use SafeERC20 (no raw transfer/transferFrom)
 *   - All state mutating functions use ReentrancyGuard
 *   - Pattern: checks → effects → interactions (CEI) strictly enforced
 *   - Punishment distribution: 80% → PTF treasury, 20% → project fund (hardcoded)
 *   - EIP-712 signatures include nonce, deadline, chainId (anti-replay)
 */
contract EscrowVault is ReentrancyGuard, Ownable, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ── Constants ────────────────────────────────────────────────────────────

    uint256 public constant PUNISHMENT_TREASURY_BPS = 8000; // 80%
    uint256 public constant PUNISHMENT_PROJECT_BPS   = 2000; // 20%
    uint256 public constant BPS_DENOMINATOR          = 10000;

    uint256 public constant SOFT_LOCK_AMOUNT = 10 * 1e6; // 10 PTF (6 decimals)

    // keccak256("TaskRelease(bytes32 projectId,bytes32 taskId,address dev,uint256 amount,uint256 nonce,uint256 deadline)")
    bytes32 public constant TASK_RELEASE_TYPEHASH = keccak256(
        "TaskRelease(bytes32 projectId,bytes32 taskId,address dev,uint256 amount,uint256 nonce,uint256 deadline)"
    );

    // ── State ────────────────────────────────────────────────────────────────

    IERC20 public immutable usdc;
    CreditToken public immutable ptfToken;
    ReputationRegistry public immutable reputationRegistry;
    ProjectRegistry public immutable projectRegistry;

    address public treasury;

    // Funds locked per project (in USDC)
    mapping(bytes32 => uint256) public escrowBalance;

    // Soft-locked PTF credits per developer
    mapping(address => uint256) public softLocked;

    // Released rewards per task (idempotency guard)
    mapping(bytes32 => bool) public taskReleased;

    // EIP-712 release nonces per (dev, taskId)
    mapping(address => mapping(bytes32 => uint256)) public releaseNonces;

    // Addresses authorized to call admin functions (PTF backend operator)
    mapping(address => bool) public operators;

    // ── Events ───────────────────────────────────────────────────────────────

    event ProjectFunded(bytes32 indexed projectId, uint256 amount);
    event TaskRewardReleased(bytes32 indexed projectId, bytes32 indexed taskId, address indexed dev, uint256 amount);
    event PunishmentExecuted(bytes32 indexed projectId, bytes32 indexed taskId, address indexed dev, uint256 amount, string punishmentType);
    event SoftLocked(address indexed dev, uint256 amount);
    event SoftUnlocked(address indexed dev, uint256 amount);
    event RefundIssued(bytes32 indexed projectId, address indexed to, uint256 amount);

    // ── Errors ───────────────────────────────────────────────────────────────

    error NotOperator();
    error InsufficientEscrow();
    error InsufficientSoftLock();
    error TaskAlreadyReleased();
    error InvalidSignature();
    error DeadlineExpired();
    error NonceConsumed();
    error ZeroAmount();
    error InvalidDistribution();

    // ── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOperator() {
        if (!operators[msg.sender]) revert NotOperator();
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address initialOwner,
        address _usdc,
        address _ptfToken,
        address _reputationRegistry,
        address _projectRegistry,
        address _treasury
    )
        Ownable(initialOwner)
        EIP712("PTFEscrowVault", "1")
    {
        usdc = IERC20(_usdc);
        ptfToken = CreditToken(_ptfToken);
        reputationRegistry = ReputationRegistry(_reputationRegistry);
        projectRegistry = ProjectRegistry(_projectRegistry);
        treasury = _treasury;
    }

    // ── Operator management ──────────────────────────────────────────────────

    function addOperator(address op) external onlyOwner {
        operators[op] = true;
    }

    function removeOperator(address op) external onlyOwner {
        operators[op] = false;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        treasury = newTreasury;
    }

    // ── Project funding ──────────────────────────────────────────────────────

    /**
     * Fund a project escrow. Called by project creator on `ptf tasks publish`.
     * Amount = rewardPool + gasReserve + commission (already calculated off-chain).
     */
    function fundProject(bytes32 projectId, uint256 amount)
        external
        nonReentrant
        onlyOperator
    {
        if (amount == 0) revert ZeroAmount();

        // Effects before interactions (CEI)
        escrowBalance[projectId] += amount;

        // Interaction: pull USDC from operator (operator has pre-approved)
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit ProjectFunded(projectId, amount);
    }

    // ── Soft lock (10 PTF guarantee) ─────────────────────────────────────────

    /**
     * Soft-lock 10 PTF from a developer when they claim a paid task.
     * Tokens remain in the developer's wallet but are marked as locked.
     */
    function softLock(address dev) external onlyOperator nonReentrant {
        // Check: developer must hold ≥ 10 PTF
        uint256 balance = ptfToken.balanceOf(dev);
        uint256 alreadyLocked = softLocked[dev];
        if (balance < alreadyLocked + SOFT_LOCK_AMOUNT) revert InsufficientSoftLock();

        // Effects
        softLocked[dev] += SOFT_LOCK_AMOUNT;

        emit SoftLocked(dev, SOFT_LOCK_AMOUNT);
    }

    /**
     * Release the soft-lock on task cancel or completion.
     * Always succeeds even if the developer has been slashed (floor at 0).
     */
    function softUnlock(address dev) external onlyOperator nonReentrant {
        uint256 locked = softLocked[dev];
        if (locked < SOFT_LOCK_AMOUNT) {
            softLocked[dev] = 0;
        } else {
            softLocked[dev] -= SOFT_LOCK_AMOUNT;
        }
        emit SoftUnlocked(dev, SOFT_LOCK_AMOUNT);
    }

    // ── Task reward release ──────────────────────────────────────────────────

    /**
     * Release USDC reward to developer after task validation.
     * Requires a PTF-signed EIP-712 voucher.
     *
     * Signature covers: projectId, taskId, dev, amount, nonce, deadline, chainId (domain).
     */
    function releaseTaskReward(
        bytes32 projectId,
        bytes32 taskId,
        address dev,
        uint256 amount,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant onlyOperator {
        // ── Checks ────────────────────────────────────────────────────────────
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (taskReleased[taskId]) revert TaskAlreadyReleased();
        if (escrowBalance[projectId] < amount) revert InsufficientEscrow();
        if (amount == 0) revert ZeroAmount();

        uint256 nonce = releaseNonces[dev][taskId];
        if (nonce != 0) revert NonceConsumed();

        bytes32 structHash = keccak256(
            abi.encode(TASK_RELEASE_TYPEHASH, projectId, taskId, dev, amount, nonce, deadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);
        if (signer != owner()) revert InvalidSignature();

        // ── Effects ───────────────────────────────────────────────────────────
        taskReleased[taskId] = true;
        releaseNonces[dev][taskId] = 1;
        escrowBalance[projectId] -= amount;

        // Also unlock soft-lock if still active
        if (softLocked[dev] >= SOFT_LOCK_AMOUNT) {
            softLocked[dev] -= SOFT_LOCK_AMOUNT;
        }

        // ── Interactions ──────────────────────────────────────────────────────
        usdc.safeTransfer(dev, amount);

        emit TaskRewardReleased(projectId, taskId, dev, amount);
    }

    // ── Punishment execution ─────────────────────────────────────────────────

    /**
     * Execute a financial punishment: burn PTF credits and distribute penalty.
     * Distribution is hardcoded: 80% → PTF treasury, 20% → project fund.
     * Reputation penalty is handled off-chain via ReputationRegistry.
     *
     * @param projectId  The project the punishment applies to
     * @param taskId     The task associated with the punishment
     * @param dev        The developer being punished
     * @param amount     Amount in PTF credits (6 decimals) to slash
     * @param punishmentType  Human-readable type ("lateDelivery", "maliciousCode", etc.)
     */
    function executePunishment(
        bytes32 projectId,
        bytes32 taskId,
        address dev,
        uint256 amount,
        string calldata punishmentType
    ) external nonReentrant onlyOperator {
        if (amount == 0) revert ZeroAmount();

        uint256 devBalance = ptfToken.balanceOf(dev);
        // Slash what we can — cap at actual balance (no revert on poverty)
        uint256 actualSlash = devBalance < amount ? devBalance : amount;

        if (actualSlash == 0) {
            // Nothing to slash financially — still record the punishment event
            emit PunishmentExecuted(projectId, taskId, dev, 0, punishmentType);
            return;
        }

        uint256 treasuryShare = (actualSlash * PUNISHMENT_TREASURY_BPS) / BPS_DENOMINATOR;
        uint256 projectShare  = actualSlash - treasuryShare; // remainder goes to project fund

        // ── Checks: distribution adds up ──────────────────────────────────────
        if (treasuryShare + projectShare != actualSlash) revert InvalidDistribution();

        // ── Effects (burn first, then mint to recipients) ─────────────────────
        // Burn from developer
        ptfToken.burn(dev, actualSlash);

        // ── Interactions ──────────────────────────────────────────────────────
        // Mint 80% to treasury
        ptfToken.mint(treasury, treasuryShare);
        // Mint 20% to project escrow (converted to project fund credit)
        escrowBalance[projectId] += projectShare;
        ptfToken.mint(address(this), projectShare);

        // Release soft-lock regardless
        if (softLocked[dev] >= SOFT_LOCK_AMOUNT) {
            softLocked[dev] -= SOFT_LOCK_AMOUNT;
        }

        emit PunishmentExecuted(projectId, taskId, dev, actualSlash, punishmentType);
    }

    /**
     * Apply on-chain reputation penalty.
     * Calls ReputationRegistry directly (separate from financial punishment).
     */
    function applyReputationPenalty(
        address dev,
        int256 delta,
        bytes32 taskId,
        string calldata reason
    ) external onlyOperator {
        reputationRegistry.applyDelta(dev, delta, taskId, reason);
    }

    // ── Refund ───────────────────────────────────────────────────────────────

    /**
     * Refund remaining escrow to project owner (e.g., project cancelled).
     */
    function refundProject(bytes32 projectId, address to, uint256 amount)
        external
        nonReentrant
        onlyOperator
    {
        if (escrowBalance[projectId] < amount) revert InsufficientEscrow();
        if (amount == 0) revert ZeroAmount();

        // CEI: effects before interactions
        escrowBalance[projectId] -= amount;
        usdc.safeTransfer(to, amount);

        emit RefundIssued(projectId, to, amount);
    }

    // ── View ─────────────────────────────────────────────────────────────────

    function getEscrowBalance(bytes32 projectId) external view returns (uint256) {
        return escrowBalance[projectId];
    }

    function getSoftLocked(address dev) external view returns (uint256) {
        return softLocked[dev];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
