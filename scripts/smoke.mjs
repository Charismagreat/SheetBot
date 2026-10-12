#!/usr/bin/env node
/**
 * SheetBot smoke probes against a running instance.
 *
 * Env:
 *   SHEETBOT_SMOKE_BASE_URL — origin + basePath (default: local EGDesk tunnel path)
 *   SHEETBOT_SMOKE_ORDER_KEY — public order page userKey (default: demo)
 *   SHEETBOT_SMOKE_QUOTE_ID — public quote page id (default: demo)
 *   SHEETBOT_SMOKE_WALLET_EMAIL — wallet balance query email (default: smoke@sheetbot.local)
 */

import crypto from "node:crypto";

const base = (
  process.env.SHEETBOT_SMOKE_BASE_URL ||
  "http://localhost:3005/t/mcp-server-fxkud1/p/SheetBot"
).replace(/\/$/, "");

const orderKey = process.env.SHEETBOT_SMOKE_ORDER_KEY || "demo";
const quoteId = process.env.SHEETBOT_SMOKE_QUOTE_ID || "demo";
const walletEmail =
  process.env.SHEETBOT_SMOKE_WALLET_EMAIL || "smoke@sheetbot.local";

function bodyHash(text) {
  return crypto.createHash("sha256").update(text || "").digest("hex").slice(0, 16);
}

async function probe({ name, path, method = "GET", headers = {}, body, redirect = "follow" }) {
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const started = Date.now();
  let status = 0;
  let hash = "—";
  let note = "";

  try {
    const res = await fetch(url, {
      method,
      headers: { Accept: "*/*", ...headers },
      body,
      redirect,
    });
    status = res.status;
    const text = await res.text();
    hash = bodyHash(text);
    if (redirect === "manual" && res.headers.get("location")) {
      note = `location=${res.headers.get("location")}`;
    }
  } catch (err) {
    status = 0;
    hash = "—";
    note = err?.message || String(err);
  }

  const ms = Date.now() - started;
  return { name, method, path, status, hash, ms, note };
}

const checks = [
  {
    name: "login-page",
    path: "/login",
    redirect: "manual",
  },
  {
    name: "auth-session",
    path: "/api/auth/session",
  },
  {
    name: "wallet-balance",
    path: `/api/wallet/balance?userEmail=${encodeURIComponent(walletEmail)}`,
  },
  {
    name: "projects-list",
    path: "/api/projects",
  },
  {
    name: "copilot-sidebar-template",
    path: "/api/copilot/sidebar-template",
  },
  {
    name: "public-order-page",
    path: `/order/${encodeURIComponent(orderKey)}`,
  },
  {
    name: "public-quote-page",
    path: `/q/${encodeURIComponent(quoteId)}`,
  },
  {
    name: "public-estimate-issue",
    path: "/estimate/issue",
  },
  {
    name: "admin-check",
    path: "/api/admin/check",
  },
  {
    name: "gateway-mcp-unauth",
    path: "/api/gateway/mcp",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service: "ai-caller", tool: "ai_caller_list_models", arguments: {} }),
  },
];

console.log(`SheetBot smoke — base URL: ${base}`);
console.log(`Time: ${new Date().toISOString()}`);
console.log("");
console.log("NAME                      METHOD  STATUS  MS     BODY_SHA256_16  PATH");
console.log("-".repeat(100));

const results = [];
for (const c of checks) {
  const r = await probe(c);
  results.push(r);
  const line = `${r.name.padEnd(25)} ${r.method.padEnd(6)} ${String(r.status).padEnd(7)} ${String(r.ms).padEnd(6)} ${r.hash.padEnd(16)} ${r.path}`;
  console.log(line);
  if (r.note) console.log(`  note: ${r.note}`);
}

const failed = results.filter((r) => r.status === 0);
if (failed.length) {
  console.log("");
  console.log(`Warning: ${failed.length} probe(s) could not connect (is the server running at ${base}?)`);
  process.exitCode = 0;
}
