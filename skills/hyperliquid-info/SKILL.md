---
name: hyperliquid-info
description: >-
  Use when reading Hyperliquid market or account data via Info API — mids, L2
  book, recent trades, meta/asset contexts (perp + spot), candles, funding,
  clearinghouse, fills, portfolio, fees, vaults, staking, HIP-3/4 outcomes, or
  borrow/lend. Call MCP tools; never invent prices. Does not place orders.
---
# hyperliquid-info

Read-only `POST https://api.hyperliquid.xyz/info`. No signing. Plugin `0.2.0`.

## Tools (pick smallest)

| Need | Tool |
| --- | --- |
| All mid prices | `get_all_mids` |
| L2 book | `get_l2_book` (`coin`) |
| Recent prints | `get_recent_trades` (`coin`) |
| Perp universe / szDecimals | `get_meta` |
| Mark, funding, OI | `get_meta_and_asset_ctxs` |
| All HIP-3 dex metas | `get_all_perp_metas` / `get_perp_dexs` |
| Spot universe / tokens | `get_spot_meta` / `get_spot_meta_and_asset_ctxs` |
| Token supply / mid | `get_token_details` (`tokenId`) |
| OHLCV | `get_candles` (`coin`, `interval`, `startTime`) |
| Historical / predicted funding | `get_funding_history` / `get_predicted_fundings` |
| Perp account / margin | `get_clearinghouse_state` (`user`) |
| Spot balances | `get_spot_clearinghouse_state` (`user`) |
| Resting orders | `get_open_orders` / `get_frontend_open_orders` |
| Fills | `get_user_fills` / `get_user_fills_by_time` |
| Funding / ledger | `get_user_funding` / `get_user_non_funding_ledger_updates` |
| Portfolio / fees / role | `get_portfolio` / `get_user_fees` / `get_user_role` |
| Agents / subs / builders | `get_extra_agents` / `get_sub_accounts` / `get_approved_builders` |
| Vault | `get_vault_details` / `get_user_vault_equities` |
| Staking | `get_delegations` / `get_delegator_summary` / `get_validator_summaries` |
| Borrow/lend | `get_all_borrow_lend_reserve_states` / `get_borrow_lend_user_state` |
| HIP-4 outcomes | `get_outcome_meta` / `get_settled_outcome` |

## Rules

- Pass the **master/sub-account address**, never an agent wallet, for user queries.
- Perp `coin` is the meta name (e.g. `BTC`). Spot uses `PURR/USDC` or `@{index}` from `spotMeta.universe`.
- HIP-3 coins are prefixed (`xyz:TSLA`). Prefer `get_all_perp_metas` / `get_perp_dexs` when exploring builder dexs.
- Prefer the smallest tool. Never call `/exchange` from this plugin.
- Never invent mids, marks, or fills — call the tool.
