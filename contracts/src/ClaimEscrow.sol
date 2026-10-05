// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ClaimEscrow - RemitLink
/// @notice Escrows a stablecoin deposit behind a shareable claim link.
///
/// @dev Secret-handling choice (AGENT.md spec 5.1 requires choosing + documenting):
///
///      1. The sender generates a random `secret` OFF-CHAIN and stores only
///         `keccak256(secret)` on-chain via `createClaim`. The secret travels in
///         the URL FRAGMENT (`#`), which browsers never send to a server, so it is
///         never in a server log or query string.
///      2. The recipient first calls `commitRecipient`, fixing the payout address.
///         Commitment is FINAL and first-come-first-served.
///      3. The recipient then calls `claim` with the secret. The contract checks
///         `keccak256(secret) == claimHash` and pays ONLY the committed address.
///
///      Why commit first: the secret appears in calldata at reveal time, so a
///      mempool watcher can copy it. Because the payout address is already locked
///      before reveal, a copied secret is worthless - it can only ever pay the
///      committed recipient. This is why a signature-only design was rejected:
///      with no off-chain secret the "authorization" is publicly computable, so
///      anyone could sign and claim their own funds (caught by a failing test -
///      see the 2026-10-04 decision-log entry).
///
///      Known limitation (documented, not hidden): because commitment is final,
///      an address that commits BEFORE the recipient locks the claim until expiry,
///      at which point `refund` returns the funds to the sender. Griefing, not
///      theft, bounded by the expiry window.
contract ClaimEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Claim {
        address sender;
        IERC20 token;
        uint256 amount;
        bytes32 claimHash;
        uint256 expiry;
        address recipient;
        bool settled;
    }

    mapping(uint256 => Claim) public claims;
    uint256 public nextClaimId;

    error ZeroAmount();
    error ZeroAddress();
    error ExpiryNotInFuture();
    error ClaimNotFound();
    error ClaimExpired();
    error ClaimSettled();
    error RefundTooEarly();
    error RecipientNotCommitted();
    error RecipientMismatch();
    error WrongSecret();

    event ClaimCreated(
        uint256 indexed claimId,
        address indexed sender,
        IERC20 indexed token,
        uint256 amount,
        bytes32 claimHash,
        uint256 expiry
    );
    event RecipientCommitted(uint256 indexed claimId, address indexed recipient);
    event ClaimClaimed(uint256 indexed claimId, address indexed recipient, uint256 amount);
    event ClaimRefunded(uint256 indexed claimId, address indexed sender, uint256 amount);

    /// @notice Escrow `amount` of `token`, redeemable by whoever presents the
    ///         secret whose keccak256 equals `claimHash`.
    function createClaim(IERC20 token, uint256 amount, bytes32 claimHash, uint256 expiry)
        external
        nonReentrant
        returns (uint256 claimId)
    {
        if (address(token) == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (claimHash == bytes32(0)) revert ZeroAddress();
        if (expiry <= block.timestamp) revert ExpiryNotInFuture();

        claimId = nextClaimId++;
        claims[claimId] = Claim({
            sender: msg.sender,
            token: token,
            amount: amount,
            claimHash: claimHash,
            expiry: expiry,
            recipient: address(0),
            settled: false
        });

        token.safeTransferFrom(msg.sender, address(this), amount);
        emit ClaimCreated(claimId, msg.sender, token, amount, claimHash, expiry);
    }

    /// @notice Fix the payout address for a claim. Final, first-come-first-served.
    function commitRecipient(uint256 claimId, address recipient) external {
        Claim storage c = claims[claimId];
        if (c.sender == address(0)) revert ClaimNotFound();
        if (c.settled) revert ClaimSettled();
        if (block.timestamp > c.expiry) revert ClaimExpired();
        if (recipient == address(0)) revert ZeroAddress();
        if (c.recipient != address(0)) revert ClaimSettled();

        c.recipient = recipient;
        emit RecipientCommitted(claimId, recipient);
    }

    /// @notice Redeem the claim. Pays the committed recipient only.
    /// @param secret the preimage of the stored claimHash
    function claim(uint256 claimId, uint256 secret, address recipient) external nonReentrant {
        Claim storage c = claims[claimId];
        if (c.sender == address(0)) revert ClaimNotFound();
        if (c.settled) revert ClaimSettled();
        if (block.timestamp > c.expiry) revert ClaimExpired();
        if (c.recipient == address(0)) revert RecipientNotCommitted();
        if (recipient != c.recipient) revert RecipientMismatch();
        if (keccak256(abi.encodePacked(secret)) != c.claimHash) revert WrongSecret();

        c.settled = true;
        c.token.safeTransfer(recipient, c.amount);
        emit ClaimClaimed(claimId, recipient, c.amount);
    }

    /// @notice Sender reclaims funds after expiry if unclaimed.
    function refund(uint256 claimId) external nonReentrant {
        Claim storage c = claims[claimId];
        if (c.sender == address(0)) revert ClaimNotFound();
        if (c.settled) revert ClaimSettled();
        if (block.timestamp <= c.expiry) revert RefundTooEarly();

        c.settled = true;
        c.token.safeTransfer(c.sender, c.amount);
        emit ClaimRefunded(claimId, c.sender, c.amount);
    }
}