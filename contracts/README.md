# Quest reward contracts (optional)

## MVP (what the app uses today)

The Next.js API `POST /api/rewards/claim` pays OLC with a **server hot wallet**:

1. Set `REWARD_PRIVATE_KEY` (and optionally `REWARD_RPC_URL`) in the deployment environment.
2. Fund that wallet with OLC on BlockDAG Mainnet (`chainId` 1404).
3. Token: `0x4DF1041EA978fcFF8997f9BFd5302E65100d7f27` (18 decimals).
4. On claim, the server calls ERC-20 `transfer(to, amount)` where `amount` comes from the quest difficulty table — never from an arbitrary client amount.

**Do not deploy Solidity to unblock the product.** Hot-wallet transfer is the intentional MVP.

Anti-double-claim today: in-memory Map + `/tmp` JSON ledger + client `overlandcoin.claims.v1`. Production should use Redis/Postgres.

## Later: `QuestRewards.sol`

Deploy when you want pooled custody and signed claims instead of a hot wallet holding spendable OLC.

Suggested BlockDAG steps:

1. Compile with solc ≥ 0.8.20 (no OpenZeppelin dependency — Ownable is inline).
2. Deploy `QuestRewards` with constructor arg = OLC token address above.
3. Approve + `deposit(amount)` OLC into the pool (or transfer OLC then track balance).
4. Backend signs `(contract, chainId, to, amount, completionId, deadline)` and users call `claim`, **or** keep using `ownerPayout` from a secured relayer key.
5. Point the API at the contract instead of raw `transfer` when ready.

Explorer: https://explorer.blockdag.engineering  
RPC: `https://rpc.west.bdag-us.org/` (fallback `https://rpc.bdagscan.com/`)
