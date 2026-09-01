# On-chain contracts (BlockDAG 1404)

## MVP quest rewards (what the app uses today)

The Next.js API `POST /api/rewards/claim` pays OLC with a **server hot wallet**:

1. Set `REWARD_PRIVATE_KEY` (and optionally `REWARD_RPC_URL`) in the deployment environment.
2. Fund that wallet with OLC on BlockDAG Mainnet (`chainId` 1404).
3. Token: `0x4DF1041EA978fcFF8997f9BFd5302E65100d7f27` (18 decimals).
4. On claim, the server calls ERC-20 `transfer(to, amount)` where `amount` comes from the quest difficulty table — never from an arbitrary client amount.

**Quest rewards stay claim-to-wallet** — they are **not** locked in PresaleLock.

Anti-double-claim today: in-memory Map + `/tmp` JSON ledger + client `overlandcoin.claims.v1`. Production should use Redis/Postgres.

## PresaleLock (required for instant locked delivery)

Purchased OLC must not be freely transferable until exchange listing. After a successful BDAG/BDUSD buy, the server credits OLC into `PresaleLock` instead of sending transferable ERC-20 to the buyer EOA.

### Deploy on BlockDAG 1404

1. Compile with solc ≥ 0.8.20 (no OpenZeppelin — Ownable/operator are inline).
2. Deploy `PresaleLock` with constructor arg = OLC token `0x4DF1041EA978fcFF8997f9BFd5302E65100d7f27`.
3. Fund inventory: approve the lock contract, then call `deposit(amount)`, **or** transfer OLC to the lock address and keep `balanceOf(lock) >= totalLocked + nextCredit`.
4. Set operator to the deliver hot wallet: `setOperator(deliverAddress)`.
5. App env:
   - `NEXT_PUBLIC_PRESALE_LOCK_ADDRESS=<deployed address>`
   - `PRESALE_DELIVER_PRIVATE_KEY=<operator key>` (or reuse `REWARD_PRIVATE_KEY` if the same funded wallet is the operator — document which you use)
   - `PRESALE_RPC_URL=` optional RPC override (falls back to BlockDAG public RPCs / `REWARD_RPC_URL`)
6. After successful payment, `POST /api/presale/deliver` calls `PresaleLock.credit(buyer, amountWei)`.
7. When OLC is listed on exchanges, **owner** calls `enableTrading()` once. Buyers then call `withdraw()` to pull locked OLC to their wallet.

If lock address or deliver key is missing, purchases are marked `locked_pending_chain` and the UI shows a local credit with “awaiting lock contract config” — never claim transferable wallet delivery.

Explorer: https://explorer.blockdag.engineering  
RPC: `https://rpc.west.bdag-us.org/` (fallback `https://rpc.bdagscan.com/`)

### Suggested forge/cast deploy sketch

```bash
# Example with forge (install foundry separately)
forge create contracts/PresaleLock.sol:PresaleLock \
  --rpc-url https://rpc.west.bdag-us.org/ \
  --private-key $DEPLOYER_KEY \
  --constructor-args 0x4DF1041EA978fcFF8997f9BFd5302E65100d7f27

# Fund + set operator
cast send $PRESALE_LOCK "deposit(uint256)" $AMOUNT_WEI --rpc-url ... --private-key $DEPLOYER_KEY
cast send $PRESALE_LOCK "setOperator(address)" $DELIVER_ADDRESS --rpc-url ... --private-key $DEPLOYER_KEY

# After listings:
cast send $PRESALE_LOCK "enableTrading()" --rpc-url ... --private-key $OWNER_KEY
```

## Later: `QuestRewards.sol`

Deploy when you want pooled custody and signed claims instead of a hot wallet holding spendable OLC for quests.

Suggested BlockDAG steps:

1. Compile with solc ≥ 0.8.20.
2. Deploy `QuestRewards` with constructor arg = OLC token address above.
3. Approve + `deposit(amount)` OLC into the pool.
4. Backend signs claim params **or** use `ownerPayout` from a secured relayer key.
5. Point the rewards API at the contract instead of raw `transfer` when ready.
