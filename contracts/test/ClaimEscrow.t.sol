// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ClaimEscrow} from "../src/ClaimEscrow.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ClaimEscrowTest is Test {
    ClaimEscrow escrow;
    MockERC20 usdc;

    address sender = makeAddr("sender");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address attacker = makeAddr("attacker");

    uint256 constant SECRET = 0xC0FFEE;
    uint256 constant OTHER_SECRET = 0xBADF00D;
    bytes32 constant SECRET_HASH = keccak256(abi.encodePacked(uint256(0xC0FFEE)));

    uint256 constant CLAIM_AMOUNT = 100e6; // 100 USDC (6 decimals)
    uint256 constant EXPIRY_WINDOW = 7 days;

    function setUp() public {
        escrow = new ClaimEscrow();
        usdc = new MockERC20("USD Coin", "USDC", 6);

        usdc.mint(sender, 1_000e6);
        vm.startPrank(sender);
        usdc.approve(address(escrow), type(uint256).max);
        vm.stopPrank();
    }

    // ---------- helpers ----------

    function _create(bytes32 hash, uint256 amount, uint256 expiry) internal returns (uint256 claimId) {
        vm.prank(sender);
        claimId = escrow.createClaim(IERC20(address(usdc)), amount, hash, expiry);
    }

    function _createDefault() internal returns (uint256 claimId) {
        claimId = _create(SECRET_HASH, CLAIM_AMOUNT, block.timestamp + EXPIRY_WINDOW);
    }

    function _happyClaim(uint256 claimId, address recipient) internal {
        vm.prank(recipient);
        escrow.commitRecipient(claimId, recipient);
        escrow.claim(claimId, SECRET, recipient);
    }

    // ---------- 1. happy path ----------

    function test_HappyPath_SenderCreates_RecipientCommitsAndClaims() public {
        uint256 claimId = _createDefault();

        assertEq(usdc.balanceOf(address(escrow)), CLAIM_AMOUNT, "escrow holds the deposit");
        assertEq(usdc.balanceOf(alice), 0, "recipient starts empty");

        vm.expectEmit(true, true, false, true);
        emit ClaimEscrow.RecipientCommitted(claimId, alice);
        vm.prank(alice);
        escrow.commitRecipient(claimId, alice);

        vm.expectEmit(true, true, false, true);
        emit ClaimEscrow.ClaimClaimed(claimId, alice, CLAIM_AMOUNT);
        escrow.claim(claimId, SECRET, alice);

        assertEq(usdc.balanceOf(alice), CLAIM_AMOUNT, "recipient paid");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow drained");

        (, , , , , address recipient, bool settled) = escrow.claims(claimId);
        assertEq(recipient, alice, "recipient recorded");
        assertTrue(settled, "claim settled");
    }

    // ---------- 2. double claim ----------

    function test_RevertWhen_DoubleClaim() public {
        uint256 claimId = _createDefault();
        _happyClaim(claimId, alice);

        vm.expectRevert(ClaimEscrow.ClaimSettled.selector);
        escrow.claim(claimId, SECRET, alice);
    }

    function test_RevertWhen_CommitRecipientTwice() public {
        uint256 claimId = _createDefault();

        vm.prank(alice);
        escrow.commitRecipient(claimId, alice);

        // commitment is final
        vm.prank(bob);
        vm.expectRevert(ClaimEscrow.ClaimSettled.selector);
        escrow.commitRecipient(claimId, bob);
    }

    // ---------- 3. wrong secret ----------

    function test_RevertWhen_WrongSecret() public {
        uint256 claimId = _createDefault();

        vm.prank(alice);
        escrow.commitRecipient(claimId, alice);

        vm.expectRevert(ClaimEscrow.WrongSecret.selector);
        escrow.claim(claimId, OTHER_SECRET, alice);

        assertEq(usdc.balanceOf(alice), 0, "no payout on wrong secret");
        assertEq(usdc.balanceOf(address(escrow)), CLAIM_AMOUNT, "funds stay escrowed");
    }

    function test_RevertWhen_NoRecipientCommitted() public {
        uint256 claimId = _createDefault();

        vm.expectRevert(ClaimEscrow.RecipientNotCommitted.selector);
        escrow.claim(claimId, SECRET, alice);
    }

    function test_RevertWhen_RecipientMismatch() public {
        uint256 claimId = _createDefault();

        vm.prank(alice);
        escrow.commitRecipient(claimId, alice);

        // bob committed nothing; payout address must match the commitment
        vm.expectRevert(ClaimEscrow.RecipientMismatch.selector);
        escrow.claim(claimId, SECRET, bob);
    }

    // ---------- 4. expiry ----------

    function test_RevertWhen_ClaimAfterExpiry() public {
        uint256 expiry = block.timestamp + EXPIRY_WINDOW;
        uint256 claimId = _create(SECRET_HASH, CLAIM_AMOUNT, expiry);

        vm.prank(alice);
        escrow.commitRecipient(claimId, alice);

        vm.warp(expiry + 1);

        vm.expectRevert(ClaimEscrow.ClaimExpired.selector);
        escrow.claim(claimId, SECRET, alice);
    }

    function test_RevertWhen_CommitAfterExpiry() public {
        uint256 expiry = block.timestamp + EXPIRY_WINDOW;
        uint256 claimId = _create(SECRET_HASH, CLAIM_AMOUNT, expiry);

        vm.warp(expiry + 1);

        vm.prank(alice);
        vm.expectRevert(ClaimEscrow.ClaimExpired.selector);
        escrow.commitRecipient(claimId, alice);
    }

    // ---------- 5. refund ----------

    function test_RefundAfterExpiry_ReturnsToSender() public {
        uint256 expiry = block.timestamp + EXPIRY_WINDOW;
        uint256 claimId = _create(SECRET_HASH, CLAIM_AMOUNT, expiry);

        uint256 senderBefore = usdc.balanceOf(sender);
        vm.warp(expiry + 1);

        vm.expectEmit(true, true, false, true);
        emit ClaimEscrow.ClaimRefunded(claimId, sender, CLAIM_AMOUNT);
        escrow.refund(claimId);

        assertEq(usdc.balanceOf(sender), senderBefore + CLAIM_AMOUNT, "sender refunded");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow drained");
    }

    function test_RevertWhen_RefundTooEarly() public {
        uint256 claimId = _createDefault();
        vm.expectRevert(ClaimEscrow.RefundTooEarly.selector);
        escrow.refund(claimId);
    }

    function test_RevertWhen_RefundAfterClaim() public {
        uint256 claimId = _createDefault();
        _happyClaim(claimId, alice);

        vm.warp(block.timestamp + EXPIRY_WINDOW + 1);
        vm.expectRevert(ClaimEscrow.ClaimSettled.selector);
        escrow.refund(claimId);
    }

    // ---------- 6. zero amount / bad params ----------

    function test_RevertWhen_ZeroAmount() public {
        vm.expectRevert(ClaimEscrow.ZeroAmount.selector);
        _create(SECRET_HASH, 0, block.timestamp + EXPIRY_WINDOW);
    }

    function test_RevertWhen_ZeroToken() public {
        vm.prank(sender);
        vm.expectRevert(ClaimEscrow.ZeroAddress.selector);
        escrow.createClaim(IERC20(address(0)), CLAIM_AMOUNT, SECRET_HASH, block.timestamp + EXPIRY_WINDOW);
    }

    function test_RevertWhen_ZeroClaimHash() public {
        vm.prank(sender);
        vm.expectRevert(ClaimEscrow.ZeroAddress.selector);
        escrow.createClaim(IERC20(address(usdc)), CLAIM_AMOUNT, bytes32(0), block.timestamp + EXPIRY_WINDOW);
    }

    function test_RevertWhen_ExpiryInPast() public {
        vm.expectRevert(ClaimEscrow.ExpiryNotInFuture.selector);
        _create(SECRET_HASH, CLAIM_AMOUNT, block.timestamp - 1);
    }

    function test_RevertWhen_ZeroRecipientCommit() public {
        uint256 claimId = _createDefault();

        vm.expectRevert(ClaimEscrow.ZeroAddress.selector);
        escrow.commitRecipient(claimId, address(0));
    }

    // ---------- 7. front-running / recipient binding ----------

    /// @dev An attacker copies the secret out of the mempool at reveal time and
    ///      front-runs the claim. Because the payout address was committed BEFORE
    ///      the reveal, the stolen secret still pays alice and the attacker gets
    ///      nothing.
    function test_FrontRunning_StolenSecretStillPaysCommittedRecipient() public {
        uint256 claimId = _createDefault();

        vm.prank(alice);
        escrow.commitRecipient(claimId, alice);

        // attacker sees the secret in alice's pending claim and copies it
        vm.prank(attacker);
        vm.expectRevert(ClaimEscrow.RecipientMismatch.selector);
        escrow.claim(claimId, SECRET, attacker);

        assertEq(usdc.balanceOf(attacker), 0, "attacker got nothing");

        // alice's claim still succeeds
        escrow.claim(claimId, SECRET, alice);
        assertEq(usdc.balanceOf(alice), CLAIM_AMOUNT, "alice paid");
    }

    /// @dev The attacker front-runs the COMMIT step instead. This is the documented
    ///      griefing limitation: commitment is final, so the funds stay locked until
    ///      expiry and then refund to the sender. The attacker cannot steal them.
    function test_FrontRunning_CommitFirstGriefsClaim_ButNoTheft() public {
        uint256 expiry = block.timestamp + EXPIRY_WINDOW;
        uint256 claimId = _create(SECRET_HASH, CLAIM_AMOUNT, expiry);

        // attacker commits first, before the real recipient
        vm.prank(attacker);
        escrow.commitRecipient(claimId, attacker);

        // alice can no longer commit
        vm.prank(alice);
        vm.expectRevert(ClaimEscrow.ClaimSettled.selector);
        escrow.commitRecipient(claimId, alice);

        // but the secret still cannot be redirected: alice's claim must go to the
        // committed (attacker's) address, so neither of them can take it unilaterally
        vm.expectRevert(ClaimEscrow.RecipientMismatch.selector);
        escrow.claim(claimId, SECRET, alice);

        assertEq(usdc.balanceOf(attacker), 0, "attacker cannot claim without the secret either");

        // funds are recoverable by the sender at expiry
        vm.warp(expiry + 1);
        uint256 senderBefore = usdc.balanceOf(sender);
        escrow.refund(claimId);
        assertEq(usdc.balanceOf(sender), senderBefore + CLAIM_AMOUNT, "sender recovered");
    }

    /// @dev Documented limitation of the chosen scheme: whoever commits first and
    ///      knows the secret can claim. With a short expiry this is griefing only.
    ///      Test pins the behaviour so it cannot change silently.
    function test_KnownLimitation_FirstCommitterWithSecretWins() public {
        uint256 claimId = _createDefault();

        vm.prank(attacker);
        escrow.commitRecipient(claimId, attacker);
        escrow.claim(claimId, SECRET, attacker);

        assertEq(usdc.balanceOf(attacker), CLAIM_AMOUNT, "first committer + secret wins (documented)");
    }

    /// @dev A secret is only valid for its own claim: the same secret against a
    ///      claim created with a different hash must fail.
    function test_SecretNotValidAcrossClaims() public {
        uint256 expiry = block.timestamp + EXPIRY_WINDOW;
        uint256 claimB = _create(keccak256(abi.encodePacked(OTHER_SECRET)), CLAIM_AMOUNT, expiry);

        vm.prank(alice);
        escrow.commitRecipient(claimB, alice);

        vm.expectRevert(ClaimEscrow.WrongSecret.selector);
        escrow.claim(claimB, SECRET, alice);
    }

    // ---------- misc ----------

    function test_RevertWhen_ClaimUnknownId() public {
        vm.expectRevert(ClaimEscrow.ClaimNotFound.selector);
        escrow.claim(999, SECRET, alice);
    }

    function test_MultipleClaimsIndependent() public {
        uint256 expiry = block.timestamp + EXPIRY_WINDOW;
        uint256 a = _create(SECRET_HASH, CLAIM_AMOUNT, expiry);
        uint256 b = _create(keccak256(abi.encodePacked(OTHER_SECRET)), 50e6, expiry);

        _happyClaim(a, alice);
        vm.prank(bob);
        escrow.commitRecipient(b, bob);
        escrow.claim(b, OTHER_SECRET, bob);

        assertEq(usdc.balanceOf(alice), CLAIM_AMOUNT);
        assertEq(usdc.balanceOf(bob), 50e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    /// @dev The claim is a relayer-friendly call: a third party may submit it, but
    ///      the payout always goes to the committed recipient.
    function test_RelayerSubmitsClaim_RecipientStillPaid() public {
        uint256 claimId = _createDefault();

        vm.prank(alice);
        escrow.commitRecipient(claimId, alice);

        vm.prank(attacker); // arbitrary relayer
        escrow.claim(claimId, SECRET, alice);

        assertEq(usdc.balanceOf(alice), CLAIM_AMOUNT, "recipient paid by relayer");
        assertEq(usdc.balanceOf(attacker), 0, "relayer paid nothing");
    }
}