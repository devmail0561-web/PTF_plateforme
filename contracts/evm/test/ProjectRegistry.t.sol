// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../ProjectRegistry.sol";

contract ProjectRegistryTest is Test {
    ProjectRegistry reg;
    address owner = address(this);
    address registrar = makeAddr("registrar");
    address projectOwner = makeAddr("projectOwner");
    address other = makeAddr("other");

    bytes32 constant PID = keccak256("project-001");
    bytes32 constant TID = keccak256("task-001");

    function setUp() public {
        reg = new ProjectRegistry(owner);
        reg.addRegistrar(registrar);
    }

    // ── Registration ─────────────────────────────────────────────────────────

    function test_registerProject() public {
        vm.prank(registrar);
        reg.registerProject(
            PID,
            projectOwner,
            ProjectRegistry.ProjectType.Public,
            ProjectRegistry.RewardMode.Paid
        );

        ProjectRegistry.Project memory p = reg.getProject(PID);
        assertEq(p.owner, projectOwner);
        assertFalse(p.locked);
        assertTrue(p.active);
    }

    function test_registerProjectDuplicate_reverts() public {
        vm.prank(registrar);
        reg.registerProject(PID, projectOwner, ProjectRegistry.ProjectType.Public, ProjectRegistry.RewardMode.Free);

        vm.expectRevert(ProjectRegistry.ProjectAlreadyExists.selector);
        vm.prank(registrar);
        reg.registerProject(PID, projectOwner, ProjectRegistry.ProjectType.Public, ProjectRegistry.RewardMode.Free);
    }

    function test_nonRegistrar_reverts() public {
        vm.expectRevert(ProjectRegistry.NotRegistrar.selector);
        vm.prank(other);
        reg.registerProject(PID, projectOwner, ProjectRegistry.ProjectType.Public, ProjectRegistry.RewardMode.Free);
    }

    // ── Merkle root ───────────────────────────────────────────────────────────

    function test_updateMerkleRoot() public {
        vm.prank(registrar);
        reg.registerProject(PID, projectOwner, ProjectRegistry.ProjectType.Public, ProjectRegistry.RewardMode.Free);

        bytes32 root = keccak256("root-v1");
        vm.prank(registrar);
        reg.updateMerkleRoot(PID, root);

        assertEq(reg.getProject(PID).merkleRoot, root);
    }

    function test_updateMerkleRoot_afterClaim_reverts() public {
        vm.prank(registrar);
        reg.registerProject(PID, projectOwner, ProjectRegistry.ProjectType.Public, ProjectRegistry.RewardMode.Paid);

        vm.prank(registrar);
        reg.markTaskClaimed(PID, TID);

        bytes32 root = keccak256("root-v2");
        vm.expectRevert(ProjectRegistry.ProjectLocked_.selector);
        vm.prank(registrar);
        reg.updateMerkleRoot(PID, root);
    }

    // ── Task claim → lock ─────────────────────────────────────────────────────

    function test_markTaskClaimed_locks_project() public {
        vm.prank(registrar);
        reg.registerProject(PID, projectOwner, ProjectRegistry.ProjectType.Public, ProjectRegistry.RewardMode.Paid);

        assertFalse(reg.getProject(PID).locked);

        vm.prank(registrar);
        reg.markTaskClaimed(PID, TID);

        assertTrue(reg.getProject(PID).locked);
        assertTrue(reg.isTaskClaimed(PID, TID));
    }

    function test_markTaskClaimed_twice_reverts() public {
        vm.prank(registrar);
        reg.registerProject(PID, projectOwner, ProjectRegistry.ProjectType.Public, ProjectRegistry.RewardMode.Paid);

        vm.prank(registrar);
        reg.markTaskClaimed(PID, TID);

        vm.expectRevert(ProjectRegistry.TaskAlreadyClaimed.selector);
        vm.prank(registrar);
        reg.markTaskClaimed(PID, TID);
    }

    // ── Merkle proof verification ─────────────────────────────────────────────

    function test_verifyTask_singleLeaf() public {
        vm.prank(registrar);
        reg.registerProject(PID, projectOwner, ProjectRegistry.ProjectType.Public, ProjectRegistry.RewardMode.Free);

        bytes32 taskId = keccak256("task-solo");
        bytes32 leaf = keccak256(abi.encodePacked(taskId));
        // Single leaf: root == leaf
        vm.prank(registrar);
        reg.updateMerkleRoot(PID, leaf);

        bytes32[] memory proof = new bytes32[](0);
        assertTrue(reg.verifyTask(PID, taskId, proof));
    }

    function test_projectNotFound_reverts() public {
        vm.expectRevert(ProjectRegistry.ProjectNotFound.selector);
        reg.getProject(keccak256("nonexistent"));
    }

    function test_deactivate() public {
        vm.prank(registrar);
        reg.registerProject(PID, projectOwner, ProjectRegistry.ProjectType.Public, ProjectRegistry.RewardMode.Free);

        reg.deactivate(PID);

        vm.expectRevert(ProjectRegistry.ProjectNotFound.selector);
        reg.getProject(PID);
    }
}
