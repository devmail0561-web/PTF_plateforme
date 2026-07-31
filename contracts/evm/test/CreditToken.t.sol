// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../CreditToken.sol";

contract CreditTokenTest is Test {
    CreditToken token;
    address owner = address(this);
    address minter = makeAddr("minter");
    address dev = makeAddr("dev");
    address other = makeAddr("other");

    function setUp() public {
        token = new CreditToken(owner);
        token.addMinter(minter);
    }

    // ── Decimals ──────────────────────────────────────────────────────────────

    function test_decimals() public view {
        assertEq(token.decimals(), 6);
    }

    // ── Minting ───────────────────────────────────────────────────────────────

    function test_mintByMinter() public {
        vm.prank(minter);
        token.mint(dev, 100e6);
        assertEq(token.balanceOf(dev), 100e6);
    }

    function test_mintByNonMinterReverts() public {
        vm.expectRevert(CreditToken.NotMinter.selector);
        vm.prank(other);
        token.mint(dev, 100e6);
    }

    // ── Burning ───────────────────────────────────────────────────────────────

    function test_burnByMinter() public {
        vm.prank(minter);
        token.mint(dev, 50e6);

        vm.prank(minter);
        token.burn(dev, 30e6);

        assertEq(token.balanceOf(dev), 20e6);
    }

    function test_burnByNonMinterReverts() public {
        vm.prank(minter);
        token.mint(dev, 50e6);

        vm.expectRevert(CreditToken.NotMinter.selector);
        vm.prank(other);
        token.burn(dev, 10e6);
    }

    // ── Claim with signature (EIP-712) ────────────────────────────────────────

    function _signClaim(
        uint256 signerPk,
        address to,
        uint256 amount,
        bytes32 taskId,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(token.CREDIT_CLAIM_TYPEHASH(), to, amount, taskId, nonce, deadline)
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", token.domainSeparator(), structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_claimWithValidSignature() public {
        uint256 ownerPk = 0xA11CE;
        address ownerAddr = vm.addr(ownerPk);

        // Transfer ownership to test key
        token.transferOwnership(ownerAddr);

        bytes32 taskId = keccak256("task-001");
        uint256 amount = 150e6;
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory sig = _signClaim(ownerPk, dev, amount, taskId, 0, deadline);

        vm.prank(dev);
        token.claimWithSignature(dev, amount, taskId, deadline, sig);

        assertEq(token.balanceOf(dev), amount);
        assertEq(token.creditNonces(dev, taskId), 1);
    }

    function test_claimReplay_reverts() public {
        uint256 ownerPk = 0xA11CE;
        address ownerAddr = vm.addr(ownerPk);
        token.transferOwnership(ownerAddr);

        bytes32 taskId = keccak256("task-001");
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory sig = _signClaim(ownerPk, dev, 150e6, taskId, 0, deadline);
        token.claimWithSignature(dev, 150e6, taskId, deadline, sig);

        // Second claim with same sig — must revert
        vm.expectRevert(CreditToken.NonceAlreadyUsed.selector);
        token.claimWithSignature(dev, 150e6, taskId, deadline, sig);
    }

    function test_claimExpired_reverts() public {
        uint256 ownerPk = 0xA11CE;
        token.transferOwnership(vm.addr(ownerPk));

        bytes32 taskId = keccak256("task-002");
        uint256 deadline = block.timestamp - 1;

        bytes memory sig = _signClaim(ownerPk, dev, 100e6, taskId, 0, deadline);

        vm.expectRevert(CreditToken.DeadlineExpired.selector);
        token.claimWithSignature(dev, 100e6, taskId, deadline, sig);
    }

    function test_claimInvalidSigner_reverts() public {
        uint256 badPk = 0xBAD;
        // owner remains address(this), not vm.addr(0xBAD)

        bytes32 taskId = keccak256("task-003");
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory sig = _signClaim(badPk, dev, 100e6, taskId, 0, deadline);

        vm.expectRevert(CreditToken.InvalidSignature.selector);
        token.claimWithSignature(dev, 100e6, taskId, deadline, sig);
    }

    // ── Minter management ────────────────────────────────────────────────────

    function test_removeMinter() public {
        token.removeMinter(minter);
        vm.expectRevert(CreditToken.NotMinter.selector);
        vm.prank(minter);
        token.mint(dev, 1e6);
    }

    function test_fuzz_mintAndBurn(uint96 mintAmt, uint96 burnAmt) public {
        vm.assume(mintAmt > 0);
        vm.assume(burnAmt <= mintAmt);

        vm.prank(minter);
        token.mint(dev, mintAmt);
        assertEq(token.balanceOf(dev), mintAmt);

        vm.prank(minter);
        token.burn(dev, burnAmt);
        assertEq(token.balanceOf(dev), mintAmt - burnAmt);
    }
}
