# RemitLink

Send money home with a passkey. Mobile-first, built for **Monad Metropolis** (track: Consumer Products & Payments).

**Corridor:** US → Nigeria (NGN). One corridor only.

## What it is

A sender signs in with a passkey (no seed phrase, no forms), sends dollars, and gets a **claim link**. The recipient opens the link (WhatsApp/SMS/QR), signs in with their own passkey, and claims the money - no prior account needed.

The UI never says blockchain, wallet, gas, crypto, token, or seed phrase.

## Live

**https://remitlink.vercel.app** - passkeys are bound to the domain, so this URL is permanent.

## Run it

```bash
npm install
cp .env.example .env.local     # fill in NEXT_PUBLIC_PRIVY_APP_ID
npm run build && npm run start # production mode; dev cold-compiles are very slow
```

Open http://localhost:3000 on a phone (or a 390px-wide viewport).

Contract tests (needs Foundry):

```bash
cd contracts && forge test      # 23 passing
```

Envio indexer (needs Docker + an `ENVIO_API_TOKEN`):

```bash
cd envio && npx envio codegen && npx envio dev
```

## Architecture

| Piece | Where | What it does |
|---|---|---|
| `ClaimEscrow.sol` | `contracts/src/` | Escrows USDC; pays only the committed recipient |
| `/send` | `src/app/send/` | Approve + create claim, secret generated client-side |
| `/claim/[id]` | `src/app/claim/` | Recipient signs in, commits, claims |
| `/transfer/[id]` | `src/app/transfer/` | Status page: claimed/expired/refunded + measured metrics |
| `/cashout` | `src/app/cashout/` | **MOCK** Nigerian bank payout story |
| `/api/claim` | `src/app/api/claim/` | Relays recipient-side `commitRecipient` + `claim` |
| `/api/refund` | `src/app/api/refund/` | Relays sender-side `refund` after expiry |
| `/api/faucet` | `src/app/api/faucet/` | Test-money drip (testnet USDC from a treasury) |
| `/api/drip` | `src/app/api/drip/` | Gas top-up so a first-time sender needs no MON |
| `envio/` | `envio/` | HyperIndex over `ClaimEscrow` events, queried by `/activity` and the metrics panel |

Addresses live in `deployments.json`. Nothing is hardcoded in components.

## Security

### Threat model

The assets are **testnet USDC** and, in production shape, real money in an escrow contract. The server holds a relayer key and pays gas on users' behalf, so the server is the most attractive target: anyone who can make it send transactions drains it. Every server route is therefore bounded.

Secrets live only in `.env` / `.env.local` (gitignored, chmod 600). The treasury and relayer keys are **never** `NEXT_PUBLIC_` and never reach the browser.

### Why the secret + commit-first scheme

A first design used EIP-712 signatures and was **rejected**: `claimDigest` was public, so anyone could construct their own claim, sign it, and drain the escrow. A test caught it.

The shipped scheme separates the two roles:

```
createClaim(token, amount, keccak256(secret), expiry)
commitRecipient(claimId, recipient)   // payout address locked FIRST
claim(claimId, secret, recipient)     // pays ONLY the committed address
refund(claimId)                       // after expiry, back to sender
```

The secret appears in calldata at reveal, so a mempool watcher could copy it. Because the payout address is committed **first** and never changed, a copied secret can only ever pay the original recipient.

### Known limitation (deliberate, documented)

**Whoever commits first *and* knows the secret wins the claim.**

This is griefing, not theft: the legitimate recipient is simply outbid, and the funds return to the sender at expiry. It is bounded by the expiry window and pinned by
`test_KnownLimitation_FirstCommitterWithSecretWins` in `contracts/test/ClaimEscrow.t.sol` so it cannot be silently "fixed" later. Fixing it properly needs a commit-and-reveal scheme with a bonding or cancellation rule - out of scope here.

### Server-side caps

All four server routes are rate-limited and budgeted. Limits are per-process, in memory.

| Route | Per IP | Per claim/address | Budget / cooldown |
|---|---|---|---|
| `/api/claim` | 10 / 10 min | 3 attempts | 0.5 MON daily gas |
| `/api/refund` | 10 / 10 min | 3 attempts | 0.5 MON daily gas |
| `/api/faucet` | 3 / 10 min | 1 drip / hour | 300 USDC daily |
| `/api/drip` | 3 / 10 min | 1 drip / 24 h | 2 MON daily, keeps 0.5 MON reserve |

**Known weakness:** these counters are in-memory, so they are correct for a single Vercel instance but reset on redeploy and would not hold across a multi-instance deploy. A shared store (Upstash/Redis) would be the fix.

`/api/claim` verifies `keccak256(secret) == claimHash` **off-chain** before spending any gas, so a wrong secret costs nothing.

### Testnet only

Everything here runs on Monad **testnet** (chain `10143`). No mainnet deployment, no real funds. Test tokens have no value.

## MOCK items

Per the honesty rule, everything simulated is labeled in code, in the UI, and here.

| Item | Status | Where |
|---|---|---|
| **USD → NGN rate** | **MOCK** - static `1480`, labeled "MOCK RATE" in the UI | `src/lib/corridor.ts` |
| **Competitor fees** | Illustrative figures, labeled "typical fees, illustrative" | `src/lib/corridor.ts` |
| **Cash-out to bank** | **MOCK** - no partner API is called, no money moves | `src/app/cashout/` |
| **Test-money + gas top-ups** | Real testnet transfers from a treasury, but demo-only funds | `/api/faucet`, `/api/drip` |

The cash-out screen is a **product story, not an integration**. The production path is a licensed Nigerian payout partner quoted server-side.

## Activity index

`/activity` and the transfer metrics read from an **Envio HyperIndex**, not from the chain directly. This is required, not a preference: the public Monad testnet RPC caps `eth_getLogs` at a **100-block range**, so reading a claim's history directly would mean ~680,000 requests.

Metrics shown on `/transfer/[id]` are **measured** - block timestamps for settle time, and `gasUsed × effectiveGasPrice` from the real receipt for the fee. Nothing is estimated, and unmeasurable values render as such.

## Bounties

Claimed bounties each need a section here describing the real integration. Status is tracked in `AGENT.md` section 6; criteria that have not been verified against the application platform are **not** claimed here.

## Known gaps

- Refunds only become possible after a claim expires (7 days), so a refund is not demoable on demand.
- Fee and FX figures are illustrative, not live quotes.
- Relayer rate limits are per-process, not shared (see Security).
- Contracts are not yet source-verified on the explorer.