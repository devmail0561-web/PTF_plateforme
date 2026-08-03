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

    // ── Content-Addressed Metadata ────────────────────────────────────────────
    // Stores keccak256 of immutable task/project metadata JSON (sorted keys).
    // Content lives off-chain (PTF nodes + Arweave); this is the cryptographic anchor.
    // Any client can verify integrity: keccak256(content) == taskMetadataHash[taskId].
    mapping(bytes32 => bytes32) public taskMetadataHash;
    mapping(bytes32 => bytes32) public projectMetadataHash;

    // Arweave permanent archive IDs — set when task reaches "validated" or project "archived".
    // ar://txId — content accessible at https://arweave.net/<txId> forever.
    mapping(bytes32 => string)  public taskArchiveId;
    mapping(bytes32 => string)  public projectArchiveId;
    mapping(bytes32 => bool)    private _taskArchived;
    mapping(bytes32 => bool)    private _projectArchived;

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
    event TaskMetadataRegistered(bytes32 indexed taskId, bytes32 hash);
    event ProjectMetadataRegistered(bytes32 indexed projectId, bytes32 hash);
    event TaskArchived(bytes32 indexed taskId, string arweaveId);
    event ProjectArchived(bytes32 indexed projectId, string arweaveId);

    error ProjectNotFound();
    error ProjectAlreadyExists();
    error ProjectLocked_();
    error TaskAlreadyClaimed();
    error NotRegistrar();
    error NotProjectOwner();
    error MetadataAlreadyRegistered();
    error AlreadyArchived();
    error HashMismatch();
    error EmptyArweaveId();

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

    // ── Content-Addressed Metadata ────────────────────────────────────────────

    /**
     * Register the keccak256 hash of a task's immutable metadata.
     * Called by PTF backend at bulkCreate / ptf tasks publish.
     * The hash covers all fields that must not change after publication
     * (title, context, constraints, punishments, scoring, etc.) but NOT
     * mutable fields (status, claimedAt, devAddress).
     */
    function registerTaskMetadata(bytes32 taskId, bytes32 hash)
        external
        onlyRegistrar
    {
        if (taskMetadataHash[taskId] != bytes32(0)) revert MetadataAlreadyRegistered();
        taskMetadataHash[taskId] = hash;
        emit TaskMetadataRegistered(taskId, hash);
    }

    /**
     * Register the keccak256 hash of a project's immutable metadata.
     * Called at project creation (ptf init).
     */
    function registerProjectMetadata(bytes32 projectId, bytes32 hash)
        external
        onlyRegistrar
    {
        if (projectMetadataHash[projectId] != bytes32(0)) revert MetadataAlreadyRegistered();
        projectMetadataHash[projectId] = hash;
        emit ProjectMetadataRegistered(projectId, hash);
    }

    /**
     * Anchor an Arweave archive ID for a validated task.
     * Called by any PTF node after pushing content to Arweave.
     * The caller provides the expected hash — the contract verifies it matches
     * the registered hash. Content never touches the contract (gas-efficient).
     *
     * First valid call wins; subsequent calls revert with AlreadyArchived.
     * This allows any node to archive without relying on PTF Corp.
     */
    function setTaskArchiveId(
        bytes32 taskId,
        string  calldata arweaveId,
        bytes32 contentHash     // keccak256(content) computed off-chain by caller
    ) external {
        if (_taskArchived[taskId])                  revert AlreadyArchived();
        if (bytes(arweaveId).length == 0)           revert EmptyArweaveId();
        if (taskMetadataHash[taskId] == bytes32(0)) revert MetadataAlreadyRegistered(); // not registered
        if (contentHash != taskMetadataHash[taskId]) revert HashMismatch();

        taskArchiveId[taskId]  = arweaveId;
        _taskArchived[taskId]  = true;
        emit TaskArchived(taskId, arweaveId);
    }

    /**
     * Same as setTaskArchiveId but for projects (status "archived").
     */
    function setProjectArchiveId(
        bytes32 projectId,
        string  calldata arweaveId,
        bytes32 contentHash
    ) external {
        if (_projectArchived[projectId])                  revert AlreadyArchived();
        if (bytes(arweaveId).length == 0)                 revert EmptyArweaveId();
        if (projectMetadataHash[projectId] == bytes32(0)) revert MetadataAlreadyRegistered();
        if (contentHash != projectMetadataHash[projectId]) revert HashMismatch();

        projectArchiveId[projectId]  = arweaveId;
        _projectArchived[projectId]  = true;
        emit ProjectArchived(projectId, arweaveId);
    }

    /**
     * Pure view — any client can verify off-chain content without gas.
     * Returns true if keccak256(content) matches the registered hash.
     */
    function verifyTaskMetadata(bytes32 taskId, bytes32 contentHash)
        external
        view
        returns (bool)
    {
        bytes32 registered = taskMetadataHash[taskId];
        return registered != bytes32(0) && contentHash == registered;
    }

    function verifyProjectMetadata(bytes32 projectId, bytes32 contentHash)
        external
        view
        returns (bool)
    {
        bytes32 registered = projectMetadataHash[projectId];
        return registered != bytes32(0) && contentHash == registered;
    }
}
