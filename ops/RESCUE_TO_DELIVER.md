# Rescue OLC from PresaleLock → deliver hot wallet

Purchases now **transfer OLC ERC-20** from the deliver hot wallet to the buyer
(same idea as quest claim payouts). PresaleLock is **not** credited on new buys.

| Item | Value |
|------|-------|
| PresaleLock | `0x6BAa605f29dD215FCeC215dC4be8818B3350EF37` |
| OLC token | `0x4DF1041EA978fcFF8997f9BFd5302E65100d7f27` |
| Deliver wallet | operator / `PRESALE_DELIVER_PRIVATE_KEY` address |
| Lock inventory (deposit) | ~50M OLC (unallocated until credited) |
| Deliver wallet at last check | **0 OLC** / ~25 BDAG gas |

## Why rescue?

`rescueUnallocated(to, amount)` (owner-only) moves OLC that is sitting in the
lock contract **above** `totalLocked` to `to`. It cannot touch amounts already
credited to users.

Fund the deliver wallet before live buys, or deliveries return **503** with a
clear “Insufficient OLC inventory in deliver wallet” message (payment stays
verified; user can Retry deliver after funding).

## Example (cast / foundry)

```bash
# Owner key of PresaleLock — never commit
export OWNER_KEY=0x…
export RPC=https://rpc.west.bdag-us.org/
export LOCK=0x6BAa605f29dD215FCeC215dC4be8818B3350EF37
export DELIVER=0xef7845AcC5e5d9d2e57D5F41ea41D72277D0895E   # confirm on-chain operator

# Rescue e.g. 1_000_000 OLC (18 decimals) to deliver wallet
cast send $LOCK "rescueUnallocated(address,uint256)" $DELIVER 1000000000000000000000000 \
  --rpc-url $RPC --private-key $OWNER_KEY
```

Or run `node scripts/rescue-presale-lock-to-deliver.mjs` (reads key from agent
secrets / env — never prints the key).

## RPC

- **Send / rescue:** `https://rpc.east.bdag-us.org/` first (west often 502). Correct state.
- Rescue completed (east): tx `0xbb7f26e0d5a47628ab920ead7e4e2029d3a234f7a232e9639339d76ba3de4283` — deliver wallet funded (~50M OLC minus ~7.43 legacy locked).
- **Reads:** `https://rpc.blockdag.engineering/` OK for tip/balance checks.
- **Never** use `https://rpc.bdagscan.com/` for delivery or rescue — it may accept
  `eth_sendRawTransaction` but its state is empty/wrong (lock code missing, balances 0).

## Do not

- Redeploy PresaleLock
- Call `enableTrading()` until exchange listing (irreversible; legacy withdraws only)
