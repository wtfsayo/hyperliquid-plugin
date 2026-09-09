# Prove note — hyperliquid-info 0.1.0

## Schema / install

| Step | Result |
| --- | --- |
| Schema (`plugin.json` + `mcp.json` vs agent-plugins 1.0.0) | PASS |
| `node --check server/index.mjs` | PASS |
| Local install under `~/.cursor/plugins/local/hyperliquid-info` | PASS |
| Full MCP live mainnet suite (11 tools + error paths) | 15/15 PASS |
| Testnet `get_l2_book` BTC | PASS |

## Scope

Info API only. `/exchange` is intentionally not wrapped.
