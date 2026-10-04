# RemitLink

Send money home with a passkey. Mobile-first, built for Monad Metropolis (track: Consumer Products & Payments).

**Corridor:** US → Nigeria (NGN). One corridor only.

## What it is

A sender signs in with a passkey (no seed phrase, no forms), sends dollars, and gets a claim link. The recipient opens the link (WhatsApp/SMS/QR), signs in with their own passkey, and claims the money — no prior account needed. A fee comparison shows the savings vs a bank wire or typical remittance service.

The UI never says blockchain, wallet, gas, crypto, token, or seed phrase.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in NEXT_PUBLIC_PRIVY_APP_ID
npm run dev
```

Open http://localhost:3000 on a phone (or 390px wide). Passkey login requires HTTPS in production or localhost in dev.

## Status

Phase 0/1 — see [AGENT.md](./AGENT.md) for the full spec, build plan, and decision log.

## MOCK items

(None yet — being filled in as integrations land. Anything mocked will be listed here, in code comments, and in the UI.)

## Bounties

Mapped in AGENT.md section 2b; each claimed bounty gets a README section here once the integration is real.
