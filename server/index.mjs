#!/usr/bin/env node
/**
 * Zero-dep stdio MCP for the Hyperliquid Info API (POST /info only).
 * Read-only: no /exchange, no signing, no private keys.
 */

import { createInterface } from "node:readline";

const VERSION = "0.3.0";
const BASE = (process.env.HYPERLIQUID_API_URL || "https://api.hyperliquid.xyz").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.HYPERLIQUID_TIMEOUT_MS ?? 15000);
const MAX_CHARS = 40_000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const MAX_CANDLES = 200;
const DAY_MS = 86_400_000;
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const ADDRESS = "^0x[0-9a-fA-F]{40}$";
const ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const INSTRUCTIONS =
  "Read-only Hyperliquid Info API: perp and spot prices, funding, open interest, order books, candles, HIP-3 dexes, " +
  "HIP-4 outcomes, and any wallet's positions, orders, fills, ledger, vaults and staking. No trading. " +
  "Keep results small: pass coins to filter market tables and limit/offset on lists; a truncated result carries next_offset. " +
  "user is the master or sub-account address (0x + 40 hex), not an agent wallet. " +
  "Perp coins use meta names (BTC, HIP-3 xyz:TSLA); spot uses PURR/USDC or @index.";

const INTERVAL_MS = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "8h": 28_800_000,
  "12h": 43_200_000,
  "1d": DAY_MS,
  "3d": 3 * DAY_MS,
  "1w": 7 * DAY_MS,
  "1M": 30 * DAY_MS,
};
const PERIODS = ["day", "week", "month", "allTime", "perpDay", "perpWeek", "perpMonth", "perpAllTime"];

// —— Shared property schemas ——
const user = { type: "string", pattern: ADDRESS, description: "0x address of the master/sub-account (not an agent)." };
const dex = { type: "string", description: 'HIP-3 dex, e.g. "xyz"; omit for the main dex.' };
const coin = { type: "string", description: 'e.g. "BTC", HIP-3 "xyz:TSLA", spot "PURR/USDC" or "@107".' };
const coins = { type: "array", items: { type: "string" }, description: 'Filter to these coins, e.g. ["BTC","ETH"].' };
const limit = { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT, description: "Max items." };
const offset = { type: "integer", minimum: 0, default: 0, description: "Skip items; use next_offset." };
const startTime = { type: "integer", description: "Start, ms since epoch (inclusive); default 24h ago." };
const endTime = { type: "integer", description: "End, ms since epoch (inclusive); default now." };
const period = { type: "string", enum: PERIODS, description: "Only this portfolio period." };
const page = { limit, offset };

class ToolError extends Error {}

// —— Upstream ——
async function info(body) {
  const res = await fetch(`${BASE}/info`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": `hyperliquid-info-mcp/${VERSION}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${BASE}/info type=${body?.type}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

// —— Response shaping ——
/** Page a list and keep the compact JSON under MAX_CHARS, minus `reserve` chars used by sibling fields. */
function shape(items, args = {}, hint = "pass limit/offset to page", reserve = 0) {
  const list = Array.isArray(items) ? items : [];
  const start = args.offset ?? 0;
  const window = list.slice(start, start + (args.limit ?? DEFAULT_LIMIT));
  const budget = MAX_CHARS - 1000 - reserve;
  let used = 2;
  let n = 0;
  for (const item of window) {
    const size = JSON.stringify(item).length + 1;
    if (used + size > budget) break;
    used += size;
    n++;
  }
  if (n === 0 && window.length > 0) {
    throw new ToolError(`item at offset ${start} alone exceeds ${MAX_CHARS} chars; ${hint}`);
  }
  const next = start + n;
  const out = { total: list.length, returned: n, offset: start };
  if (next < list.length) out.next_offset = next;
  out.truncated = next < list.length;
  out.items = window.slice(0, n);
  if (out.truncated) out.hint = hint;
  return out;
}

function wanted(args) {
  return args.coins?.length ? new Set(args.coins.map((c) => c.toLowerCase())) : null;
}

function matches(set, ...names) {
  return !set || names.some((n) => typeof n === "string" && set.has(n.toLowerCase()));
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") out[k] = obj[k];
  }
  return out;
}

function since(args) {
  return { startTime: args.startTime ?? Date.now() - DAY_MS, ...pick(args, ["endTime"]) };
}

function spotPairs(meta) {
  const tokens = new Map(meta.tokens.map((t) => [t.index, t]));
  return meta.universe.map((pair) => {
    const base = tokens.get(pair.tokens[0]);
    const quote = tokens.get(pair.tokens[1]);
    return {
      name: pair.name,
      index: pair.index,
      base: base?.name ?? null,
      quote: quote?.name ?? null,
      isCanonical: pair.isCanonical,
      baseTokenId: base?.tokenId ?? null,
      baseFullName: base?.fullName ?? null,
      szDecimals: base?.szDecimals ?? null,
    };
  });
}

function spotMatches(set, row) {
  return matches(set, row.name, row.coin, row.base, row.base && row.quote ? `${row.base}/${row.quote}` : null);
}

// —— Tools ——
const tool = (name, title, description, properties, required, run, tooLarge) => ({
  name,
  title,
  description,
  inputSchema: {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  },
  annotations: ANNOTATIONS,
  run,
  tooLarge,
});

const userTool = (name, title, description, type) =>
  tool(name, title, description, { user }, ["user"], (a) => info({ type, user: a.user }));

const userListTool = (name, title, description, type) =>
  tool(name, title, description, { user, ...page }, ["user"], async (a) => shape(await info({ type, user: a.user }), a));

const SPEC = [
  // —— Market / perp meta ——
  tool(
    "get_all_mids",
    "All mid prices",
    "Use for current mid prices. Returns {coin: mid} (last trade when the book is empty); pass coins to filter.",
    { dex, coins },
    [],
    async (a) => {
      const mids = await info({ type: "allMids", ...pick(a, ["dex"]) });
      const set = wanted(a);
      return set ? Object.fromEntries(Object.entries(mids).filter(([k]) => set.has(k.toLowerCase()))) : mids;
    },
    "pass coins",
  ),
  tool(
    "get_l2_book",
    "Order book",
    "Use for bid/ask depth on one coin. Returns {coin, time, levels: [bids, asks]}, up to 20 levels per side.",
    {
      coin,
      nSigFigs: {
        type: "integer",
        enum: [2, 3, 4, 5],
        description: "Aggregate prices to this many significant figures; omit for full precision.",
      },
      mantissa: { type: "integer", enum: [1, 2, 5], description: "Only with nSigFigs=5." },
    },
    ["coin"],
    (a) => {
      if (a.mantissa != null && a.nSigFigs !== 5) throw new ToolError("mantissa requires nSigFigs=5");
      return info({ type: "l2Book", coin: a.coin, ...pick(a, ["nSigFigs", "mantissa"]) });
    },
  ),
  tool(
    "get_recent_trades",
    "Recent trades",
    "Use for the latest prints on one coin. Returns paged trades (px, sz, side, time, users).",
    { coin, ...page },
    ["coin"],
    async (a) => shape(await info({ type: "recentTrades", coin: a.coin }), a),
  ),
  tool(
    "get_meta",
    "Perp metadata",
    "Use for perp names, szDecimals, maxLeverage and margin table ids. Returns {universe, marginTables}.",
    { dex },
    [],
    (a) => info({ type: "meta", ...pick(a, ["dex"]) }),
  ),
  tool(
    "get_meta_and_asset_ctxs",
    "Perp market stats",
    "Use for mark/oracle price, funding, open interest and 24h volume per perp. Returns paged rows merging meta and context; pass coins to filter.",
    { dex, coins, ...page },
    [],
    async (a) => {
      const [meta, ctxs] = await info({ type: "metaAndAssetCtxs", ...pick(a, ["dex"]) });
      const set = wanted(a);
      const rows = meta.universe.map((u, i) => ({ ...u, ...ctxs[i] })).filter((r) => matches(set, r.name));
      return shape(rows, a, "pass coins or limit/offset");
    },
  ),
  tool(
    "get_all_perp_metas",
    "All perp dex metadata",
    "Use for perp metadata across every dex including HIP-3. Returns one meta per dex, paged; prefer get_meta with dex for one dex.",
    { ...page },
    [],
    async (a) => shape(await info({ type: "allPerpMetas" }), a, "pass offset to page, or use get_meta with dex"),
  ),
  tool(
    "get_perp_dexs",
    "HIP-3 perp dexs",
    "Use to list builder-deployed perp dexs (name, deployer, OI caps). Paged; the first item (null) is the main dex.",
    { ...page },
    [],
    async (a) => shape(await info({ type: "perpDexs" }), a),
  ),
  tool(
    "get_perp_dex_limits",
    "Perp dex limits",
    "Use for the OI and transfer caps of one HIP-3 dex.",
    { dex: { type: "string", description: 'HIP-3 dex name, e.g. "xyz" (not empty).' } },
    ["dex"],
    (a) => info({ type: "perpDexLimits", dex: a.dex }),
  ),
  tool(
    "get_perp_dex_status",
    "Perp dex status",
    "Use for a perp dex's total net deposit and status.",
    { dex },
    [],
    (a) => info({ type: "perpDexStatus", dex: a.dex ?? "" }),
  ),
  tool(
    "get_perps_at_open_interest_cap",
    "Perps at OI cap",
    "Use to see which perps are at their open-interest cap. Returns paged coin names.",
    { dex, ...page },
    [],
    async (a) => shape(await info({ type: "perpsAtOpenInterestCap", ...pick(a, ["dex"]) }), a),
  ),
  tool(
    "get_perp_deploy_auction_status",
    "Perp deploy auction",
    "Use for the HIP-3 perp deploy gas auction status.",
    {},
    [],
    () => info({ type: "perpDeployAuctionStatus" }),
  ),
  tool(
    "get_perp_annotation",
    "Perp annotation",
    "Use for one perp's category and description (null when it has none).",
    { coin },
    ["coin"],
    (a) => info({ type: "perpAnnotation", coin: a.coin }),
  ),
  tool(
    "get_perp_categories",
    "Perp categories",
    "Use for [coin, category] pairs (crypto, stocks, commodities…). Paged.",
    { ...page },
    [],
    async (a) => shape(await info({ type: "perpCategories" }), a),
  ),
  tool(
    "get_perp_concise_annotations",
    "Perp concise annotations",
    "Use for [coin, {category, keywords}] pairs. Paged.",
    { ...page },
    [],
    async (a) => shape(await info({ type: "perpConciseAnnotations" }), a),
  ),
  tool(
    "get_margin_table",
    "Margin table",
    "Use for the leverage tiers of a margin table (marginTableId from get_meta).",
    { id: { type: "integer", description: "marginTableId from get_meta." } },
    ["id"],
    (a) => info({ type: "marginTable", id: a.id }),
  ),
  tool(
    "get_candles",
    "Candles",
    `Use for OHLCV bars. Defaults to the last 100 intervals; at most ${MAX_CANDLES} candles per call.`,
    {
      coin,
      interval: { type: "string", enum: Object.keys(INTERVAL_MS), description: "Candle interval." },
      startTime: { type: "integer", description: "Start, ms since epoch (inclusive); default endTime minus 100 intervals." },
      endTime,
    },
    ["coin", "interval"],
    (a) => {
      const step = INTERVAL_MS[a.interval];
      const end = a.endTime ?? Date.now();
      const start = a.startTime ?? end - 100 * step;
      const count = Math.ceil((end - start) / step);
      if (count > MAX_CANDLES) {
        throw new ToolError(
          `range covers ${count} ${a.interval} candles; max ${MAX_CANDLES} per call. Narrow startTime/endTime or use a larger interval.`,
        );
      }
      const req = { coin: a.coin, interval: a.interval, startTime: start };
      if (a.endTime != null) req.endTime = a.endTime;
      return info({ type: "candleSnapshot", req });
    },
  ),
  tool(
    "get_funding_history",
    "Funding history",
    "Use for one coin's past hourly funding rates. Paged, oldest first.",
    { coin, startTime, endTime, ...page },
    ["coin"],
    async (a) => shape(await info({ type: "fundingHistory", coin: a.coin, ...since(a) }), a),
  ),
  tool(
    "get_predicted_fundings",
    "Predicted funding",
    "Use to compare the next funding rate on Hyperliquid, Binance and Bybit. Paged [coin, venues] rows; pass coins to filter.",
    { coins, ...page },
    [],
    async (a) => {
      const set = wanted(a);
      const rows = (await info({ type: "predictedFundings" })).filter((r) => matches(set, r[0]));
      return shape(rows, a, "pass coins or limit/offset");
    },
  ),
  tool(
    "get_exchange_status",
    "Exchange status",
    "Use to check exchange special statuses and server time.",
    {},
    [],
    () => info({ type: "exchangeStatus" }),
  ),

  // —— Spot / outcomes / borrow-lend ——
  tool(
    "get_spot_meta",
    "Spot pairs",
    "Use to map spot pairs (PURR/USDC, @107) to base/quote tokens and tokenIds. Paged rows; pass coins to match a pair or base token name.",
    { coins, ...page },
    [],
    async (a) => {
      const set = wanted(a);
      const rows = spotPairs(await info({ type: "spotMeta" })).filter((r) => spotMatches(set, r));
      return shape(rows, a, "pass coins or limit/offset");
    },
  ),
  tool(
    "get_spot_meta_and_asset_ctxs",
    "Spot market stats",
    "Use for spot mark/mid price, 24h volume and supply. Paged rows; pass coins to match a pair or base token name.",
    { coins, ...page },
    [],
    async (a) => {
      const [meta, ctxs] = await info({ type: "spotMetaAndAssetCtxs" });
      const pairs = new Map(spotPairs(meta).map((p) => [p.name, p]));
      const set = wanted(a);
      const rows = ctxs.map((c) => ({ ...pairs.get(c.coin), ...c })).filter((r) => spotMatches(set, r));
      return shape(rows, a, "pass coins or limit/offset");
    },
  ),
  tool(
    "get_token_details",
    "Spot token details",
    "Use for one spot token's supply, mid and mark price.",
    {
      tokenId: {
        type: "string",
        pattern: "^0x[0-9a-fA-F]{32}$",
        description: "Token id (0x + 32 hex), e.g. baseTokenId from get_spot_meta.",
      },
    },
    ["tokenId"],
    (a) => info({ type: "tokenDetails", tokenId: a.tokenId }),
  ),
  tool(
    "get_spot_pair_deploy_auction_status",
    "Spot pair deploy auction",
    "Use for the spot pair deploy gas auction status.",
    {},
    [],
    () => info({ type: "spotPairDeployAuctionStatus" }),
  ),
  userTool(
    "get_spot_deploy_state",
    "Spot deploy state",
    "Use for a spot token deployer's auction and genesis state.",
    "spotDeployState",
  ),
  userTool(
    "get_spot_clearinghouse_state",
    "Spot balances",
    "Use for a wallet's spot balances (the source of truth under unified or portfolio margin).",
    "spotClearinghouseState",
  ),
  tool(
    "get_outcome_meta",
    "HIP-4 outcomes",
    "Use for HIP-4 outcome markets. Returns questions, deployers and paged outcomes.",
    { ...page },
    [],
    async (a) => {
      const { outcomes, ...rest } = await info({ type: "outcomeMeta" });
      return { ...rest, outcomes: shape(outcomes, a, undefined, JSON.stringify(rest).length) };
    },
  ),
  tool(
    "get_settled_outcome",
    "Settled outcome",
    "Use for a settled HIP-4 outcome's spec and settlement (null when not settled).",
    { outcome: { type: "integer", description: "Outcome id from get_outcome_meta." } },
    ["outcome"],
    (a) => info({ type: "settledOutcome", outcome: a.outcome }),
  ),
  tool(
    "get_all_borrow_lend_reserve_states",
    "Borrow/lend reserves",
    "Use for supply/borrow rates and utilization of every borrow/lend token. Paged [tokenIndex, state] rows.",
    { ...page },
    [],
    async (a) => shape(await info({ type: "allBorrowLendReserveStates" }), a),
  ),
  tool(
    "get_borrow_lend_reserve_state",
    "Borrow/lend reserve",
    "Use for one token's borrow/lend rates and utilization.",
    { token: { type: "integer", minimum: 0, description: "Token index (0 = USDC)." } },
    ["token"],
    (a) => info({ type: "borrowLendReserveState", token: a.token }),
  ),
  userTool(
    "get_borrow_lend_user_state",
    "Borrow/lend positions",
    "Use for a wallet's borrow/lend positions and health.",
    "borrowLendUserState",
  ),

  // —— User reads ——
  tool(
    "get_clearinghouse_state",
    "Perp account",
    "Use for a wallet's perp positions, margin summary and withdrawable balance.",
    { user, dex },
    ["user"],
    (a) => info({ type: "clearinghouseState", user: a.user, ...pick(a, ["dex"]) }),
    "pass dex",
  ),
  tool(
    "get_open_orders",
    "Open orders",
    "Use for a wallet's resting orders. Paged.",
    { user, dex, ...page },
    ["user"],
    async (a) => shape(await info({ type: "openOrders", user: a.user, ...pick(a, ["dex"]) }), a),
  ),
  tool(
    "get_frontend_open_orders",
    "Open orders with triggers",
    "Use for a wallet's resting orders including trigger, TP/SL and order type fields. Paged.",
    { user, dex, ...page },
    ["user"],
    async (a) => shape(await info({ type: "frontendOpenOrders", user: a.user, ...pick(a, ["dex"]) }), a),
  ),
  userListTool(
    "get_historical_orders",
    "Order history",
    "Use for a wallet's past orders (up to 2000 most recent). Paged, newest first.",
    "historicalOrders",
  ),
  tool(
    "get_user_fills",
    "Recent fills",
    "Use for a wallet's trade fills (up to 2000 most recent). Paged, newest first.",
    {
      user,
      aggregateByTime: { type: "boolean", description: "Merge partial fills of one order at the same time." },
      ...page,
    },
    ["user"],
    async (a) => shape(await info({ type: "userFills", user: a.user, ...pick(a, ["aggregateByTime"]) }), a),
  ),
  tool(
    "get_user_fills_by_time",
    "Fills by time",
    "Use for a wallet's fills in a time range (upstream returns up to 2000 per call). Paged.",
    {
      user,
      startTime,
      endTime,
      aggregateByTime: { type: "boolean", description: "Merge partial fills of one order at the same time." },
      ...page,
    },
    ["user"],
    async (a) =>
      shape(await info({ type: "userFillsByTime", user: a.user, ...since(a), ...pick(a, ["aggregateByTime"]) }), a),
  ),
  tool(
    "get_user_funding",
    "Funding payments",
    "Use for a wallet's funding payments in a time range. Paged.",
    { user, startTime, endTime, ...page },
    ["user"],
    async (a) => shape(await info({ type: "userFunding", user: a.user, ...since(a) }), a),
  ),
  tool(
    "get_user_non_funding_ledger_updates",
    "Ledger updates",
    "Use for a wallet's deposits, transfers, withdrawals and liquidations in a time range. Paged.",
    { user, startTime, endTime, ...page },
    ["user"],
    async (a) => shape(await info({ type: "userNonFundingLedgerUpdates", user: a.user, ...since(a) }), a),
  ),
  userListTool(
    "get_user_twap_slice_fills",
    "TWAP slice fills",
    "Use for a wallet's TWAP slice fills (up to 2000 most recent). Paged.",
    "userTwapSliceFills",
  ),
  tool(
    "get_order_status",
    "Order status",
    "Use for one order's status by order id or client order id.",
    {
      user,
      oid: {
        description: "Order id (integer) or client order id (0x + 32 hex string).",
        oneOf: [{ type: "integer" }, { type: "string" }],
      },
    },
    ["user", "oid"],
    (a) => info({ type: "orderStatus", user: a.user, oid: a.oid }),
  ),
  tool(
    "get_active_asset_data",
    "Active asset data",
    "Use for a wallet's leverage, max trade sizes and available-to-trade on one coin.",
    { user, coin },
    ["user", "coin"],
    (a) => info({ type: "activeAssetData", user: a.user, coin: a.coin }),
  ),
  userTool("get_user_rate_limit", "Rate limit", "Use for a wallet's request cap, requests used and volume.", "userRateLimit"),
  userTool(
    "get_user_role",
    "Account role",
    'Use to tell whether an address is a "user", "agent", "vault", "subAccount" or "missing".',
    "userRole",
  ),
  userTool(
    "get_user_fees",
    "Fees",
    "Use for a wallet's fee rates, fee schedule tiers, staking/referral discounts and daily volume.",
    "userFees",
  ),
  tool(
    "get_portfolio",
    "Portfolio history",
    "Use for a wallet's account value and PnL history per period (day, week, month, allTime, perp*).",
    { user, period },
    ["user"],
    async (a) => {
      const periods = await info({ type: "portfolio", user: a.user });
      if (!a.period) return periods;
      const hit = periods.find(([p]) => p === a.period);
      return { period: a.period, ...(hit?.[1] ?? {}) };
    },
    "pass period",
  ),
  tool(
    "get_sub_accounts",
    "Sub-accounts",
    "Use for a master wallet's sub-accounts with their perp and spot state. Paged.",
    { user, ...page },
    ["user"],
    async (a) => shape((await info({ type: "subAccounts", user: a.user })) ?? [], a),
  ),
  userListTool(
    "get_extra_agents",
    "API agents",
    "Use for a wallet's named API agent wallets (address, validUntil). Paged.",
    "extraAgents",
  ),
  userTool("get_referral", "Referral", "Use for a wallet's referral code, rewards and referrer.", "referral"),
  userTool(
    "get_user_abstraction",
    "Account abstraction",
    'Use for a wallet\'s account mode: "unifiedAccount", "portfolioMargin", "disabled", "default" or "dexAbstraction".',
    "userAbstraction",
  ),
  userTool(
    "get_user_dex_abstraction",
    "HIP-3 dex abstraction",
    "Use to check whether HIP-3 dex abstraction is on for a wallet (boolean).",
    "userDexAbstraction",
  ),
  userListTool(
    "get_approved_builders",
    "Approved builders",
    "Use for the builder addresses a wallet has approved. Paged.",
    "approvedBuilders",
  ),
  tool(
    "get_max_builder_fee",
    "Max builder fee",
    "Use for the max fee (tenths of a basis point) a wallet approved for one builder.",
    { user, builder: { type: "string", pattern: ADDRESS, description: "Builder address (0x + 40 hex)." } },
    ["user", "builder"],
    (a) => info({ type: "maxBuilderFee", user: a.user, builder: a.builder }),
  ),

  // —— Vault / staking ——
  tool(
    "get_vault_details",
    "Vault details",
    "Use for a vault's APR, leader, paged followers and (with period) portfolio history.",
    {
      vaultAddress: { type: "string", pattern: ADDRESS, description: "Vault address (0x + 40 hex)." },
      user: { ...user, description: "Optional follower address; adds followerState for that wallet." },
      period: { ...period, description: "Include portfolio history for this period only; omitted by default." },
      ...page,
    },
    ["vaultAddress"],
    async (a) => {
      const { portfolio, followers, ...vault } = await info({
        type: "vaultDetails",
        vaultAddress: a.vaultAddress,
        ...pick(a, ["user"]),
      });
      const out = { ...vault };
      if (a.period) {
        const hit = (portfolio ?? []).find(([p]) => p === a.period);
        out.portfolio = { period: a.period, ...(hit?.[1] ?? {}) };
      }
      out.followers = shape(followers ?? [], a, undefined, JSON.stringify(out).length);
      return out;
    },
  ),
  userListTool(
    "get_user_vault_equities",
    "Vault equities",
    "Use for a wallet's vault deposits (vaultAddress, equity). Paged.",
    "userVaultEquities",
  ),
  userListTool(
    "get_delegations",
    "Staking delegations",
    "Use for a wallet's staking delegations (validator, amount, lockedUntil). Paged.",
    "delegations",
  ),
  userTool(
    "get_delegator_summary",
    "Staking summary",
    "Use for a wallet's delegated, undelegated and pending-withdrawal stake.",
    "delegatorSummary",
  ),
  userListTool(
    "get_delegator_history",
    "Staking history",
    "Use for a wallet's stake, unstake and delegation events. Paged.",
    "delegatorHistory",
  ),
  userListTool(
    "get_delegator_rewards",
    "Staking rewards",
    "Use for a wallet's delegation and commission rewards. Paged.",
    "delegatorRewards",
  ),
  tool(
    "get_validator_summaries",
    "Validators",
    "Use for validators' stake, commission, jail status and recent blocks. Paged.",
    { ...page },
    [],
    async (a) => shape(await info({ type: "validatorSummaries" }), a),
  ),
];

const TOOLS = SPEC.map(({ run, tooLarge, ...def }) => def);
const BY_NAME = new Map(SPEC.map((t) => [t.name, t]));

// —— Argument validation (the inputSchema is the source of truth) ——
function typeOk(type, v) {
  switch (type) {
    case "string":
      return typeof v === "string";
    case "integer":
      return Number.isInteger(v);
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "boolean":
      return typeof v === "boolean";
    case "array":
      return Array.isArray(v);
    default:
      return true;
  }
}

function checkValue(key, prop, v) {
  const types = prop.oneOf ? prop.oneOf.map((s) => s.type) : [prop.type];
  if (!types.some((t) => typeOk(t, v))) throw new ToolError(`${key} must be ${types.join(" or ")}`);
  if (prop.enum && !prop.enum.includes(v)) throw new ToolError(`${key} must be one of: ${prop.enum.join(", ")}`);
  if (prop.pattern && typeof v === "string" && !new RegExp(prop.pattern).test(v)) {
    throw new ToolError(
      prop.pattern === ADDRESS
        ? `${key} must be a 0x-prefixed 40-hex address${key === "user" ? " (master/sub-account, not agent wallet)" : ""}`
        : `${key} must match ${prop.pattern}`,
    );
  }
  if (prop.minimum !== undefined && v < prop.minimum) throw new ToolError(`${key} must be >= ${prop.minimum}`);
  if (prop.maximum !== undefined && v > prop.maximum) throw new ToolError(`${key} must be <= ${prop.maximum}`);
  if (prop.items && Array.isArray(v)) v.forEach((x, i) => checkValue(`${key}[${i}]`, prop.items, x));
}

function validate(schema, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new ToolError("arguments must be an object");
  for (const k of schema.required ?? []) {
    if (args[k] === undefined || args[k] === null || args[k] === "") throw new ToolError(`${k} is required`);
  }
  const allowed = Object.keys(schema.properties);
  for (const [k, v] of Object.entries(args)) {
    if (!allowed.includes(k)) throw new ToolError(`unknown argument "${k}"; allowed: ${allowed.join(", ") || "none"}`);
    if (v !== undefined && v !== null) checkValue(k, schema.properties[k], v);
  }
}

// —— Errors ——
function hintFor(e, args) {
  if (e.status === 429) return "rate limited; wait a few seconds and make fewer calls";
  if (e.status === 422 && (args.user || args.vaultAddress || args.builder)) {
    return "user must be a 0x-prefixed 40-hex address (master/sub-account, not agent)";
  }
  if (e.status === 422) return "request rejected; check argument names and types";
  if (e.status >= 500 && args.coin) {
    return "unknown coin; check get_meta names, HIP-3 coins are prefixed like xyz:TSLA, spot uses PURR/USDC or @index";
  }
  return "";
}

function errorText(e, args) {
  if (e instanceof ToolError) return e.message;
  if (e?.name === "TimeoutError" || e?.name === "AbortError") {
    return `upstream timed out after ${TIMEOUT_MS / 1000}s; retry or narrow the request`;
  }
  let text = e?.message || String(e);
  if (e?.cause?.code) text += ` (${e.cause.code})`;
  if (e?.body !== undefined) text += `: ${JSON.stringify(e.body).slice(0, 500)}`;
  const hint = hintFor(e, args);
  if (hint) text += `\nHint: ${hint}`;
  return text;
}

// —— JSON-RPC over stdio ——
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
function ok(id, result) {
  send({ jsonrpc: "2.0", id, result });
}
function fail(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}
function toolError(text) {
  return { content: [{ type: "text", text }], isError: true };
}

async function callTool(name, args) {
  const spec = BY_NAME.get(name);
  try {
    validate(spec.inputSchema, args);
    const text = JSON.stringify(await spec.run(args)) ?? "null";
    if (text.length > MAX_CHARS) {
      return toolError(`result too large (${text.length} chars); ${spec.tooLarge ?? "narrow the request"}`);
    }
    return { content: [{ type: "text", text }] };
  } catch (e) {
    return toolError(errorText(e, args && typeof args === "object" ? args : {}));
  }
}

async function handle(msg) {
  if (!msg || typeof msg !== "object") return;
  const { id, method, params } = msg;
  if (method?.startsWith("notifications/")) return;
  if (id === undefined || id === null) return;

  if (method === "initialize") {
    const requested = params?.protocolVersion;
    ok(id, {
      protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
      capabilities: { tools: {} },
      serverInfo: { name: "hyperliquid-info", version: VERSION },
      instructions: INSTRUCTIONS,
    });
    return;
  }
  if (method === "ping") {
    ok(id, {});
    return;
  }
  if (method === "tools/list") {
    ok(id, { tools: TOOLS });
    return;
  }
  if (method === "tools/call") {
    if (!BY_NAME.has(params?.name)) {
      fail(id, -32602, `Unknown tool: ${params?.name}`);
      return;
    }
    ok(id, await callTool(params.name, params.arguments ?? {}));
    return;
  }
  fail(id, -32601, `Method not found: ${method}`);
}

const pending = new Set();
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const t = line.trim();
  if (!t) return;
  let msg;
  try {
    msg = JSON.parse(t);
  } catch {
    return;
  }
  const p = handle(msg).catch((e) => {
    if (msg?.id !== undefined && msg?.id !== null) fail(msg.id, -32603, e?.message || String(e));
  });
  pending.add(p);
  p.finally(() => pending.delete(p));
});
rl.on("close", () => {
  Promise.allSettled([...pending]).then(() => process.stdout.write("", () => process.exit(0)));
});
