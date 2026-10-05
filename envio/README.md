# RemitLink Activity Indexer (Envio HyperIndex)

Indexes `ClaimEscrow` on **Monad testnet** so the app's Activity screen can show
send / commit / claim / refund history without reading logs directly.

## Why an indexer is required (not optional)

The public Monad testnet RPC caps log queries:

```
eth_getLogs is limited to a 100 range
```

Reading history straight from the contract would mean querying from block `0`
across ~68 million blocks in 100-block windows — roughly 680,000 requests. So the
Activity screen queries this indexer instead. See `src/lib/envio.ts` for the
client and the full explanation.

## What it indexes

One `Claim` entity per `claimId`, advanced through its lifecycle:

| Event | Effect |
|---|---|
| `ClaimCreated` | creates the entity (`status: created`) |
| `RecipientCommitted` | sets `recipient`, `status: committed` |
| `ClaimClaimed` | `status: claimed`, records settled block/timestamp |
| `ClaimRefunded` | `status: refunded`, records settled block/timestamp |

Handlers are **idempotent**: each reads the existing row and merges, and settled
claims are never overwritten, so a re-run or chain re-org cannot corrupt data.

## Files

- `config.yaml` — chain `10143`, ClaimEscrow address, the four events
- `schema.graphql` — the `Claim` entity
- `src/EventHandlers.ts` — the handlers

## Run locally

Requires Docker and an `ENVIO_API_TOKEN` (free: <https://envio.dev/app/api-tokens>)
in `.env`:

```bash
npx envio codegen
npx envio dev          # Hasura GraphQL on :8080
```

Query it:

```bash
curl -s -X POST http://localhost:8080/v1/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ Claim { id amount status createdAtBlock settledAtBlock txHash } }"}'
```

## Deployed

Hosted on Envio Cloud (`cipoklean/remitlink-indexer`, branch `main`, config
`envio/config.yaml`). The app reads it via `NEXT_PUBLIC_ENVIO_GRAPHQL_URL`.

> Note: `config.yaml` uses the current `chains[].contracts[].address` schema.
> Older docs — including Monad's own page — show a `networks:` form that the
> current CLI rejects.