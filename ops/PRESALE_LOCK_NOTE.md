# PresaleLock (ops)

- Contract stays deployed on BlockDAG — **do not redeploy**.
- Product UX no longer surfaces locked / unlock / withdraw-until-listing flows.
- Early test locked dust (e.g. ~7.43 OLC) can remain abandoned in the lock.
- **Do not call `enableTrading`** just to clear test balances — that would be a public unlock event.
- New verified purchases deliver OLC ERC-20 to the buyer wallet via the deliver key.
