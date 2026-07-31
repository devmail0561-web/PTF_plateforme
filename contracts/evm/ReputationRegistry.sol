// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * PTF Reputation Registry — immutable, auditable on-chain reputation scores.
 * Each entry is timestamped and linked to a taskId for traceability.
 */
contract ReputationRegistry is Ownable {

    struct ReputationEntry {
        int256 delta;
        string reason; // e.g. "task_validated", "punishment:lateDelivery"
        bytes32 taskId;
        uint256 timestamp;
    }

    // Total score per address (can go negative but we floor at 0 for display)
    mapping(address => int256) private _scores;

    // Full history per address
    mapping(address => ReputationEntry[]) private _history;

    // Addresses authorized to write (PunishmentService backend, EscrowVault)
    mapping(address => bool) public writers;

    event ReputationUpdated(
        address indexed dev,
        int256 delta,
        int256 newTotal,
        bytes32 indexed taskId,
        string reason
    );
    event WriterAdded(address indexed writer);
    event WriterRemoved(address indexed writer);

    error NotWriter();
    error InvalidDelta();

    modifier onlyWriter() {
        if (!writers[msg.sender]) revert NotWriter();
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {}

    function addWriter(address writer) external onlyOwner {
        writers[writer] = true;
        emit WriterAdded(writer);
    }

    function removeWriter(address writer) external onlyOwner {
        writers[writer] = false;
        emit WriterRemoved(writer);
    }

    /**
     * Apply a reputation delta (positive = reward, negative = punishment).
     * Records an immutable entry in the history.
     */
    function applyDelta(
        address dev,
        int256 delta,
        bytes32 taskId,
        string calldata reason
    ) external onlyWriter {
        if (delta == 0) revert InvalidDelta();

        _scores[dev] += delta;

        _history[dev].push(ReputationEntry({
            delta: delta,
            reason: reason,
            taskId: taskId,
            timestamp: block.timestamp
        }));

        emit ReputationUpdated(dev, delta, _scores[dev], taskId, reason);
    }

    /**
     * Returns the effective score (floor at 0).
     */
    function getScore(address dev) external view returns (uint256) {
        int256 raw = _scores[dev];
        return raw > 0 ? uint256(raw) : 0;
    }

    /**
     * Returns the raw score (can be negative internally).
     */
    function getRawScore(address dev) external view returns (int256) {
        return _scores[dev];
    }

    /**
     * Returns the full reputation history for a developer.
     */
    function getHistory(address dev) external view returns (ReputationEntry[] memory) {
        return _history[dev];
    }

    /**
     * Returns the number of history entries for a developer.
     */
    function getHistoryLength(address dev) external view returns (uint256) {
        return _history[dev].length;
    }

    /**
     * Resolve reputation level from score.
     * 0–99 → Unranked, 100–499 → Junior, 500–1999 → Senior, 2000+ → Expert
     */
    function getLevel(address dev) external view returns (string memory) {
        uint256 score = this.getScore(dev);
        if (score >= 2000) return "Expert";
        if (score >= 500) return "Senior";
        if (score >= 100) return "Junior";
        return "Unranked";
    }
}
