#!/usr/bin/env node
// Extract REA capture-browser-scenario evidence into discrete files.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";

const rawPath = process.argv[2];
const outDir = process.argv[3];
if (!rawPath || !outDir) {
  console.error("usage: extract.js <raw.json> <outDir>");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, "screenshots"), { recursive: true });

const doc = JSON.parse(readFileSync(rawPath, "utf8"));
const data = doc.data ?? doc;
const n = data.normalized_result ?? data;
const steps = n.steps || [];

const summary = {
  evidence_id: data.evidence_id,
  operation: data.operation,
  predicate_type: data.predicate_type,
  provider: data.provider,
  duration_ms: n.duration_ms,
  browser: n.browser,
  scenario: n.scenario,
  completeness: n.completeness,
  limitations: data.limitations,
  events: { retained: n.events?.retained, dropped: n.events?.dropped, omissions: n.events?.omissions },
  steps: steps.map((s) => ({
    step_index: s.step_index,
    step_id: s.step_id,
    action: s.action,
    elapsed_ms: s.elapsed_ms,
    before_url: s.before_url,
    after_url: s.after_url,
    event_sequence_start: s.event_sequence_start,
    event_sequence_end: s.event_sequence_end,
    status: s.status,
    error: s.error,
    artifacts: Object.fromEntries(
      Object.entries(s.artifacts || {}).map(([k, v]) => [k, v.state])
    ),
  })),
};
writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

// Extract artifacts from each step that captured them.
for (const step of steps) {
  const arts = step.artifacts || {};
  for (const [kind, art] of Object.entries(arts)) {
    if (art.state !== "captured" || !art.value) continue;
    const v = art.value;
    const tag = `${String(step.step_index).padStart(2, "0")}_${step.step_id}`;
    if (kind === "screenshot") {
      const buf = Buffer.from(v.data_base64, "base64");
      writeFileSync(join(outDir, "screenshots", `${tag}.png`), buf);
    } else if (kind === "dom") {
      const text = typeof v === "string" ? v : (v.text ?? v.value ?? JSON.stringify(v, null, 2));
      writeFileSync(join(outDir, `${tag}.dom.html`), text);
    } else if (kind === "accessibility") {
      writeFileSync(join(outDir, `${tag}.accessibility.json`), JSON.stringify(v, null, 2));
    } else if (kind === "url") {
      writeFileSync(join(outDir, `${tag}.url.json`), JSON.stringify(v, null, 2));
    } else if (kind === "history") {
      writeFileSync(join(outDir, `${tag}.history.json`), JSON.stringify(v, null, 2));
    } else if (kind === "storage") {
      writeFileSync(join(outDir, `${tag}.storage.json`), JSON.stringify(v, null, 2));
    }
  }
}

// Extract event items into a network log + console log.
const items = n.events?.items || [];
const network = [];
const consoleLog = [];
const pageErrors = [];
const websockets = [];
const frames = [];
const workers = [];
const popups = [];
const downloads = [];
const other = [];
for (const it of items) {
  const kind = it.kind || it.event || it.family;
  if (
    kind === "request" ||
    kind === "response" ||
    kind === "request-finished" ||
    kind === "request-failed" ||
    kind === "network-content" ||
    kind === "network"
  ) {
    network.push(it);
  } else if (kind === "console") {
    consoleLog.push(it);
  } else if (kind === "page-errors" || kind === "page-error") {
    pageErrors.push(it);
  } else if (kind === "websocket" || kind === "websockets") {
    websockets.push(it);
  } else if (kind === "frame-navigated" || kind === "frame-attached" || kind === "frames") {
    frames.push(it);
  } else if (kind === "worker" || kind === "workers") {
    workers.push(it);
  } else if (kind === "popups" || kind === "popup") {
    popups.push(it);
  } else if (kind === "downloads" || kind === "download") {
    downloads.push(it);
  } else {
    other.push(it);
  }
}
writeFileSync(join(outDir, "events-all.json"), JSON.stringify(items, null, 2));
writeFileSync(join(outDir, "network-events.json"), JSON.stringify(network, null, 2));
writeFileSync(join(outDir, "console-events.json"), JSON.stringify(consoleLog, null, 2));
writeFileSync(join(outDir, "page-errors.json"), JSON.stringify(pageErrors, null, 2));
writeFileSync(join(outDir, "websocket-events.json"), JSON.stringify(websockets, null, 2));
writeFileSync(join(outDir, "frames-events.json"), JSON.stringify(frames, null, 2));
writeFileSync(join(outDir, "workers-events.json"), JSON.stringify(workers, null, 2));

console.log(`Extracted ${steps.length} steps, ${items.length} events.`);
console.log(`  network=${network.length} console=${consoleLog.length} pageErrors=${pageErrors.length} ws=${websockets.length} frames=${frames.length} workers=${workers.length}`);
console.log(`Screenshots in ${join(outDir, "screenshots")}`);
