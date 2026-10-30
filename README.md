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

## Install (Claude Code)

Clone this repo, then start Claude Code with `claude --plugin-dir /path/to/hyperliquid-plugin`. `.claude-plugin/plugin.json` loads the skill and starts the MCP server with `node ${CLAUDE_PLUGIN_ROOT}/server/index.mjs`. The server has no dependencies, so it needs only Node on `PATH` and no `npm install`.

For testnet, export `HYPERLIQUID_API_URL` before you launch Claude Code.

## MCP tools (59)

Every tool is read-only and returns compact JSON as text. List tools return a page: `{ total, returned, offset, next_offset, truncated, items }`, with `limit` (default 50, max 500) and `offset` inputs. Market tables also take `coins` (e.g. `["BTC","ETH"]`). No result is larger than 40,000 characters; anything bigger asks you to narrow the request. Upstream errors come back as tool errors (`isError`) with the HTTP reason and a hint. Each request times out after 15 s (`HYPERLIQUID_TIMEOUT_MS`).

### Market / meta

| Tool | Returns |
| --- | --- |
| `get_all_mids` | `MidMap` (`coins` to filter) |
| `get_l2_book` | `L2Book` (`coin`) |
| `get_recent_trades` | `RecentTrade[]` (`coin`) |
| `get_meta` | perp universe + margin tables |
| `get_meta_and_asset_ctxs` | one row per perp: meta + mark / funding / OI / volume (`coins`) |
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
| `get_candles` | OHLCV (`coin`, `interval`; default last 100 bars, max 200) |
| `get_funding_history` | historical funding (`coin`; default last 24h) |
| `get_predicted_fundings` | cross-venue predicted funding |
| `get_exchange_status` | specialStatuses + time |

### Spot / outcomes / borrow-lend

| Tool | Returns |
| --- | --- |
| `get_spot_meta` | spot pairs with base/quote token names and ids (`coins`) |
| `get_spot_meta_and_asset_ctxs` | spot pair rows + mid / mark / volume / supply (`coins`) |
| `get_token_details` | supply / mid / mark + genesis list counts (`tokenId`; `genesis` pages one list) |
| `get_spot_pair_deploy_auction_status` | spot pair auction |
| `get_spot_deploy_state` | deployer auction state (`user`) |
| `get_spot_clearinghouse_state` | spot balances (`user`) |
| `get_outcome_meta` | HIP-4 questions, deployers, paged outcomes |
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
| `get_portfolio` | portfolio histories (`period` for one) |
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
| `get_vault_details` | vault APR / leader / paged followers (`vaultAddress`; `period` adds history) |
| `get_user_vault_equities` | vault equities for user |
| `get_delegations` | staking delegations |
| `get_delegator_summary` | delegated / pending |
| `get_delegator_history` | stake events |
| `get_delegator_rewards` | rewards |
| `get_validator_summaries` | validators |

Pass the **master/sub-account address** for user queries — not an agent wallet.

## Network

Default: `https://api.hyperliquid.xyz`

Testnet: set `HYPERLIQUID_API_URL=https://api.hyperliquid-testnet.xyz` in the environment. Claude Code passes it through `.claude-plugin/plugin.json`; for Cursor, add it under `env` in `mcp.json`.

## Skill

`skills/hyperliquid-info/SKILL.md` — address and coin conventions, result sizing, and error handling.

## Test

`npm test` runs `test/smoke.mjs`. It starts the server over stdio and checks initialize, tools/list, argument validation, timeouts and drain-on-close. Then it calls every tool with the args in `test/fixtures.json` against the live API and checks that each result fits the size cap and is not an error. The live calls are skipped when the API is unreachable or `SMOKE_OFFLINE=1` is set. CI runs it on every push and daily (`.github/workflows/smoke.yml`).

## License

MIT

## Repository

https://github.com/wtfsayo/hyperliquid-plugin
