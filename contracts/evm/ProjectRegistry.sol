// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * PTF Project Registry — cryptographic anchor for each project.
 * Stores the project Merkle root, chain reference, and task immutability enforcement.
 *
 * Invariant: once a task is claimed (status != open), the Merkle root cannot be updated
 * for that project. This ensures developers work on stable, unmodified conditions.
 */
contract ProjectRegistry is Ownable, ReentrancyGuard {

    enum ProjectType { Public, Private }
    enum RewardMode { Free, Paid }

    struct Project {
        bytes32 projectId;       // keccak256(ownerAddress + projectName + timestamp)
        address owner;
        ProjectType projectType;
        RewardMode rewardMode;
        bytes32 merkleRoot;      // root of task tree — updated on publish, locked on any claim
        uint256 createdAt;
        bool locked;             // true once at least one task is claimed
        bool active;
    }

    // projectId → Project
    mapping(bytes32 => Project) private _projects;

    // projectId → taskId → bool (task is claimed/submitted/validated)
    mapping(bytes32 => mapping(bytes32 => bool)) private _claimedTasks;

    // Addresses authorized to register projects (PTF backend)
    mapping(address => bool) public registrars;

    event ProjectRegistered(
        bytes32 indexed projectId,
        address indexed owner,
        ProjectType projectType,
        RewardMode rewardMode
    );
    event MerkleRootUpdated(bytes32 indexed projectId, bytes32 merkleRoot);
    event TaskClaimed(bytes32 indexed projectId, bytes32 indexed taskId);
    event ProjectLocked(bytes32 indexed projectId);
    event ProjectDeactivated(bytes32 indexed projectId);

    error ProjectNotFound();
    error ProjectAlreadyExists();
    error ProjectLocked_();
    error TaskAlreadyClaimed();
    error NotRegistrar();
    error NotProjectOwner();

    modifier onlyRegistrar() {
        if (!registrars[msg.sender]) revert NotRegistrar();
        _;
    }

    modifier projectExists(bytes32 projectId) {
        if (!_projects[projectId].active) revert ProjectNotFound();
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {}

    function addRegistrar(address registrar) external onlyOwner {
        registrars[registrar] = true;
    }

    function removeRegistrar(address registrar) external onlyOwner {
        registrars[registrar] = false;
    }

    /**
     * Register a new project. Called by PTF backend on `ptf init`.
     */
    function registerProject(
        bytes32 projectId,
        address projectOwner,
        ProjectType projectType,
        RewardMode rewardMode
    ) external onlyRegistrar nonReentrant {
        if (_projects[projectId].active) revert ProjectAlreadyExists();

        _projects[projectId] = Project({
            projectId: projectId,
            owner: projectOwner,
            projectType: projectType,
            rewardMode: rewardMode,
            merkleRoot: bytes32(0),
            createdAt: block.timestamp,
            locked: false,
            active: true
        });

        emit ProjectRegistered(projectId, projectOwner, projectType, rewardMode);
    }

    /**
     * Update Merkle root of task tree. Only allowed before any task is claimed.
     * Called by PTF backend on `ptf tasks publish`.
     */
    function updateMerkleRoot(bytes32 projectId, bytes32 newRoot)
        external
        onlyRegistrar
        projectExists(projectId)
    {
        Project storage p = _projects[projectId];
        if (p.locked) revert ProjectLocked_();

        p.merkleRoot = newRoot;
        emit MerkleRootUpdated(projectId, newRoot);
    }

    /**
     * Mark a task as claimed — locks the Merkle root.
     * Called atomically from EscrowVault or backend registrar.
     */
    function markTaskClaimed(bytes32 projectId, bytes32 taskId)
        external
        onlyRegistrar
        projectExists(projectId)
        nonReentrant
    {
        if (_claimedTasks[projectId][taskId]) revert TaskAlreadyClaimed();

        _claimedTasks[projectId][taskId] = true;

        Project storage p = _projects[projectId];
        if (!p.locked) {
            p.locked = true;
            emit ProjectLocked(projectId);
        }

        emit TaskClaimed(projectId, taskId);
    }

    /**
     * Verify a task belongs to the project via Merkle proof.
     */
    function verifyTask(
        bytes32 projectId,
        bytes32 taskId,
        bytes32[] calldata proof
    ) external view projectExists(projectId) returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(taskId));
        return _verifyMerkle(_projects[projectId].merkleRoot, leaf, proof);
    }

    function _verifyMerkle(
        bytes32 root,
        bytes32 leaf,
        bytes32[] calldata proof
    ) internal pure returns (bool) {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 sibling = proof[i];
            if (computed <= sibling) {
                computed = keccak256(abi.encodePacked(computed, sibling));
            } else {
                computed = keccak256(abi.encodePacked(sibling, computed));
            }
        }
        return computed == root;
    }

    function getProject(bytes32 projectId)
        external
        view
        projectExists(projectId)
        returns (Project memory)
    {
        return _projects[projectId];
    }

    function isTaskClaimed(bytes32 projectId, bytes32 taskId) external view returns (bool) {
        return _claimedTasks[projectId][taskId];
    }

    function deactivate(bytes32 projectId) external onlyOwner projectExists(projectId) {
        _projects[projectId].active = false;
        emit ProjectDeactivated(projectId);
    }
}
