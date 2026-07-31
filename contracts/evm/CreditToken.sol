// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * PTF Credit Token — 1 PTF = 1 USDC (6 decimals, stable)
 * EIP-712: nonces keyed by (devAddress, taskId) to prevent replay across chains and tasks.
 */
contract CreditToken is ERC20, ERC20Permit, Ownable {
    using ECDSA for bytes32;

    uint8 private constant DECIMALS = 6;

    // keccak256("CreditClaim(address to,uint256 amount,bytes32 taskId,uint256 nonce,uint256 deadline)")
    bytes32 public constant CREDIT_CLAIM_TYPEHASH = keccak256(
        "CreditClaim(address to,uint256 amount,bytes32 taskId,uint256 nonce,uint256 deadline)"
    );

    // nonces[devAddress][taskId] — prevents replay per (address, task) pair
    mapping(address => mapping(bytes32 => uint256)) public creditNonces;

    // Addresses authorized to mint (EscrowVault)
    mapping(address => bool) public minters;

    event CreditClaimed(address indexed to, uint256 amount, bytes32 indexed taskId);
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);

    error DeadlineExpired();
    error InvalidSignature();
    error NonceAlreadyUsed();
    error NotMinter();

    modifier onlyMinter() {
        if (!minters[msg.sender]) revert NotMinter();
        _;
    }

    constructor(address initialOwner)
        ERC20("PTF Credit", "PTF")
        ERC20Permit("PTF Credit")
        Ownable(initialOwner)
    {}

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    function addMinter(address minter) external onlyOwner {
        minters[minter] = true;
        emit MinterAdded(minter);
    }

    function removeMinter(address minter) external onlyOwner {
        minters[minter] = false;
        emit MinterRemoved(minter);
    }

    /**
     * Mint credits to a developer after task validation.
     * Called by EscrowVault only.
     */
    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    /**
     * Burn credits from an address (punishments).
     * Called by EscrowVault only.
     */
    function burn(address from, uint256 amount) external onlyMinter {
        _burn(from, amount);
    }

    /**
     * Claim credits using a PTF-signed EIP-712 voucher.
     * Signature covers: to, amount, taskId, nonce, deadline, chainId (via domain separator).
     */
    function claimWithSignature(
        address to,
        uint256 amount,
        bytes32 taskId,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (block.timestamp > deadline) revert DeadlineExpired();

        uint256 nonce = creditNonces[to][taskId];
        // nonce must be 0 — each (address, taskId) can only claim once
        if (nonce != 0) revert NonceAlreadyUsed();

        bytes32 structHash = keccak256(
            abi.encode(CREDIT_CLAIM_TYPEHASH, to, amount, taskId, nonce, deadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        address signer = digest.recover(signature);
        if (signer != owner()) revert InvalidSignature();

        creditNonces[to][taskId] = 1; // mark as used
        _mint(to, amount);

        emit CreditClaimed(to, amount, taskId);
    }

    /**
     * Returns the EIP-712 domain separator for off-chain signing.
     */
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
