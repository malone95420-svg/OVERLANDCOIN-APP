# PresaleLock deployment — BlockDAG Mainnet

| Field | Value |
|-------|-------|
| **Contract** | PresaleLock |
| **Address** | `0x6BAa605f29dD215FCeC215dC4be8818B3350EF37` |
| **Deploy tx** | `0xbf48d4e4cfa89cc7c39d355597e9745a2c01e3a88da26e6b5004cd45e0c10910` |
| **chainId** | `1404` |
| **OLC token** | `0x4DF1041EA978fcFF8997f9BFd5302E65100d7f27` |
| **Owner / operator** | `0xef7845AcC5e5d9d2e57D5F41ea41D72277D0895E` (presale deliver wallet) |
| **Deployer** | same as operator (deliver wallet) |
| **setOperator** | skipped — constructor already set operator = deployer |
| **Approve tx** | `0xb95b6ec50e26e5e800ae71977185422026b855ee1d6f753c1b7f26bfc9bfb2ef` |
| **Deposit tx** | `0xb240a5dd8f7f13dce4b7a25ab6ba4e0a9e1f52490b710e2610e98aeffe8334c4` |
| **Inventory deposited** | **50_000_000 OLC** (full deliver-wallet balance at deposit time) |
| **Compiler** | solc 0.8.28, **evmVersion: paris** (BlockDAG rejects PUSH0 / Shanghai) |
| **RPC** | `https://rpc.west.bdag-us.org/` |
| **Explorer (contract)** | https://bdagscan.com/address/0x6BAa605f29dD215FCeC215dC4be8818B3350EF37 |
| **Explorer (deploy tx)** | https://bdagscan.com/tx/0xbf48d4e4cfa89cc7c39d355597e9745a2c01e3a88da26e6b5004cd45e0c10910 |
| **Explorer (deposit tx)** | https://bdagscan.com/tx/0xb240a5dd8f7f13dce4b7a25ab6ba4e0a9e1f52490b710e2610e98aeffe8334c4 |
| **Deployed (UTC)** | 2026-09-01 ~22:00 UTC (≈ 4:00 PM MT) |

## Post-deploy status

- [x] Deploy PresaleLock
- [x] Operator = deliver wallet
- [x] Deposit 50M OLC inventory into lock
- [ ] Set Vercel env vars (see `ops/VERCEL_ENV.md`)
- [ ] Owner calls `enableTrading()` only after exchange listing (irreversible)

## Notes

- Deliver wallet retained ~25 BDAG for `credit` gas; OLC on deliver is now **0** (all in lock).
- Reward wallet (`0x0226b443B9800905B28ea09cb71B0a76454fd1fD`) is separate — quest payouts, not lock inventory.
- Do **not** commit private keys. Secrets stay under the agent secrets directory only.
