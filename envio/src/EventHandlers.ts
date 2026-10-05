import {
  ClaimEscrow,
  ClaimClaimed,
  ClaimCreated,
  ClaimRefunded,
  RecipientCommitted,
} from "generated";

/**
 * RemitLink activity indexer.
 *
 * Rebuilds the "Activity" screen from on-chain events instead of reading logs
 * from the app (AGENT.md section 7 item 4). One Claim entity per claimId,
 * advanced through created -> committed -> claimed/refunded.
 *
 * Idempotency: every write uses context.Claim.get first and merges, so a
 * re-org or a re-run cannot corrupt an existing row.
 */

ClaimEscrow.ClaimCreated.handler(async ({ event, context }) => {
  const claimId = event.params.claimId.toString();

  // Ignore replayed logs on a chain re-org: never overwrite a settled claim.
  const existing = await context.Claim.get(claimId);
  if (existing) return;

  context.Claim.set({
    id: claimId,
    sender: event.params.sender,
    token: event.params.token,
    amount: event.params.amount,
    claimHash: event.params.claimHash,
    expiry: event.params.expiry,
    status: "created",
    recipient: null,
    createdAtBlock: BigInt(event.block.number ?? 0),
    createdAtTimestamp: BigInt(event.block.timestamp ?? 0),
    settledAtBlock: null,
    settledAtTimestamp: null,
    txHash: event.transaction.hash ?? "",
  });
});

ClaimEscrow.RecipientCommitted.handler(async ({ event, context }) => {
  const claimId = event.params.claimId.toString();
  const existing = await context.Claim.get(claimId);
  if (!existing || existing.status === "claimed" || existing.status === "refunded") {
    return;
  }
  context.Claim.set({
    ...existing,
    recipient: event.params.recipient,
    status: "committed",
  });
});

ClaimEscrow.ClaimClaimed.handler(async ({ event, context }) => {
  const claimId = event.params.claimId.toString();
  const existing = await context.Claim.get(claimId);
  if (!existing) return; // funded without a tracked creation; nothing to update
  if (existing.status === "claimed" || existing.status === "refunded") return;

  context.Claim.set({
    ...existing,
    recipient: event.params.recipient,
    amount: event.params.amount,
    status: "claimed",
    settledAtBlock: BigInt(event.block.number ?? 0),
    settledAtTimestamp: BigInt(event.block.timestamp ?? 0),
  });
});

ClaimEscrow.ClaimRefunded.handler(async ({ event, context }) => {
  const claimId = event.params.claimId.toString();
  const existing = await context.Claim.get(claimId);
  if (!existing) return;
  if (existing.status === "claimed" || existing.status === "refunded") return;

  context.Claim.set({
    ...existing,
    amount: event.params.amount,
    status: "refunded",
    settledAtBlock: BigInt(event.block.number ?? 0),
    settledAtTimestamp: BigInt(event.block.timestamp ?? 0),
  });
});