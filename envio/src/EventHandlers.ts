import { indexer } from "envio";

/**
 * RemitLink activity indexer.
 *
 * Rebuilds the "Activity" screen from on-chain events instead of the app
 * reading logs directly (AGENT.md section 7, item 4). One Claim entity per
 * claimId, advanced through created -> committed -> claimed/refunded.
 *
 * Registration follows the current HyperIndex docs:
 *   indexer.onEvent({ contract, event }, async ({ event, context }) => ...)
 *
 * Idempotency: every write reads the existing row first and merges, so a
 * re-org or a re-run cannot corrupt existing data. Settled claims are never
 * overwritten.
 */

indexer.onEvent(
  { contract: "ClaimEscrow", event: "ClaimCreated" },
  async ({ event, context }) => {
    const claimId = event.params.claimId.toString();
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
      recipient: undefined,
      createdAtBlock: BigInt(event.block.number ?? 0),
      createdAtTimestamp: BigInt(event.block.timestamp ?? 0),
      settledAtBlock: undefined,
      settledAtTimestamp: undefined,
      txHash: event.transaction.hash ?? "",
    });
  },
);

indexer.onEvent(
  { contract: "ClaimEscrow", event: "RecipientCommitted" },
  async ({ event, context }) => {
    const claimId = event.params.claimId.toString();
    const existing = await context.Claim.get(claimId);
    if (
      !existing ||
      existing.status === "claimed" ||
      existing.status === "refunded"
    ) {
      return;
    }
    context.Claim.set({
      ...existing,
      recipient: event.params.recipient,
      status: "committed",
    });
  },
);

indexer.onEvent(
  { contract: "ClaimEscrow", event: "ClaimClaimed" },
  async ({ event, context }) => {
    const claimId = event.params.claimId.toString();
    const existing = await context.Claim.get(claimId);
    if (!existing) return;
    if (existing.status === "claimed" || existing.status === "refunded") {
      return;
    }
    context.Claim.set({
      ...existing,
      recipient: event.params.recipient,
      amount: event.params.amount,
      status: "claimed",
      settledAtBlock: BigInt(event.block.number ?? 0),
      settledAtTimestamp: BigInt(event.block.timestamp ?? 0),
    });
  },
);

indexer.onEvent(
  { contract: "ClaimEscrow", event: "ClaimRefunded" },
  async ({ event, context }) => {
    const claimId = event.params.claimId.toString();
    const existing = await context.Claim.get(claimId);
    if (!existing) return;
    if (existing.status === "claimed" || existing.status === "refunded") {
      return;
    }
    context.Claim.set({
      ...existing,
      amount: event.params.amount,
      status: "refunded",
      settledAtBlock: BigInt(event.block.number ?? 0),
      settledAtTimestamp: BigInt(event.block.timestamp ?? 0),
    });
  },
);