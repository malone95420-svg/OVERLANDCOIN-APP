# Connect + Buy checklist (post-fix)

Production: https://www.overlandcoin.tech  
Repo push target: `newapp` `main` only. `vercel.json` crons stay `[]`.

## Connect Wallet

| Path | Expected | Remaining limitation |
|------|----------|----------------------|
| **Injected in-app** (MetaMask / OKX / Trust browser) | Connect uses Browser / named injected; auto force-refresh BlockDAG 1404 with east→west RPCs; balance chip shows; Disconnect clears session | Some wallets ignore `wallet_addEthereumChain` rpcUrls until user manually edits network once |
| **WalletConnect** (mobile Safari / Telegram / desktop QR) | WC modal → approve in wallet app → returns connected; auto ensure 1404 (no switch-away dance) | WC often **cannot** update custom RPC. If BDAG send fails, UI shows one step: set RPC to `https://rpc.east.bdag-us.org/` **or** switch Pay with to ETH/USDT/USDC/SOL/BTC deposit |
| Wrong network | Single **Switch / Fix BlockDAG** control | User must approve prompts in wallet |
| Disconnect / reconnect | Clean disconnect; reconnect does not leave duplicate chips (header only) | — |
| Errors | Plain English (canceled, session expired, pending request) | Raw provider strings truncated if huge |

## Buy paths

| Asset | Expected | Remaining limitation |
|-------|----------|----------------------|
| **BDAG native** | Connect → network force → confirm in wallet → wait receipt → `/api/presale/deliver` → OLC in wallet. Progress: Switching network → Confirm in wallet → Confirming payment → Delivering OLC. Direct `eth_sendTransaction` + wagmi fallback; one auto-retry after RPC refresh | If wallet stuck on engineering/bdagscan and won’t update: manual RPC or deposit fallback (UI CTA). West RPC may 502 — east preferred |
| **ETH / USDT / USDC** | Order → Ethereum wallet pay or manual deposit + I’ve paid → deliver | Needs Ethereum mainnet in wallet for in-page send |
| **SOL** | Stay on page; Phantom if injected, else manual + auto-detect / I’ve paid | No deep-link away from page |
| **BTC** | Copy/QR + admin or I’ve paid confirm | Manual / admin confirm path |
| **Admin confirm** | `/admin/presale` with `PRESALE_ADMIN_SECRET` | Server secret only |

## Backend smoke (verified at fix time)

- `GET /api/prices` → 200 live BDAG/ETH/… quotes
- `GET /api/presale/recent` → 200 Upstash durable feed
- Deliver wallet OLC inventory ≈ **50M** on east RPC (west was flaky/502)
- Locked-balance UI retired from product; API remains for legacy ops

## Env (Vercel Production)

- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=eed8183bc65e42f185adef0150ca73a8`
- `NEXT_PUBLIC_BLOCKDAG_RPC=https://rpc.east.bdag-us.org/`
- `NEXT_PUBLIC_BLOCKDAG_RPC_FALLBACK=https://rpc.west.bdag-us.org/`
- Deliver + reward keys present; crons empty in `vercel.json`
