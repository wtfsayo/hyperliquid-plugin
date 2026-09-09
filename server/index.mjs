#!/usr/bin/env node
/**
 * Zero-dep stdio MCP for Hyperliquid Info API (POST /info only).
 * No /exchange, no signing, no private keys.
 * Version 0.2.0 — expanded market / user / vault / staking / spot tools.
 */

import { createInterface } from "node:readline";

const VERSION = "0.2.0";
const BASE = (process.env.HYPERLIQUID_API_URL || "https://api.hyperliquid.xyz").replace(/\/$/, "");

const TOOLS = [
  // —— Market / meta (perp) ——
  {
    name: "get_all_mids",
    description: "MidMap: mid price string for every coin (book empty → last trade).",
    inputSchema: {
      type: "object",
      properties: { dex: { type: "string", description: "Perp dex name; omit for first perp dex." } },
      additionalProperties: false,
    },
  },
  {
    name: "get_l2_book",
    description: "L2Book for one coin — levels[0]=bids, levels[1]=asks (≤20/side).",
    inputSchema: {
      type: "object",
      properties: {
        coin: { type: "string", description: 'Perp name e.g. "BTC", or spot "PURR/USDC" / "@107".' },
        nSigFigs: { type: "number", description: "Aggregate to 2–5 sig figs; omit for full precision." },
        mantissa: { type: "number", description: "Only with nSigFigs=5; 1, 2, or 5." },
      },
      required: ["coin"],
      additionalProperties: false,
    },
  },
  {
    name: "get_recent_trades",
    description: "RecentTrades[] for a coin (px, sz, side, time, tid, users).",
    inputSchema: {
      type: "object",
      properties: { coin: { type: "string" } },
      required: ["coin"],
      additionalProperties: false,
    },
  },
  {
    name: "get_meta",
    description: "Perp AssetMeta universe + margin tables (szDecimals, maxLeverage).",
    inputSchema: {
      type: "object",
      properties: { dex: { type: "string", description: "Perp dex name; omit for first perp dex." } },
      additionalProperties: false,
    },
  },
  {
    name: "get_meta_and_asset_ctxs",
    description: "[meta, AssetCtx[]] — markPx, oraclePx, funding, openInterest, dayNtlVlm.",
    inputSchema: {
      type: "object",
      properties: { dex: { type: "string", description: "Perp dex name; omit for first perp dex." } },
      additionalProperties: false,
    },
  },
  {
    name: "get_all_perp_metas",
    description: "allPerpMetas: meta (+ contexts) for every perp dex including HIP-3.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_perp_dexs",
    description: "perpDexs: list of builder-deployed perp dex descriptors (index 0 is null = main).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_perp_dex_limits",
    description: "perpDexLimits for a builder-deployed dex (dex name required; empty string not allowed).",
    inputSchema: {
      type: "object",
      properties: { dex: { type: "string", description: 'e.g. "xyz"' } },
      required: ["dex"],
      additionalProperties: false,
    },
  },
  {
    name: "get_perp_dex_status",
    description: "perpDexStatus — totalNetDeposit etc. dex empty string = first perp dex.",
    inputSchema: {
      type: "object",
      properties: { dex: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "get_perps_at_open_interest_cap",
    description: "Coin names currently at open-interest cap.",
    inputSchema: {
      type: "object",
      properties: { dex: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "get_perp_deploy_auction_status",
    description: "Dutch auction status for perp deploy gas.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_perp_annotation",
    description: "Category/description annotation for one perp coin.",
    inputSchema: {
      type: "object",
      properties: { coin: { type: "string" } },
      required: ["coin"],
      additionalProperties: false,
    },
  },
  {
    name: "get_perp_categories",
    description: "[[coin, category], ...] mapping across HIP-3 / annotated perps.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_perp_concise_annotations",
    description: "Concise category/keywords annotations for perps.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_margin_table",
    description: "Margin table by numeric id (from meta.marginTables).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "integer", description: "marginTableId" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_candles",
    description: "Candle[] OHLCV. Intervals: 1m,3m,5m,15m,30m,1h,2h,4h,8h,12h,1d,3d,1w,1M.",
    inputSchema: {
      type: "object",
      properties: {
        coin: { type: "string" },
        interval: { type: "string", description: 'e.g. "15m", "1h".' },
        startTime: { type: "integer", description: "ms inclusive" },
        endTime: { type: "integer", description: "ms inclusive; default now" },
      },
      required: ["coin", "interval", "startTime"],
      additionalProperties: false,
    },
  },
  {
    name: "get_funding_history",
    description: "FundingRate[] historical funding for a coin.",
    inputSchema: {
      type: "object",
      properties: {
        coin: { type: "string" },
        startTime: { type: "integer", description: "ms inclusive" },
        endTime: { type: "integer" },
      },
      required: ["coin", "startTime"],
      additionalProperties: false,
    },
  },
  {
    name: "get_predicted_fundings",
    description: "Predicted funding rates across venues (first perp dex only).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_exchange_status",
    description: "ExchangeStatus — specialStatuses + server time.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_liquidatable",
    description: "Currently liquidatable addresses/positions (may be empty).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },

  // —— Spot / outcomes / borrow-lend ——
  {
    name: "get_spot_meta",
    description: "SpotMeta — tokens[] + universe[] (spot pair indices).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_spot_meta_and_asset_ctxs",
    description: "[SpotMeta, SpotAssetCtx[]] — mid/mark/day volume for spot pairs.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_token_details",
    description: "TokenDetails for a spot tokenId (34-char hex from spotMeta.tokens).",
    inputSchema: {
      type: "object",
      properties: { tokenId: { type: "string", description: "e.g. 0xc1fb593aeffbeb02f85e0308e9956a90" } },
      required: ["tokenId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_spot_pair_deploy_auction_status",
    description: "Dutch auction status for spot pair deploy.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_spot_deploy_state",
    description: "Spot deploy auction / genesis state for a user (deployer view).",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_spot_clearinghouse_state",
    description: "Spot balances for a user (source of truth under unified/portfolio margin).",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_outcome_meta",
    description: "HIP-4 outcomeMeta — outcomes / questions / deployers.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_settled_outcome",
    description: "SettledOutcome details by outcome id.",
    inputSchema: {
      type: "object",
      properties: { outcome: { type: "integer" } },
      required: ["outcome"],
      additionalProperties: false,
    },
  },
  {
    name: "get_all_borrow_lend_reserve_states",
    description: "[[tokenIndex, BorrowLendReserveState], ...] for all tokens.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_borrow_lend_reserve_state",
    description: "Borrow/lend reserve state for one token index.",
    inputSchema: {
      type: "object",
      properties: { token: { type: "integer", description: "token index (0 = USDC)" } },
      required: ["token"],
      additionalProperties: false,
    },
  },
  {
    name: "get_borrow_lend_user_state",
    description: "User borrow/lend positions + health.",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },

  // —— User reads ——
  {
    name: "get_clearinghouse_state",
    description: "ClearinghouseState — marginSummary, assetPositions, withdrawable. Use master/sub address, not agent wallet.",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" }, dex: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_open_orders",
    description: "OpenOrder[] resting orders for a user.",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" }, dex: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_frontend_open_orders",
    description: "FrontendOpenOrder[] — open orders with trigger/TP-SL/orderType fields.",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" }, dex: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_historical_orders",
    description: "Up to 2000 most recent historical orders for a user.",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_user_fills",
    description: "UserFill[] — up to 2000 most recent fills.",
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string" },
        aggregateByTime: { type: "boolean" },
      },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_user_fills_by_time",
    description: "UserFill[] in [startTime,endTime]; ≤2000 per page, ≤10000 recent available.",
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string" },
        startTime: { type: "integer", description: "ms inclusive" },
        endTime: { type: "integer" },
        aggregateByTime: { type: "boolean" },
      },
      required: ["user", "startTime"],
      additionalProperties: false,
    },
  },
  {
    name: "get_user_funding",
    description: "User funding payment history (ledger) since startTime.",
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string" },
        startTime: { type: "integer" },
        endTime: { type: "integer" },
      },
      required: ["user", "startTime"],
      additionalProperties: false,
    },
  },
  {
    name: "get_user_non_funding_ledger_updates",
    description: "Deposits, transfers, withdrawals, liquidations (non-funding ledger).",
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string" },
        startTime: { type: "integer" },
        endTime: { type: "integer" },
      },
      required: ["user", "startTime"],
      additionalProperties: false,
    },
  },
  {
    name: "get_user_twap_slice_fills",
    description: "Up to 2000 most recent TWAP slice fills.",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_order_status",
    description: "Order status by oid (u64) or cloid (16-byte hex).",
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string" },
        oid: {
          description: "Order id (number) or client order id (hex string)",
          oneOf: [{ type: "integer" }, { type: "string" }],
        },
      },
      required: ["user", "oid"],
      additionalProperties: false,
    },
  },
  {
    name: "get_active_asset_data",
    description: "ActiveAssetData — leverage, maxTradeSzs, availableToTrade, markPx for user+coin.",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" }, coin: { type: "string" } },
      required: ["user", "coin"],
      additionalProperties: false,
    },
  },
  {
    name: "get_user_rate_limit",
    description: "UserRateLimit — cumVlm, nRequestsUsed/Cap/Surplus.",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_user_role",
    description: 'UserRole — "user"|"agent"|"vault"|"subAccount"|"missing".',
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_user_fees",
    description: "UserFees + feeSchedule tiers, staking/referral discounts, daily volume.",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_portfolio",
    description: "Portfolio histories: day/week/month/allTime (+ perp* variants).",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_sub_accounts",
    description: "SubAccount[] for a master user (clearinghouse + spot state each).",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_extra_agents",
    description: "ExtraAgents[] — named API agents (address, validUntil) for a user.",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_referral",
    description: "Referral info — code, rewards, referredBy, referrerState.",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_user_abstraction",
    description: 'Account abstraction mode: "unifiedAccount"|"portfolioMargin"|"disabled"|"default"|"dexAbstraction".',
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_user_dex_abstraction",
    description: "Whether HIP-3 DEX abstraction is enabled for the user (bool).",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_approved_builders",
    description: "Builder addresses approved by the user.",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_max_builder_fee",
    description: "Max builder fee approved (tenths of a basis point) for user→builder.",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" }, builder: { type: "string" } },
      required: ["user", "builder"],
      additionalProperties: false,
    },
  },

  // —— Vault / staking ——
  {
    name: "get_vault_details",
    description: "VaultDetails — APR, followers, portfolio, relationship. Optional user for followerState.",
    inputSchema: {
      type: "object",
      properties: {
        vaultAddress: { type: "string" },
        user: { type: "string", description: "Optional — follower perspective" },
      },
      required: ["vaultAddress"],
      additionalProperties: false,
    },
  },
  {
    name: "get_user_vault_equities",
    description: "UserVaultEquity[] — vaultAddress + equity for a user.",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_vault_summaries",
    description: "VaultSummaries list (may be empty on some deployments).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_delegations",
    description: "Staking delegations for a user (validator, amount, lockedUntil).",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_delegator_summary",
    description: "DelegatorSummary — delegated / undelegated / pending withdrawals.",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_delegator_history",
    description: "DelegatorHistory — stake/unstake events.",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_delegator_rewards",
    description: "DelegatorRewards — delegation/commission rewards over time.",
    inputSchema: {
      type: "object",
      properties: { user: { type: "string" } },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_validator_summaries",
    description: "ValidatorSummary[] — stake, commission, jailed, recent blocks, stats.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

async function info(body) {
  const res = await fetch(`${BASE}/info`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": `hyperliquid-info-mcp/${VERSION}`,
    },
    body: JSON.stringify(body),
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

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") out[k] = obj[k];
  }
  return out;
}

function req(args, ...keys) {
  for (const k of keys) {
    if (args[k] === undefined || args[k] === null || args[k] === "") {
      throw new Error(`${k} is required`);
    }
  }
}

async function callTool(name, args = {}) {
  switch (name) {
    case "get_all_mids":
      return info({ type: "allMids", ...pick(args, ["dex"]) });
    case "get_l2_book":
      req(args, "coin");
      return info({ type: "l2Book", coin: args.coin, ...pick(args, ["nSigFigs", "mantissa"]) });
    case "get_recent_trades":
      req(args, "coin");
      return info({ type: "recentTrades", coin: args.coin });
    case "get_meta":
      return info({ type: "meta", ...pick(args, ["dex"]) });
    case "get_meta_and_asset_ctxs":
      return info({ type: "metaAndAssetCtxs", ...pick(args, ["dex"]) });
    case "get_all_perp_metas":
      return info({ type: "allPerpMetas" });
    case "get_perp_dexs":
      return info({ type: "perpDexs" });
    case "get_perp_dex_limits":
      req(args, "dex");
      return info({ type: "perpDexLimits", dex: args.dex });
    case "get_perp_dex_status":
      return info({ type: "perpDexStatus", dex: args.dex ?? "" });
    case "get_perps_at_open_interest_cap":
      return info({ type: "perpsAtOpenInterestCap", ...pick(args, ["dex"]) });
    case "get_perp_deploy_auction_status":
      return info({ type: "perpDeployAuctionStatus" });
    case "get_perp_annotation":
      req(args, "coin");
      return info({ type: "perpAnnotation", coin: args.coin });
    case "get_perp_categories":
      return info({ type: "perpCategories" });
    case "get_perp_concise_annotations":
      return info({ type: "perpConciseAnnotations" });
    case "get_margin_table":
      req(args, "id");
      return info({ type: "marginTable", id: args.id });
    case "get_candles": {
      req(args, "coin", "interval", "startTime");
      const reqBody = { coin: args.coin, interval: args.interval, startTime: args.startTime };
      if (args.endTime != null) reqBody.endTime = args.endTime;
      return info({ type: "candleSnapshot", req: reqBody });
    }
    case "get_funding_history":
      req(args, "coin", "startTime");
      return info({
        type: "fundingHistory",
        coin: args.coin,
        startTime: args.startTime,
        ...pick(args, ["endTime"]),
      });
    case "get_predicted_fundings":
      return info({ type: "predictedFundings" });
    case "get_exchange_status":
      return info({ type: "exchangeStatus" });
    case "get_liquidatable":
      return info({ type: "liquidatable" });

    case "get_spot_meta":
      return info({ type: "spotMeta" });
    case "get_spot_meta_and_asset_ctxs":
      return info({ type: "spotMetaAndAssetCtxs" });
    case "get_token_details":
      req(args, "tokenId");
      return info({ type: "tokenDetails", tokenId: args.tokenId });
    case "get_spot_pair_deploy_auction_status":
      return info({ type: "spotPairDeployAuctionStatus" });
    case "get_spot_deploy_state":
      req(args, "user");
      return info({ type: "spotDeployState", user: args.user });
    case "get_spot_clearinghouse_state":
      req(args, "user");
      return info({ type: "spotClearinghouseState", user: args.user });
    case "get_outcome_meta":
      return info({ type: "outcomeMeta" });
    case "get_settled_outcome":
      req(args, "outcome");
      return info({ type: "settledOutcome", outcome: args.outcome });
    case "get_all_borrow_lend_reserve_states":
      return info({ type: "allBorrowLendReserveStates" });
    case "get_borrow_lend_reserve_state":
      if (args.token == null) throw new Error("token is required");
      return info({ type: "borrowLendReserveState", token: args.token });
    case "get_borrow_lend_user_state":
      req(args, "user");
      return info({ type: "borrowLendUserState", user: args.user });

    case "get_clearinghouse_state":
      req(args, "user");
      return info({ type: "clearinghouseState", user: args.user, ...pick(args, ["dex"]) });
    case "get_open_orders":
      req(args, "user");
      return info({ type: "openOrders", user: args.user, ...pick(args, ["dex"]) });
    case "get_frontend_open_orders":
      req(args, "user");
      return info({ type: "frontendOpenOrders", user: args.user, ...pick(args, ["dex"]) });
    case "get_historical_orders":
      req(args, "user");
      return info({ type: "historicalOrders", user: args.user });
    case "get_user_fills":
      req(args, "user");
      return info({ type: "userFills", user: args.user, ...pick(args, ["aggregateByTime"]) });
    case "get_user_fills_by_time":
      req(args, "user", "startTime");
      return info({
        type: "userFillsByTime",
        user: args.user,
        startTime: args.startTime,
        ...pick(args, ["endTime", "aggregateByTime"]),
      });
    case "get_user_funding":
      req(args, "user", "startTime");
      return info({
        type: "userFunding",
        user: args.user,
        startTime: args.startTime,
        ...pick(args, ["endTime"]),
      });
    case "get_user_non_funding_ledger_updates":
      req(args, "user", "startTime");
      return info({
        type: "userNonFundingLedgerUpdates",
        user: args.user,
        startTime: args.startTime,
        ...pick(args, ["endTime"]),
      });
    case "get_user_twap_slice_fills":
      req(args, "user");
      return info({ type: "userTwapSliceFills", user: args.user });
    case "get_order_status":
      if (!args.user || args.oid == null) throw new Error("user and oid are required");
      return info({ type: "orderStatus", user: args.user, oid: args.oid });
    case "get_active_asset_data":
      req(args, "user", "coin");
      return info({ type: "activeAssetData", user: args.user, coin: args.coin });
    case "get_user_rate_limit":
      req(args, "user");
      return info({ type: "userRateLimit", user: args.user });
    case "get_user_role":
      req(args, "user");
      return info({ type: "userRole", user: args.user });
    case "get_user_fees":
      req(args, "user");
      return info({ type: "userFees", user: args.user });
    case "get_portfolio":
      req(args, "user");
      return info({ type: "portfolio", user: args.user });
    case "get_sub_accounts":
      req(args, "user");
      return info({ type: "subAccounts", user: args.user });
    case "get_extra_agents":
      req(args, "user");
      return info({ type: "extraAgents", user: args.user });
    case "get_referral":
      req(args, "user");
      return info({ type: "referral", user: args.user });
    case "get_user_abstraction":
      req(args, "user");
      return info({ type: "userAbstraction", user: args.user });
    case "get_user_dex_abstraction":
      req(args, "user");
      return info({ type: "userDexAbstraction", user: args.user });
    case "get_approved_builders":
      req(args, "user");
      return info({ type: "approvedBuilders", user: args.user });
    case "get_max_builder_fee":
      req(args, "user", "builder");
      return info({ type: "maxBuilderFee", user: args.user, builder: args.builder });

    case "get_vault_details":
      req(args, "vaultAddress");
      return info({
        type: "vaultDetails",
        vaultAddress: args.vaultAddress,
        ...pick(args, ["user"]),
      });
    case "get_user_vault_equities":
      req(args, "user");
      return info({ type: "userVaultEquities", user: args.user });
    case "get_vault_summaries":
      return info({ type: "vaultSummaries" });
    case "get_delegations":
      req(args, "user");
      return info({ type: "delegations", user: args.user });
    case "get_delegator_summary":
      req(args, "user");
      return info({ type: "delegatorSummary", user: args.user });
    case "get_delegator_history":
      req(args, "user");
      return info({ type: "delegatorHistory", user: args.user });
    case "get_delegator_rewards":
      req(args, "user");
      return info({ type: "delegatorRewards", user: args.user });
    case "get_validator_summaries":
      return info({ type: "validatorSummaries" });

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
function ok(id, result) {
  send({ jsonrpc: "2.0", id, result });
}
function fail(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  send({ jsonrpc: "2.0", id, error });
}

async function handle(msg) {
  if (!msg || typeof msg !== "object") return;
  const { id, method, params } = msg;
  if (method === "notifications/initialized" || method?.startsWith("notifications/")) return;
  if (id === undefined || id === null) return;

  try {
    if (method === "initialize") {
      ok(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "hyperliquid-info", version: VERSION },
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
      const result = await callTool(params?.name, params?.arguments ?? {});
      ok(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      });
      return;
    }
    fail(id, -32601, `Method not found: ${method}`);
  } catch (e) {
    fail(id, -32000, e?.message || String(e), e?.body);
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const t = line.trim();
  if (!t) return;
  try {
    handle(JSON.parse(t));
  } catch {
    /* ignore bad line */
  }
});
rl.on("close", () => process.exit(0));
