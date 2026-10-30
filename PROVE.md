# Prove note — hyperliquid-info 0.3.0

Run `npm test` (`test/smoke.mjs`, zero dependencies). It starts the stdio server and checks:

- `initialize` (protocol version, `instructions`) and `tools/list`: the tool count matches `README.md`, every tool has a title, `readOnlyHint` and a fixture, and every property has a description or enum.
- Argument validation errors (bad address, candle range, enum) come back as `isError` results with a usable message.
- A hung upstream returns a timeout error, and stdin close waits for in-flight calls.
- Live: every tool runs with the args in `test/fixtures.json`. Each result has no `structuredContent`, compact JSON text of 40,000 characters or less, no `isError`, and `next_offset` when truncated. Skipped offline or with `SMOKE_OFFLINE=1`.

`claude plugin validate . --strict` checks the manifests.

## Scope

Info API only. `/exchange` is not wrapped.

## Info types not wired

| type | Why |
| --- | --- |
| `liquidatable` | 422 deserialize for every body tried (`{}`, `user`, `dex`); tool removed in 0.3.0 |
| `vaultSummaries` | returns `[]` on mainnet and testnet; tool removed in 0.3.0 (use `get_vault_details` / `get_user_vault_equities`) |
| `userFeesSchedule` | 422 deserialize — use `userFees` (includes `feeSchedule`) |
| `extraAgent` | 422 — use `extraAgents` |
| `spotOpenOrders` / `spotUser` | 422 — use `openOrders` / `spotClearinghouseState` |
| `leadingVaults` | 422 — websocket `webData3` only |
| `outcomeDeployerLimits` | 500 on probe |
