# hyperliquid-info

Cursor / Agent Plugin wrapping Hyperliquid’s **public Info API** (`POST /info`).

Read-only. No `/exchange`, no private keys, no order placement.

Docs: [Hyperliquid API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api)

## Domain types

| Type | Meaning |
| --- | --- |
| `MidMap` | coin → mid price string |
| `L2Book` | `{ coin, time, levels: [bids, asks] }` |
| `AssetMeta` | universe row (`name`, `szDecimals`, `maxLeverage`, …) |
| `AssetCtx` | mark / oracle / funding / OI / day volume |
| `ClearinghouseState` | margin + positions for a user |
| `OpenOrder` / `UserFill` / `Candle` / `FundingRate` | as named |

## Install (Cursor IDE)

1. Clone this repo (or copy the folder).
2. Copy into a **real directory**: `~/.cursor/plugins/local/hyperliquid-info`
3. Reload Window / enable local plugins if your org gates imports.

## MCP tools

| Tool | Returns |
| --- | --- |
| `get_all_mids` | `MidMap` |
| `get_l2_book` | `L2Book` (`coin` required) |
| `get_meta` | perp universe + margin tables |
| `get_meta_and_asset_ctxs` | `[meta, AssetCtx[]]` |
| `get_candles` | OHLCV (`coin`, `interval`, `startTime`) |
| `get_clearinghouse_state` | account summary (`user`) |
| `get_open_orders` | resting orders (`user`) |
| `get_user_fills` | recent fills (`user`) |
| `get_order_status` | status by `oid` / cloid |
| `get_funding_history` | historical funding (`coin`, `startTime`) |
| `get_predicted_fundings` | cross-venue predicted funding |

Pass the **master/sub-account address** for user queries — not an agent wallet.

## Network

Default: `https://api.hyperliquid.xyz`

Testnet: set env `HYPERLIQUID_API_URL=https://api.hyperliquid-testnet.xyz` (see `mcp.json`).

## Skill

`skills/hyperliquid-info/SKILL.md` — when to call which tool. Never invent prices.

## Prove

See `PROVE.md` for local schema + live MCP verification notes.

## License

MIT
