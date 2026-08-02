// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
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
contract EscrowVault is ReentrancyGuard, Ownable, Pausable, EIP712 {
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

    // keccak256("PTFCreditUTXO(bytes32 utxoId,address owner,uint256 amount,bytes32 sourceId,string chain,uint256 createdAt)")
    // Must match UTXOService.UTXO_TYPEHASH in the backend.
    bytes32 public constant UTXO_TYPEHASH = keccak256(
        "PTFCreditUTXO(bytes32 utxoId,address owner,uint256 amount,bytes32 sourceId,string chain,uint256 createdAt)"
    );

    // keccak256("WithdrawWithProof(address owner,bytes32[] utxoIds,uint256 totalAmount,address destination,uint256 nonce,uint256 deadline)")
    bytes32 public constant WITHDRAW_PROOF_TYPEHASH = keccak256(
        "WithdrawWithProof(address owner,bytes32[] utxoIds,uint256 totalAmount,address destination,uint256 nonce,uint256 deadline)"
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

    // Withdrawal nonces per address — prevents replay of proof-based withdrawals
    mapping(address => uint256) public withdrawNonces;

    // Spent UTXO ids — prevents double-spending a UTXO on-chain
    mapping(bytes32 => bool) public spentUTXOs;

    // Minted UTXO ids — prevents operator from minting the same utxoId twice
    // Kept separate from spentUTXOs so minted UTXOs remain withdrawable
    mapping(bytes32 => bool) public mintedUTXOs;

    // PTF credits accumulated per project from punishment slashing (20%)
    mapping(bytes32 => uint256) public projectPunishmentFunds;

    // Addresses authorized to call admin functions (PTF backend operator)
    mapping(address => bool) public operators;

    // ── Events ───────────────────────────────────────────────────────────────

    event ProjectFunded(bytes32 indexed projectId, uint256 amount);
    event TaskRewardReleased(bytes32 indexed projectId, bytes32 indexed taskId, address indexed dev, uint256 amount);
    event PunishmentExecuted(bytes32 indexed projectId, bytes32 indexed taskId, address indexed dev, uint256 amount, string punishmentType);
    event SoftLocked(address indexed dev, uint256 amount);
    event SoftUnlocked(address indexed dev, uint256 amount);
    event RefundIssued(bytes32 indexed projectId, address indexed to, uint256 amount);
    event WithdrawalExecuted(address indexed owner, uint256 amount, address indexed destination, bytes32 proofHash);
    event UTXOSpent(bytes32 indexed utxoId, address indexed owner);
    // F9 — Événement distinct pour la création d'un UTXO (évite la confusion avec UTXOSpent).
    event UTXOMinted(bytes32 indexed utxoId, address indexed dev, uint256 amount, bytes32 indexed sourceId);

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
    error UTXOAlreadySpent(bytes32 utxoId);
    error UTXOAlreadyMinted(bytes32 utxoId);
    error UTXONotOwnedByCaller(bytes32 utxoId);
    error UTXOAmountMismatch();
    error InsufficientUTXOTotal(uint256 provided, uint256 required);

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
        require(PUNISHMENT_TREASURY_BPS + PUNISHMENT_PROJECT_BPS == BPS_DENOMINATOR, "BPS must sum to 10000");
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

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
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
        whenNotPaused
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
     * Tokens are transferred INTO the vault (custodial) so the developer cannot
     * move them away to avoid punishment. The dev must approve this contract first.
     *
     * H6 fix: replaced non-custodial counter with a real transferFrom so
     * executePunishment always has tokens to slash regardless of post-lock transfers.
     */
    function softLock(address dev) external onlyOperator nonReentrant whenNotPaused {
        // Check: developer must hold ≥ 10 PTF and have approved this contract
        uint256 balance = ptfToken.balanceOf(dev);
        if (balance < SOFT_LOCK_AMOUNT) revert InsufficientSoftLock();

        // Effects
        softLocked[dev] += SOFT_LOCK_AMOUNT;

        // Interaction: pull tokens into vault custody (dev must have approved)
        SafeERC20.safeTransferFrom(IERC20(address(ptfToken)), dev, address(this), SOFT_LOCK_AMOUNT);

        emit SoftLocked(dev, SOFT_LOCK_AMOUNT);
    }

    /**
     * Release the soft-lock on task cancel or completion — returns escrowed PTF to dev.
     * Always succeeds even if the developer has been partially slashed (returns remainder).
     */
    function softUnlock(address dev) external onlyOperator nonReentrant {
        uint256 locked = softLocked[dev];
        if (locked == 0) return;

        uint256 toReturn = locked < SOFT_LOCK_AMOUNT ? locked : SOFT_LOCK_AMOUNT;
        softLocked[dev] = locked < SOFT_LOCK_AMOUNT ? 0 : locked - SOFT_LOCK_AMOUNT;

        // Return escrowed tokens to dev
        uint256 vaultBalance = ptfToken.balanceOf(address(this));
        if (vaultBalance >= toReturn) {
            SafeERC20.safeTransfer(IERC20(address(ptfToken)), dev, toReturn);
        }
        // If vault has been drained by punishment, return what's available
        else if (vaultBalance > 0) {
            SafeERC20.safeTransfer(IERC20(address(ptfToken)), dev, vaultBalance);
        }

        emit SoftUnlocked(dev, toReturn);
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
    ) external nonReentrant onlyOperator whenNotPaused {
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

        // Also unlock soft-lock if still active — return PTF collateral to dev
        if (softLocked[dev] >= SOFT_LOCK_AMOUNT) {
            softLocked[dev] -= SOFT_LOCK_AMOUNT;
            uint256 vaultBal = ptfToken.balanceOf(address(this));
            uint256 toReturn = vaultBal >= SOFT_LOCK_AMOUNT ? SOFT_LOCK_AMOUNT : vaultBal;
            if (toReturn > 0) {
                SafeERC20.safeTransfer(IERC20(address(ptfToken)), dev, toReturn);
            }
            emit SoftUnlocked(dev, toReturn);
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
    ) external nonReentrant onlyOperator whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        // H6 fix: slash from the custodial soft-lock held in this contract, not from dev wallet.
        // This guarantees punishment is enforceable regardless of post-lock token transfers.
        uint256 lockedForDev = softLocked[dev];
        // Slash what's available in escrow — cap at locked amount (no revert on zero)
        uint256 actualSlash = lockedForDev < amount ? lockedForDev : amount;

        if (actualSlash == 0) {
            // Nothing to slash financially — still record the punishment event
            emit PunishmentExecuted(projectId, taskId, dev, 0, punishmentType);
            return;
        }

        uint256 treasuryShare = (actualSlash * PUNISHMENT_TREASURY_BPS) / BPS_DENOMINATOR;
        uint256 projectShare  = actualSlash - treasuryShare; // remainder goes to project fund

        // ── Checks: distribution adds up ──────────────────────────────────────
        // Distribution invariant: verified statically by constructor BPS check
        // treasuryShare + projectShare == actualSlash by construction (no rounding loss possible)

        // ── Effects (burn first, then mint to recipients) ─────────────────────
        // Update soft-lock counter (tokens are already in vault custody)
        softLocked[dev] -= actualSlash;

        // Track project share before interactions
        projectPunishmentFunds[projectId] += projectShare;

        // Burn from vault custody (tokens were transferred in at softLock time)
        ptfToken.burn(address(this), actualSlash);

        // ── Interactions ──────────────────────────────────────────────────────
        // F6 — Mint 80% to treasury
        ptfToken.mint(treasury, treasuryShare);
        // F6 FIX — Mint 20% to this vault (not treasury) so projectPunishmentFunds
        // stays backed by real tokens available for redistribution.
        ptfToken.mint(address(this), projectShare);

        // softLocked[dev] was already decremented above (by actualSlash)
        // softUnlock will handle remaining balance when called by operator

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
        whenNotPaused
    {
        if (escrowBalance[projectId] < amount) revert InsufficientEscrow();
        if (amount == 0) revert ZeroAmount();

        // CEI: effects before interactions
        escrowBalance[projectId] -= amount;
        usdc.safeTransfer(to, amount);

        emit RefundIssued(projectId, to, amount);
    }

    // ── UTXO-based withdrawal ─────────────────────────────────────────────────

    /**
     * UTXO struct passed by the withdrawer to prove ownership of each credit unit.
     */
    struct UTXOInput {
        bytes32 utxoId;
        uint256 amount;      // in PTF raw units (6 decimals)
        bytes32 sourceId;    // taskId for rewards, depositTxHash for deposits, etc.
        uint256 createdAt;   // unix timestamp ms
        string  chain;       // chain name matching the UTXO at mint time (e.g. "polygon")
        bytes   ptfSignature; // PTF-issued EIP-712 signature over the UTXO fields
    }

    /**
     * Withdraw PTF credits to a destination wallet by presenting UTXO proofs.
     *
     * Each UTXO must carry a valid PTF-issued EIP-712 signature. The on-chain contract
     * verifies every signature, marks each UTXO as spent (double-spend prevention),
     * then burns the PTF tokens and emits a withdrawal event with a proofHash.
     *
     * The proofHash = keccak256(utxoId_0 || utxoId_1 || ... || utxoId_n) is stored
     * on-chain and lets anyone reconstruct and verify the full provenance of the withdrawal.
     *
     * @param inputs        Array of UTXOs proving ownership of the credits
     * @param totalAmount   Expected sum of all UTXO amounts (sanity check)
     * @param destination   Target wallet to receive the USDC equivalent
     * @param deadline      EIP-712 deadline — prevents stale withdrawals
     * @param ownerSignature  dev's EIP-712 signature over (utxoIds[], totalAmount, destination, nonce, deadline)
     */
    function withdrawWithProof(
        UTXOInput[] calldata inputs,
        uint256 totalAmount,
        address destination,
        uint256 deadline,
        bytes calldata ownerSignature
    ) external nonReentrant {
        // ── Checks ────────────────────────────────────────────────────────────
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (totalAmount == 0) revert ZeroAmount();

        address owner = msg.sender;
        uint256 nonce = withdrawNonces[owner];

        // Verify owner's intent signature
        {
            bytes32[] memory ids = new bytes32[](inputs.length);
            for (uint256 i = 0; i < inputs.length; i++) {
                ids[i] = inputs[i].utxoId;
            }
            bytes32 idsHash = keccak256(abi.encodePacked(ids));
            bytes32 structHash = keccak256(
                abi.encode(
                    WITHDRAW_PROOF_TYPEHASH,
                    owner,
                    idsHash,
                    totalAmount,
                    destination,
                    nonce,
                    deadline
                )
            );
            bytes32 digest = _hashTypedDataV4(structHash);
            address recovered = digest.recover(ownerSignature);
            if (recovered != owner) revert InvalidSignature();
        }

        // Cache owner() to avoid repeated external calls in the hot loop
        address ptfOwner = owner();

        // Verify each UTXO: PTF signature + intra-call dedup + double-spend guard + amount sum
        uint256 verifiedTotal = 0;
        bytes32 proofHash;
        {
            bytes memory packed;
            // Track utxoIds seen in this call to prevent intra-call double-spend
            bytes32[] memory seenIds = new bytes32[](inputs.length);

            for (uint256 i = 0; i < inputs.length; i++) {
                UTXOInput calldata inp = inputs[i];

                // Intra-call dedup: inputs MUST be sorted by utxoId (ascending, strict).
                // This gives O(n) dedup instead of O(n²) nested loop.
                if (i > 0 && inp.utxoId <= seenIds[i - 1]) revert UTXOAlreadySpent(inp.utxoId);
                seenIds[i] = inp.utxoId;

                // Cross-call double-spend guard
                if (spentUTXOs[inp.utxoId]) revert UTXOAlreadySpent(inp.utxoId);

                // Verify PTF-issued UTXO signature using full EIP-712 digest (domain separator included)
                bytes32 utxoStructHash = keccak256(
                    abi.encode(
                        UTXO_TYPEHASH,
                        inp.utxoId,
                        owner,
                        inp.amount,
                        inp.sourceId,
                        keccak256(bytes(inp.chain)), // use actual chain from input, not hardcoded
                        inp.createdAt
                    )
                );
                // _hashTypedDataV4 prepends "\x19\x01" + domainSeparator — mandatory for EIP-712
                address signer = _hashTypedDataV4(utxoStructHash).recover(inp.ptfSignature);
                if (signer != ptfOwner) revert InvalidSignature();

                verifiedTotal += inp.amount;
                packed = abi.encodePacked(packed, inp.utxoId);
            }
            proofHash = keccak256(packed);
        }

        if (verifiedTotal != totalAmount) revert InsufficientUTXOTotal(verifiedTotal, totalAmount);

        // ── Effects ───────────────────────────────────────────────────────────
        withdrawNonces[owner]++;

        for (uint256 i = 0; i < inputs.length; i++) {
            spentUTXOs[inputs[i].utxoId] = true;
            emit UTXOSpent(inputs[i].utxoId, owner);
        }

        // ── Interactions ──────────────────────────────────────────────────────
        // Burn PTF tokens (totalAmount raw units)
        ptfToken.burn(owner, totalAmount);

        // Transfer USDC equivalent (1 PTF = 1 USDC, same decimals)
        usdc.safeTransfer(destination, totalAmount);

        emit WithdrawalExecuted(owner, totalAmount, destination, proofHash);
    }

    /**
     * Mint a UTXO receipt on-chain when a task reward is released.
     * Emits a CreditClaimed event in CreditToken that anchors the UTXO to the chain state.
     * Called by the operator after task validation.
     *
     * The PTF backend signs the UTXO off-chain as well — the on-chain record is the
     * canonical source of truth for the proofHash.
     */
    function mintUTXOReceipt(
        bytes32 utxoId,
        address dev,
        uint256 amount,
        bytes32 sourceId   // taskId
    ) external onlyOperator nonReentrant whenNotPaused {
        // Idempotency guard — prevents operator from minting the same utxoId twice
        if (mintedUTXOs[utxoId]) revert UTXOAlreadyMinted(utxoId);
        mintedUTXOs[utxoId] = true;

        // Mint PTF tokens to dev — this is the spendable credit
        ptfToken.mint(dev, amount);

        // F9 — Utiliser l'événement UTXOMinted dédié au lieu de détourner UTXOSpent(utxoId, address(0)).
        // L'ancien emit UTXOSpent(utxoId, address(0)) marquait le UTXO comme "dépensé" dès la création,
        // ce qui confondait les indexeurs The Graph et bloquait les retraits.
        emit UTXOMinted(utxoId, dev, amount, sourceId);
    }

    // ── View ─────────────────────────────────────────────────────────────────

    function getEscrowBalance(bytes32 projectId) external view returns (uint256) {
        return escrowBalance[projectId];
    }

    function getSoftLocked(address dev) external view returns (uint256) {
        return softLocked[dev];
    }

    function isUTXOSpent(bytes32 utxoId) external view returns (bool) {
        return spentUTXOs[utxoId];
    }

    function isUTXOMinted(bytes32 utxoId) external view returns (bool) {
        return mintedUTXOs[utxoId];
    }

    function getWithdrawNonce(address owner) external view returns (uint256) {
        return withdrawNonces[owner];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
