# Prove note — hyperliquid-info 0.2.0

## Schema / install

| Step | Result |
| --- | --- |
| Schema (`plugin.json` + `mcp.json` vs agent-plugins 1.0.0) | PASS |
| `node --check server/index.mjs` | PASS |
| Local install under `~/.cursor/plugins/local/hyperliquid-info` | PASS |
| Live type probe (`_probe/LIVE.json`, gitignored) | 62/68 PASS (6 fail: undocumented / bad body) |
| Full MCP live mainnet suite (legacy + new tools + error paths) | see `TEST-RESULTS.json` (gitignored) |

## Scope

Info API only. `/exchange` is intentionally not wrapped.

## Failed / skipped types (not wired)

| type | Why |
| --- | --- |
| `userFeesSchedule` | 422 deserialize — use `userFees` (includes `feeSchedule`) |
| `extraAgent` | 422 — use `extraAgents` |
| `spotOpenOrders` / `spotUser` | 422 — use `openOrders` / `spotClearinghouseState` |
| `leadingVaults` | 422 — websocket `webData3` only |
| `outcomeDeployerLimits` | 500 on probe |

## Version bump

0.1.0 → 0.2.0 · UA `hyperliquid-info-mcp/0.2.0` · **11 → 61** tools.
