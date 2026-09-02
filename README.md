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
- /feed
- /garage
- /map
- /leaderboard
- /faq
- /docs

## Configure

- src/lib/token.ts
- src/lib/site.ts (socials/DEX/treasury placeholders)
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

OLC is never credited from client-only claims.

- **BDAG / BDUSD (BlockDAG):** wallet send → `POST /api/presale/deliver` verifies on-chain → PresaleLock credit (instant path).
- **USDT / USDC / ETH / BTC / SOL:** `POST /api/presale/orders` creates a Pay Order (exact payAmount, buyer, deposit address, ~45 min expiry). User sends exact amount, then `POST /api/presale/orders/:id/confirm` auto-scans for a matching deposit (or accepts pasted tx hash / explorer URL) and credits only after verified payment. Idempotent by payment tx id + orderId.
- Legacy: `POST /api/presale/confirm-deposit` still works; hash optional when `payAsset` + `payAmount` + `buyer` + `chain` are provided (amount-matched scan).

Orders: in-memory + `/tmp` JSON MVP (`PRESALE_ORDERS_PATH`). Use Redis/Postgres in production. Optional cron: `/api/cron/presale-scan` (`CRON_SECRET`). Optional `ETHEREUM_RPC_URL` / `SOLANA_RPC_URL`.

## Quest completion (once per device)

- Client device ledger: `overlandcoin.device.completedQuests.v1` (not account-scoped) + stable `overlandcoin.device.id.v1`.
- `hasCompletedQuest` is true if the account ledger **or** the device ledger has the quest.
- `POST /api/rewards/claim` accepts optional `deviceId` and rejects duplicates for `completionId`, `wallet+questId`, and `deviceId+questId`.
- **MVP limit:** claim dedupe is in-memory (+ `/tmp` JSON). Serverless instances do not share memory; cold starts can reset the ledger. Use Redis/DB for production.

