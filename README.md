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
