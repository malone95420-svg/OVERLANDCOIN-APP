# OVERLANDCOIN

Production Next.js App Router site for OVERLANDCOIN (OLC) on BlockDAG Mainnet.

Adventure Powered. Location Rewarded. Move. Explore. Earn. Fuel for the Journey.

## Token

- Contract: 0x4DF1041EA978fcFF8997f9BFd5302E65100d7f27
- Name/Symbol: OVERLANDCOIN / OLC
- Decimals: 18
- Total supply: 9,000,000,000 OLC
- Chain: BlockDAG Mainnet, chainId 1404
- RPC: https://rpc.west.bdag-us.org/ (fallback https://rpc.bdagscan.com/)
- Explorer: https://explorer.blockdag.engineering/address/0x4DF1041EA978fcFF8997f9BFd5302E65100d7f27

OLC exists ONLY on BlockDAG 1404. Same address on Base/Ethereum is an empty EOA.

## Pages

- / Home
- /tokenomics
- /roadmap
- /presale
- /staking
- /map
- /leaderboard
- /faq
- /docs

## Configure

- src/lib/token.ts
- src/lib/site.ts (socials/DEX/treasury/staking placeholders)
- src/lib/tokenomics.ts (draft allocations)
- .env.example

## Develop

Install deps, then start the Next.js dev server.

Open http://localhost:3000

## Build

Create a production build, then start the production server.

## GitHub

Target: https://github.com/overlandcoin-deep/OVERLANDCOIN

## Zip

From /workspace zip overlandcoin excluding node_modules and .next

## Not included

Admin panels, passwords, auth backends, email systems.

## Account login

- **Wallet (primary):** `/login` → Sign in with wallet (sign message “Sign in to OVERLANDCOIN”). No Redis required. Set `AUTH_SECRET` in production.
- **Email/password:** Needs `AUTH_SECRET` + Upstash `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` in production. Otherwise the UI tells you to use wallet login.
- **Google (optional):** `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET`.
- Garage / completions / purchases localStorage keys are namespaced by `accountKey` after login (same device). Cross-device sync needs Redis later.

## Presale payment verification

OLC is never credited from client-only claims. `POST /api/presale/deliver` and `POST /api/presale/confirm-deposit` verify the payment tx on BlockDAG / Ethereum / Bitcoin / Solana, recompute OLC from verified amount × live USD ÷ live batch price, then credit PresaleLock (idempotent by `paymentTxHash`).

Users paste the payment tx hash and tap **Confirm payment**. Optional cron: `/api/cron/presale-scan` (needs `CRON_SECRET`). Optional `ETHEREUM_RPC_URL` / `SOLANA_RPC_URL`.
