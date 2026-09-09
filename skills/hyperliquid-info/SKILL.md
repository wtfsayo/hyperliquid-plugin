---
name: hyperliquid-info
description: >-
  Use when reading Hyperliquid market or account data via Info API — mids, L2
  book, meta/asset contexts, candles, clearinghouse, open orders, fills, or
  funding. Call MCP tools; never invent prices. Does not place orders.
---
# hyperliquid-info

Read-only `POST https://api.hyperliquid.xyz/info`. No signing.

## Tools

| Need | Tool |
| --- | --- |
| All mid prices | `get_all_mids` |
| L2 book | `get_l2_book` (`coin` required) |
| Universe / szDecimals | `get_meta` |
| Mark, funding, OI | `get_meta_and_asset_ctxs` |
| OHLCV | `get_candles` (`coin`, `interval`, `startTime`) |
| Account positions / margin | `get_clearinghouse_state` (`user`) |
| Resting orders | `get_open_orders` (`user`) |
| Trade history | `get_user_fills` (`user`) |
| One order | `get_order_status` (`user`, `oid`) |
| Historical funding | `get_funding_history` (`coin`, `startTime`) |
| Cross-venue predicted funding | `get_predicted_fundings` |

## Rules

- Pass the **master/sub-account address**, never an agent wallet, for user queries.
- Perp `coin` is the meta name (e.g. `BTC`). Spot uses `PURR/USDC` or `@{index}`.
- Prefer the smallest tool. Never call `/exchange` from this plugin.
- Never invent mids, marks, or fills — call the tool.
