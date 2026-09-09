#!/usr/bin/env node
/**
 * Zero-dep stdio MCP for Hyperliquid Info API (POST /info only).
 * No /exchange, no signing, no private keys.
 */

import { createInterface } from "node:readline";

const BASE = (process.env.HYPERLIQUID_API_URL || "https://api.hyperliquid.xyz").replace(/\/$/, "");

const TOOLS = [
  {
    name: "get_all_mids",
    description: "MidMap: mid price string for every coin (book empty → last trade).",
    inputSchema: {
      type: "object",
      properties: {
        dex: { type: "string", description: "Perp dex name; omit for first perp dex." },
      },
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
    name: "get_meta",
    description: "Perp AssetMeta universe + margin tables (szDecimals, maxLeverage).",
    inputSchema: {
      type: "object",
      properties: {
        dex: { type: "string", description: "Perp dex name; omit for first perp dex." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_meta_and_asset_ctxs",
    description: "[meta, AssetCtx[]] — markPx, oraclePx, funding, openInterest, dayNtlVlm.",
    inputSchema: {
      type: "object",
      properties: {
        dex: { type: "string", description: "Perp dex name; omit for first perp dex." },
      },
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
    name: "get_clearinghouse_state",
    description: "ClearinghouseState for a user — marginSummary, assetPositions, withdrawable. Use master/sub address, not agent wallet.",
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string", description: "0x… address" },
        dex: { type: "string" },
      },
      required: ["user"],
      additionalProperties: false,
    },
  },
  {
    name: "get_open_orders",
    description: "OpenOrder[] resting orders for a user.",
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string" },
        dex: { type: "string" },
      },
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
];

async function info(body) {
  const res = await fetch(`${BASE}/info`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "hyperliquid-info-mcp/0.1.0",
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

async function callTool(name, args = {}) {
  switch (name) {
    case "get_all_mids":
      return info({ type: "allMids", ...pick(args, ["dex"]) });
    case "get_l2_book":
      if (!args.coin) throw new Error("coin is required");
      return info({
        type: "l2Book",
        coin: args.coin,
        ...pick(args, ["nSigFigs", "mantissa"]),
      });
    case "get_meta":
      return info({ type: "meta", ...pick(args, ["dex"]) });
    case "get_meta_and_asset_ctxs":
      return info({ type: "metaAndAssetCtxs", ...pick(args, ["dex"]) });
    case "get_candles": {
      if (!args.coin || !args.interval || args.startTime == null) {
        throw new Error("coin, interval, and startTime are required");
      }
      const req = {
        coin: args.coin,
        interval: args.interval,
        startTime: args.startTime,
      };
      if (args.endTime != null) req.endTime = args.endTime;
      return info({ type: "candleSnapshot", req });
    }
    case "get_clearinghouse_state":
      if (!args.user) throw new Error("user is required");
      return info({ type: "clearinghouseState", user: args.user, ...pick(args, ["dex"]) });
    case "get_open_orders":
      if (!args.user) throw new Error("user is required");
      return info({ type: "openOrders", user: args.user, ...pick(args, ["dex"]) });
    case "get_user_fills":
      if (!args.user) throw new Error("user is required");
      return info({
        type: "userFills",
        user: args.user,
        ...pick(args, ["aggregateByTime"]),
      });
    case "get_order_status":
      if (!args.user || args.oid == null) throw new Error("user and oid are required");
      return info({ type: "orderStatus", user: args.user, oid: args.oid });
    case "get_funding_history":
      if (!args.coin || args.startTime == null) {
        throw new Error("coin and startTime are required");
      }
      return info({
        type: "fundingHistory",
        coin: args.coin,
        startTime: args.startTime,
        ...pick(args, ["endTime"]),
      });
    case "get_predicted_fundings":
      return info({ type: "predictedFundings" });
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
        serverInfo: { name: "hyperliquid-info", version: "0.1.0" },
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
