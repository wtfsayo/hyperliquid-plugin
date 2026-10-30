#!/usr/bin/env node
/**
 * Zero-dep stdio smoke test for server/index.mjs.
 *
 * Offline checks (always run): initialize, tools/list shape, argument validation,
 * fetch timeout, drain-on-close, stdout purity.
 * Network checks (skipped when the API is unreachable or SMOKE_OFFLINE=1): every tool
 * is called with test/fixtures.json args; each result must have no structuredContent
 * (or a plain object), compact text <= 40,000 chars, no isError, and next_offset when truncated.
 *
 * Usage: npm test   (env: HYPERLIQUID_API_URL, SMOKE_OFFLINE=1, SMOKE_DELAY_MS=1200)
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = join(ROOT, "server", "index.mjs");
const FIXTURES = JSON.parse(readFileSync(join(ROOT, "test", "fixtures.json"), "utf8"));
const README = readFileSync(join(ROOT, "README.md"), "utf8");
const BASE = (process.env.HYPERLIQUID_API_URL || "https://api.hyperliquid.xyz").replace(/\/$/, "");
const MAX_CHARS = 40_000;
const DELAY_MS = Number(process.env.SMOKE_DELAY_MS ?? 1200); // stay under the 1200 weight/min IP limit

const failures = [];
let passed = 0;
function check(label, cond, detail = "") {
  if (cond) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
  constructor(env = {}) {
    this.proc = spawn(process.execPath, [SERVER], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "inherit"] });
    this.nextId = 1;
    this.waiting = new Map();
    this.badLines = [];
    this.exited = new Promise((r) => this.proc.on("close", r));
    let buf = "";
    this.proc.stdout.on("data", (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          this.badLines.push(line.slice(0, 200));
          continue;
        }
        this.waiting.get(msg.id)?.(msg);
        this.waiting.delete(msg.id);
      }
    });
  }
  send(method, params) {
    const id = this.nextId++;
    const reply = new Promise((resolve) => this.waiting.set(id, resolve));
    this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return reply;
  }
  call(name, args) {
    return this.send("tools/call", { name, arguments: args });
  }
  async close() {
    this.proc.stdin.end();
    await this.exited;
    check("stdout carries only JSON-RPC lines", this.badLines.length === 0, this.badLines.join(" | "));
  }
}

function textOf(msg) {
  return msg?.result?.content?.[0]?.text ?? "";
}

function checkResult(label, msg) {
  const r = msg?.result;
  if (!r) return check(label, false, `JSON-RPC error ${JSON.stringify(msg?.error)}`);
  const sc = r.structuredContent;
  check(`${label} structuredContent`, sc === undefined || (sc !== null && typeof sc === "object" && !Array.isArray(sc)));
  const text = textOf(msg);
  check(`${label} size`, text.length <= MAX_CHARS, `${text.length} chars`);
  check(`${label} not isError`, r.isError !== true, text.slice(0, 300));
  if (r.isError) return;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return check(`${label} compact JSON text`, false);
  }
  check(`${label} compact JSON text`, text === JSON.stringify(data));
  const pages = [data, ...(data && typeof data === "object" ? Object.values(data) : [])];
  for (const p of pages) {
    if (p && typeof p === "object" && p.truncated === true) {
      check(`${label} next_offset when truncated`, Number.isInteger(p.next_offset));
    }
  }
}

async function online() {
  if (process.env.SMOKE_OFFLINE === "1") return false;
  try {
    const res = await fetch(`${BASE}/info`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "exchangeStatus" }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function callWithRetry(client, name, args) {
  for (let attempt = 0; ; attempt++) {
    const msg = await client.call(name, args);
    if (attempt < 3 && msg?.result?.isError && textOf(msg).includes("HTTP 429")) {
      await sleep(15_000);
      continue;
    }
    return msg;
  }
}

// —— 1. Protocol and tools/list ——
const client = new Client();
const init = await client.send("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "smoke", version: "0" },
});
check("initialize echoes protocolVersion", init.result?.protocolVersion === "2025-06-18");
const instructions = init.result?.instructions ?? "";
check("initialize instructions present and < 600 chars", instructions.length > 0 && instructions.length < 600, `${instructions.length}`);

const tools = (await client.send("tools/list", {})).result?.tools ?? [];
const names = tools.map((t) => t.name);
const heading = README.match(/^## MCP tools \((\d+)\)/m);
check("README tool count matches tools/list", heading && Number(heading[1]) === tools.length, `README ${heading?.[1]} vs ${tools.length}`);
for (const n of names) check(`README lists ${n}`, README.includes(`\`${n}\``));
for (const t of tools) {
  check(`${t.name} title`, typeof t.title === "string" && t.title.length > 0);
  check(`${t.name} readOnlyHint`, t.annotations?.readOnlyHint === true);
  for (const [k, p] of Object.entries(t.inputSchema?.properties ?? {})) {
    check(`${t.name}.${k} has description or enum`, Boolean(p.description || p.enum));
  }
}
const fixtureNames = Object.keys(FIXTURES.calls);
for (const n of names) check(`fixture for ${n}`, fixtureNames.includes(n));
for (const n of fixtureNames) check(`fixture ${n} is a real tool`, names.includes(n));

const unknown = await client.call("no_such_tool", {});
check("unknown tool is a JSON-RPC error", unknown.error?.code === -32602);

// —— 2. Argument validation (no network) ——
for (const e of FIXTURES.errors.filter((e) => !e.network)) {
  const msg = await client.call(e.tool, e.args);
  check(`${e.tool} ${JSON.stringify(e.args)} isError`, msg.result?.isError === true);
  check(`${e.tool} error mentions "${e.expect}"`, textOf(msg).includes(e.expect), textOf(msg));
}

// —— 3. Live calls ——
const live = await online();
if (live) {
  for (const [name, args] of Object.entries(FIXTURES.calls)) {
    checkResult(name, await callWithRetry(client, name, args));
    await sleep(DELAY_MS);
  }
  const page = await callWithRetry(client, "get_meta_and_asset_ctxs", { limit: 5 });
  const body = JSON.parse(textOf(page) || "{}");
  check("limit=5 pages", body.returned === 5 && body.next_offset === 5 && body.truncated === true, textOf(page).slice(0, 200));
  const eth = JSON.parse(textOf(await callWithRetry(client, "get_meta_and_asset_ctxs", { coins: ["ETH"] })) || "{}");
  check("coins filter returns ETH row with funding", eth.items?.length === 1 && eth.items[0].name === "ETH" && "funding" in eth.items[0]);
  const hypeArgs = { ...FIXTURES.calls.get_token_details, genesis: "userBalances", limit: 100, offset: 100 };
  const hypeMsg = await callWithRetry(client, "get_token_details", hypeArgs);
  checkResult("get_token_details genesis page", hypeMsg);
  const hype = JSON.parse(textOf(hypeMsg) || "{}");
  const balances = hype.genesis?.userBalances;
  check(
    "get_token_details pages genesis.userBalances",
    balances?.offset === 100 && balances.returned === 100 && balances.total === hype.genesisCounts?.userBalances,
    textOf(hypeMsg).slice(0, 300),
  );
  for (const e of FIXTURES.errors.filter((e) => e.network)) {
    const msg = await callWithRetry(client, e.tool, e.args);
    check(`${e.tool} ${JSON.stringify(e.args)} isError`, msg.result?.isError === true);
    check(`${e.tool} error mentions "${e.expect}"`, textOf(msg).includes(e.expect), textOf(msg));
  }
} else {
  console.log(`skip: ${BASE} unreachable or SMOKE_OFFLINE=1; live tool calls not run`);
}
await client.close();

// —— 4. Fetch timeout: upstream accepts but never answers ——
{
  const sockets = new Set();
  const hang = createTcpServer((s) => sockets.add(s));
  await new Promise((r) => hang.listen(0, "127.0.0.1", r));
  const c = new Client({ HYPERLIQUID_API_URL: `http://127.0.0.1:${hang.address().port}`, HYPERLIQUID_TIMEOUT_MS: "500" });
  const msg = await c.call("get_exchange_status", {});
  check("hung upstream returns isError", msg.result?.isError === true);
  check("hung upstream says timed out", textOf(msg).includes("timed out"), textOf(msg));
  await c.close();
  for (const s of sockets) s.destroy();
  hang.close();
}

// —— 5. stdin close waits for in-flight calls ——
{
  const slow = createHttpServer((req, res) => {
    setTimeout(() => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ specialStatuses: null, time: 0 }));
    }, 300);
  });
  await new Promise((r) => slow.listen(0, "127.0.0.1", r));
  const c = new Client({ HYPERLIQUID_API_URL: `http://127.0.0.1:${slow.address().port}` });
  const reply = c.call("get_exchange_status", {});
  await c.close();
  const msg = await Promise.race([reply, sleep(100).then(() => null)]);
  check("in-flight call answered before exit", msg?.result && !msg.result.isError, JSON.stringify(msg));
  slow.close();
}

console.log(`${passed} checks passed, ${failures.length} failed${live ? "" : " (live calls skipped)"}`);
for (const f of failures) console.log(`FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
