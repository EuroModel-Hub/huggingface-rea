#!/usr/bin/env node
// Analyze network events from a REA capture extraction directory.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const out = process.argv[3];
const items = JSON.parse(readFileSync(join(dir, "network-events.json"), "utf8"));

const byTx = new Map();
for (const it of items) {
  const tx = it.transaction_id;
  if (!tx) continue;
  if (!byTx.has(tx)) byTx.set(tx, { tx, url: it.url, method: it.method, resource_type: it.resource_type, request_headers: it.header_names, status: null, failure: null, mime: null, response_headers: null, redirected_from: it.redirected_from_transaction_id, sequence: it.sequence });
  const rec = byTx.get(tx);
  if (it.kind === "response") {
    rec.status = it.status;
    rec.mime = it.mime_type || rec.mime;
    rec.response_headers = it.header_names;
    rec.response_url = it.url;
  }
  if (it.kind === "request-failed") rec.failure = it.failure || it.failure_reason || "failed";
  if (it.kind === "request-finished") rec.finished = true;
  if (it.kind === "network-content") {
    if (it.content_kind) rec.content_kind = it.content_kind;
  }
}

const txs = [...byTx.values()].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

// Group by host
const byHost = {};
const byResourceType = {};
const apiLike = [];
for (const t of txs) {
  let host = "?", path = "?";
  try { const u = new URL(t.url.url); host = u.host; path = u.pathname + (u.search ? u.search : ""); } catch {}
  byHost[host] = (byHost[host] || 0) + 1;
  const rt = t.resource_type || "unknown";
  byResourceType[rt] = (byResourceType[rt] || 0) + 1;
  // API-like: fetch/xhr, or path with /api/, or json content, or graphql
  const p = path.toLowerCase();
  if (rt === "fetch" || rt === "xhr" || p.includes("/api/") || p.includes("/graphql") || p.includes("/api/")) {
    apiLike.push({ method: t.method, url: t.url.url, status: t.status, mime: t.mime, resource_type: rt });
  }
}

const summary = {
  total_transactions: txs.length,
  by_host: byHost,
  by_resource_type: byResourceType,
  api_like_requests: apiLike,
  all_transactions: txs.map((t) => ({
    tx: t.tx,
    method: t.method,
    url: t.url?.url,
    resource_type: t.resource_type,
    status: t.status,
    mime: t.mime,
    failure: t.failure,
    redirected_from: t.redirected_from,
    request_headers: t.request_headers,
    response_headers: t.response_headers,
  })),
};
writeFileSync(out, JSON.stringify(summary, null, 2));

console.log(`Analyzed ${txs.length} network transactions.`);
console.log("By host:", byHost);
console.log("By resource_type:", byResourceType);
console.log(`API-like requests: ${apiLike.length}`);
