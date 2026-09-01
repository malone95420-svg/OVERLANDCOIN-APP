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
