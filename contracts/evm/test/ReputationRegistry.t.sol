// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../ReputationRegistry.sol";

contract ReputationRegistryTest is Test {
    ReputationRegistry reg;
    address owner = address(this);
    address writer = makeAddr("writer");
    address dev = makeAddr("dev");
    address other = makeAddr("other");

    function setUp() public {
        reg = new ReputationRegistry(owner);
        reg.addWriter(writer);
    }

    function test_initialScore_zero() public view {
        assertEq(reg.getScore(dev), 0);
    }

    function test_applyPositiveDelta() public {
        vm.prank(writer);
        reg.applyDelta(dev, 100, keccak256("task-1"), "task_validated");
        assertEq(reg.getScore(dev), 100);
    }

    function test_applyNegativeDelta() public {
        vm.prank(writer);
        reg.applyDelta(dev, 200, keccak256("task-1"), "task_validated");

        vm.prank(writer);
        reg.applyDelta(dev, -50, keccak256("task-2"), "punishment:lateDelivery");

        assertEq(reg.getScore(dev), 150);
    }

    function test_scoreFloorAtZero() public {
        // Score never goes negative from getScore()
        vm.prank(writer);
        reg.applyDelta(dev, -500, keccak256("task-x"), "punishment:maliciousCode");

        assertEq(reg.getScore(dev), 0);
        assertEq(reg.getRawScore(dev), -500);
    }

    function test_zeroDeltaReverts() public {
        vm.expectRevert(ReputationRegistry.InvalidDelta.selector);
        vm.prank(writer);
        reg.applyDelta(dev, 0, keccak256("task-1"), "noop");
    }

    function test_nonWriterReverts() public {
        vm.expectRevert(ReputationRegistry.NotWriter.selector);
        vm.prank(other);
        reg.applyDelta(dev, 100, keccak256("task-1"), "hack");
    }

    function test_historyRecorded() public {
        bytes32 t1 = keccak256("task-1");
        bytes32 t2 = keccak256("task-2");

        vm.prank(writer);
        reg.applyDelta(dev, 100, t1, "task_validated");
        vm.prank(writer);
        reg.applyDelta(dev, -10, t2, "punishment:lateDelivery");

        assertEq(reg.getHistoryLength(dev), 2);

        ReputationRegistry.ReputationEntry[] memory history = reg.getHistory(dev);
        assertEq(history[0].delta, 100);
        assertEq(history[1].delta, -10);
        assertEq(history[0].taskId, t1);
        assertEq(history[1].reason, "punishment:lateDelivery");
    }

    // ── Level thresholds (canonical: Unranked/Junior/Senior/Expert) ───────────

    function test_level_unranked() public view {
        assertEq(reg.getLevel(dev), "Unranked"); // score = 0
    }

    function test_level_junior() public {
        vm.prank(writer);
        reg.applyDelta(dev, 100, keccak256("t"), "task_validated");
        assertEq(reg.getLevel(dev), "Junior");
    }

    function test_level_junior_boundary() public {
        vm.prank(writer);
        reg.applyDelta(dev, 499, keccak256("t"), "task_validated");
        assertEq(reg.getLevel(dev), "Junior");
    }

    function test_level_senior() public {
        vm.prank(writer);
        reg.applyDelta(dev, 500, keccak256("t"), "task_validated");
        assertEq(reg.getLevel(dev), "Senior");
    }

    function test_level_expert() public {
        vm.prank(writer);
        reg.applyDelta(dev, 2000, keccak256("t"), "task_validated");
        assertEq(reg.getLevel(dev), "Expert");
    }

    function test_removeWriter() public {
        reg.removeWriter(writer);
        vm.expectRevert(ReputationRegistry.NotWriter.selector);
        vm.prank(writer);
        reg.applyDelta(dev, 10, keccak256("t"), "test");
    }

    function test_fuzz_scoreCumulative(int64 d1, int64 d2) public {
        vm.assume(d1 != 0);
        vm.assume(d2 != 0);

        vm.prank(writer);
        reg.applyDelta(dev, d1, keccak256("t1"), "r1");
        vm.prank(writer);
        reg.applyDelta(dev, d2, keccak256("t2"), "r2");

        int256 expected = int256(d1) + int256(d2);
        assertEq(reg.getRawScore(dev), expected);
    }
}
