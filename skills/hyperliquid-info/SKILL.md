---
name: hyperliquid-info
description: >-
  Hyperliquid prices, funding, open interest, order books, candles, or a
  wallet's positions, orders, fills, vaults and staking. Read-only.
---
# hyperliquid-info

Answer with numbers from the `hyperliquid-info` MCP tools.

## IDs

- `user` is the master or sub-account address (`0x` + 40 hex). An agent wallet returns empty state. Check with `get_user_role` when unsure.
- Perp `coin` is the meta name (`BTC`). HIP-3 coins carry a dex prefix (`xyz:TSLA`) and take `dex: "xyz"` on dex-scoped tools. Spot is `PURR/USDC` or `@{index}`; `get_spot_meta` maps pairs to tokens.

## Sizing

- Pass `coins` to the market tables (`get_meta_and_asset_ctxs`, `get_all_mids`, `get_predicted_fundings`, spot tools) and `limit` on lists.
- A result with `truncated: true` has more rows: call again with `offset: next_offset` only if the answer needs them.
- `get_candles` returns at most 200 bars; widen `interval` for longer ranges.

## Errors

A tool error carries the upstream reason and a `Hint:` line. Fix the argument the hint names, then retry once.

Done when every number in the answer came from a tool result in this conversation.
