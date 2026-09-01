# Vercel environment variables (OVERLANDCOIN)

Set these in the Vercel project → Settings → Environment Variables.  
**Values** for private keys come from the agent secrets JSON on the box — never paste keys into git or client docs.

## Required for live quest rewards + presale lock delivery

| Name | Notes |
|------|--------|
| `REWARD_PRIVATE_KEY` | From `reward-wallet.json` (server-only) |
| `REWARD_RPC_URL` | `https://rpc.west.bdag-us.org/` |
| `PRESALE_DELIVER_PRIVATE_KEY` | From `presale-deliver-wallet.json` (server-only) |
| `NEXT_PUBLIC_PRESALE_LOCK_ADDRESS` | `0x6BAa605f29dD215FCeC215dC4be8818B3350EF37` |
| `PRESALE_RPC_URL` | `https://rpc.west.bdag-us.org/` |

## Optional / already documented in `.env.example`

| Name | Notes |
|------|--------|
| `NEXT_PUBLIC_BLOCKDAG_RPC` | `https://rpc.west.bdag-us.org/` |
| `NEXT_PUBLIC_SITE_URL` | Production site URL |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud (if used) |

## Security

- Never set private keys on `NEXT_PUBLIC_*` vars.
- Never commit `.env` or wallet JSON.
- After rotating keys, update Vercel and redeploy.

## External deposits (Production)

Same EVM receive address as BlockDAG treasury (user-confirmed). Set all for Production + Redeploy:

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_DEPOSIT_USDT` | `0x310a612db74456cbc25a1f4f86fa0c265d98af99` |
| `NEXT_PUBLIC_DEPOSIT_USDT_NETWORK` | `Ethereum` |
| `NEXT_PUBLIC_DEPOSIT_USDC` | `0x310a612db74456cbc25a1f4f86fa0c265d98af99` |
| `NEXT_PUBLIC_DEPOSIT_USDC_NETWORK` | `Ethereum` |
| `NEXT_PUBLIC_DEPOSIT_ETH` | `0x310a612db74456cbc25a1f4f86fa0c265d98af99` |
| `NEXT_PUBLIC_DEPOSIT_ETH_NETWORK` | `Ethereum` |
| `NEXT_PUBLIC_DEPOSIT_BTC` | `bc1qp6m0apc0mx6y88xw3ustezwaf7wfyvhvurs9ug` |
| `NEXT_PUBLIC_DEPOSIT_BTC_NETWORK` | `Bitcoin (native SegWit)` |
| `NEXT_PUBLIC_ACCEPT_SOL` | `1` |
| `NEXT_PUBLIC_DEPOSIT_SOL` | `FEUnNerfhepyz2fR7Dg5gV59hxpJ92VYg9Yv9LbmP5tJ` |

Code also falls back to these defaults if env is unset (USDT network label defaults to `Ethereum (ERC-20)` in UI).

