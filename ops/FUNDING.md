# OVERLANDCOIN ops funding (BlockDAG Mainnet, chainId 1404)

**Do not commit private keys.** Wallet JSON lives only under the agent secrets directory  
`/home/box/agent-data/agents/ae1214f9-2ba5-4622-9895-085008aceab1/secrets/`  
(mode `700` / files `600`). Public addresses are in `addresses-only.txt` there.

RPC: `https://rpc.west.bdag-us.org/` (fallback `https://rpc.blockdag.engineering/` — never `rpc.bdagscan.com`)  
OLC ERC-20: `0x4DF1041EA978fcFF8997f9BFd5302E65100d7f27` (18 decimals)  
Explorer: https://explorer.blockdag.engineering

## Wallets

| Role | Purpose | File |
|------|---------|------|
| **Reward hot wallet** | Pays quest OLC via `REWARD_PRIVATE_KEY` (`transfer`) | `reward-wallet.json` |
| **Presale deliver / operator** | Calls `PresaleLock.credit` via `PRESALE_DELIVER_PRIVATE_KEY`; may also deploy if used as deployer | `presale-deliver-wallet.json` |

Read addresses (no keys):

```bash
cat /home/box/agent-data/agents/ae1214f9-2ba5-4622-9895-085008aceab1/secrets/addresses-only.txt
```

## What to fund (Austin chooses final amounts)

### 1. Gas — native BDAG on both EOAs

BlockDAG gas is typically cheap. Suggested:

- **~0.5–2 BDAG** on the **presale-deliver** wallet (and/or deployer) — enough for contract deploy, `setOperator`, many `credit` txs, and approvals.
- **~0.5–1 BDAG** on the **reward** wallet — enough for ongoing quest payout txs.

Send **native BDAG** (not OLC) to each address for gas.

### 2. OLC inventory — reward wallet

Suggested starting inventory (Austin chooses):

- **~1_000_000 OLC** on the **reward** wallet for quest claim payouts.

Env once funded:

```bash
REWARD_PRIVATE_KEY=<from reward-wallet.json, never commit>
REWARD_RPC_URL=https://rpc.west.bdag-us.org/
```

### 3. OLC inventory — PresaleLock

Suggested starting inventory (Austin chooses):

- **~50_000_000 OLC** as **presale lock inventory** (held by the lock contract, not freely transferable to buyers until `enableTrading()`).

After deploy (`node scripts/deploy-presale-lock.mjs`):

1. Set `NEXT_PUBLIC_PRESALE_LOCK_ADDRESS=<deployed>`
2. Transfer OLC to the lock **or** approve + `deposit(amount)`
3. Ensure `PRESALE_DELIVER_PRIVATE_KEY` is the operator (script calls `setOperator` if deployer ≠ deliver)
4. Keep some BDAG on the deliver wallet for `credit` gas

```bash
PRESALE_DELIVER_PRIVATE_KEY=<from presale-deliver-wallet.json, never commit>
PRESALE_RPC_URL=https://rpc.west.bdag-us.org/
# Optional explicit deployer:
# PRESALE_DEPLOYER_KEY=<funded key>
```

## Deploy (after gas is funded)

```bash
cd /workspace/overlandcoin
# Prefer: export PRESALE_DEPLOYER_KEY=0x…   OR use deliver wallet key via env/file
node scripts/deploy-presale-lock.mjs
```

The script aborts with exit 2 if the deployer BDAG balance is zero.

## Checklist

- [x] Fund reward address with BDAG gas + OLC inventory (confirmed ~1M OLC)
- [x] Fund deliver/deployer with BDAG gas (~25 BDAG)
- [x] Run deploy script; record `PresaleLock` address — see `ops/DEPLOYED.md`
- [x] Fund PresaleLock with **50_000_000 OLC**; operator = deliver wallet
- [ ] Set Vercel env vars (`ops/VERCEL_ENV.md`)
- [ ] Never paste private keys into chat, git, or client-side env (`NEXT_PUBLIC_*`)

## External deposits (Ethereum + Solana)

PresaleBuy accepts off-chain deposits to published addresses (defaults in code / `.env.example`):

| Asset | Network | Address |
|-------|---------|---------|
| USDT | Ethereum (ERC-20) | `0x310a612db74456cbc25a1f4f86fa0c265d98af99` |
| USDC | Ethereum | `0x310a612db74456cbc25a1f4f86fa0c265d98af99` |
| ETH | Ethereum | `0x310a612db74456cbc25a1f4f86fa0c265d98af99` |
| SOL | Solana | `FEUnNerfhepyz2fR7Dg5gV59hxpJ92VYg9Yv9LbmP5tJ` |
| BTC | Bitcoin (native SegWit) | `bc1qp6m0apc0mx6y88xw3ustezwaf7wfyvhvurs9ug` |

EVM address matches BlockDAG treasury (same key). Set matching `NEXT_PUBLIC_DEPOSIT_*` on Vercel Production (see `ops/VERCEL_ENV.md`).

