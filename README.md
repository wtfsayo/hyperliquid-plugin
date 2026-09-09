# hyperliquid-info

Cursor / Agent Plugin wrapping Hyperliquid’s **public Info API** (`POST /info`).

Read-only. No `/exchange`, no private keys, no order placement.

Docs: [Info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint) · [Perpetuals](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals) · [Spot](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot)

## Domain types

| Type | Meaning |
| --- | --- |
| `MidMap` | coin → mid price string |
| `L2Book` | `{ coin, time, levels: [bids, asks] }` |
| `RecentTrade` | `{ coin, side, px, sz, time, tid, users }` |
| `AssetMeta` / `SpotMeta` | universe + margin / tokens + spot pairs |
| `AssetCtx` / `SpotAssetCtx` | mark / oracle / funding / OI / day volume |
| `ClearinghouseState` | margin + positions for a user |
| `SpotClearinghouseState` | spot balances (`balances[]`) |
| `OpenOrder` / `FrontendOpenOrder` / `UserFill` / `Candle` / `FundingRate` | as named |
| `Portfolio` | day/week/month/allTime (+ perp*) PnL & accountValue histories |
| `UserFees` | fee schedule + user rates + staking/referral discounts |
| `VaultDetails` / `UserVaultEquity` | vault APR, followers, equity |
| `DelegatorSummary` / `ValidatorSummary` | staking state |
| `BorrowLendReserveState` | supply/borrow rates & utilization |
| `OutcomeMeta` / `SettledOutcome` | HIP-4 outcome markets |

## Install (Cursor IDE)

1. Clone this repo (or copy the folder).
2. Copy into a **real directory**: `~/.cursor/plugins/local/hyperliquid-info`
3. Reload Window / enable local plugins if your org gates imports.

## MCP tools (61)

### Market / meta

| Tool | Returns |
| --- | --- |
| `get_all_mids` | `MidMap` |
| `get_l2_book` | `L2Book` (`coin`) |
| `get_recent_trades` | `RecentTrade[]` (`coin`) |
| `get_meta` | perp universe + margin tables |
| `get_meta_and_asset_ctxs` | `[meta, AssetCtx[]]` |
| `get_all_perp_metas` | metas across all perp dexs (HIP-3) |
| `get_perp_dexs` | builder-deployed dex list |
| `get_perp_dex_limits` | OI / transfer caps (`dex` required) |
| `get_perp_dex_status` | net deposits etc. |
| `get_perps_at_open_interest_cap` | coins at OI cap |
| `get_perp_deploy_auction_status` | perp deploy auction |
| `get_perp_annotation` | category/description (`coin`) |
| `get_perp_categories` | `[[coin, category], …]` |
| `get_perp_concise_annotations` | concise annotations |
| `get_margin_table` | margin tiers by `id` |
| `get_candles` | OHLCV (`coin`, `interval`, `startTime`) |
| `get_funding_history` | historical funding (`coin`, `startTime`) |
| `get_predicted_fundings` | cross-venue predicted funding |
| `get_exchange_status` | specialStatuses + time |
| `get_liquidatable` | liquidatable set (may be empty) |

### Spot / outcomes / borrow-lend

| Tool | Returns |
| --- | --- |
| `get_spot_meta` | `SpotMeta` |
| `get_spot_meta_and_asset_ctxs` | `[SpotMeta, SpotAssetCtx[]]` |
| `get_token_details` | supply / mid / mark (`tokenId`) |
| `get_spot_pair_deploy_auction_status` | spot pair auction |
| `get_spot_deploy_state` | deployer auction state (`user`) |
| `get_spot_clearinghouse_state` | spot balances (`user`) |
| `get_outcome_meta` | HIP-4 outcomes |
| `get_settled_outcome` | settled outcome (`outcome`) |
| `get_all_borrow_lend_reserve_states` | all reserve states |
| `get_borrow_lend_reserve_state` | one token (`token`) |
| `get_borrow_lend_user_state` | user borrow/lend (`user`) |

### User

| Tool | Returns |
| --- | --- |
| `get_clearinghouse_state` | perp account (`user`) |
| `get_open_orders` | resting orders (`user`) |
| `get_frontend_open_orders` | orders + trigger/TP-SL fields |
| `get_historical_orders` | recent historical orders |
| `get_user_fills` | recent fills |
| `get_user_fills_by_time` | fills by time range |
| `get_user_funding` | funding payments ledger |
| `get_user_non_funding_ledger_updates` | deposits/transfers/withdrawals |
| `get_user_twap_slice_fills` | TWAP slice fills |
| `get_order_status` | status by `oid` / cloid |
| `get_active_asset_data` | leverage / trade sizes (`user`, `coin`) |
| `get_user_rate_limit` | request / volume caps |
| `get_user_role` | user / agent / vault / subAccount |
| `get_user_fees` | fees + schedule |
| `get_portfolio` | portfolio histories |
| `get_sub_accounts` | sub-accounts |
| `get_extra_agents` | named API agents |
| `get_referral` | referral / rewards |
| `get_user_abstraction` | abstraction mode |
| `get_user_dex_abstraction` | HIP-3 dex abstraction flag |
| `get_approved_builders` | approved builders |
| `get_max_builder_fee` | max fee (`user`, `builder`) |

### Vault / staking

| Tool | Returns |
| --- | --- |
| `get_vault_details` | vault APR / followers (`vaultAddress`) |
| `get_user_vault_equities` | vault equities for user |
| `get_vault_summaries` | vault list (may be empty) |
| `get_delegations` | staking delegations |
| `get_delegator_summary` | delegated / pending |
| `get_delegator_history` | stake events |
| `get_delegator_rewards` | rewards |
| `get_validator_summaries` | validators |

Pass the **master/sub-account address** for user queries — not an agent wallet.

## Network

Default: `https://api.hyperliquid.xyz`

Testnet: set env `HYPERLIQUID_API_URL=https://api.hyperliquid-testnet.xyz` (see `mcp.json`).

## Skill

`skills/hyperliquid-info/SKILL.md` — when to call which tool. Never invent prices.

## Prove

See `PROVE.md` for local schema + live MCP verification notes. Probe artifacts live under `_probe/` (gitignored).

## License

MIT

## Repository

https://github.com/wtfsayo/hyperliquid-plugin
