// snippets/bundle-api-calls.js
//
// Representative reconstructed code excerpts illustrating how the Hugging Face Hub
// client calls its own API. These are NOT verbatim original source — the site
// ships minified, source-map-less production bundles. They were reconstructed by
// reading the exported minified modules under evidence/exported-scripts/ and
// reformatting the relevant call sites. Each excerpt cites the script file and
// approximate column where the pattern was found.
//
// Sources:
//   evidence/exported-scripts/files/origins/<hash>/front/build/kube-e3dd6d7/index.js
//   .../index-client-BtDI23kz.js, ViewUtils-CzR5Z2rw.js, ClientErrorCatcher-*.js, etc.

// ---------------------------------------------------------------------------
// 1. Theme persistence — POST /settings/theme
//    Found in index.js (analyze-web-bundle endpoint_candidate, scr_5cbbc93…, col ~29686).
//    The page toggles the `dark` class on <html> from a `theme=` cookie (see DOM
//    head inline script) and persists the choice via this fetch.
// ---------------------------------------------------------------------------
async function saveTheme(theme) {
  // theme is one of "system" | "light" | "dark"
  await fetch("/settings/theme", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ theme }),
  });
}

// ---------------------------------------------------------------------------
// 2. Quicksearch — GET /api/quicksearch  (index.js)
//    Used by the header search box for type-ahead user/model lookups.
//    `Ze` is the minified fetch wrapper; `Re` builds a query string.
// ---------------------------------------------------------------------------
async function quicksearchUsers(query, { signal } = {}) {
  const params = { q: query, type: "user", limit: 5 /*, ...otherFilters */ };
  const res = await fetch(`/api/quicksearch${new URLSearchParams(params)}`, {
    signal,
  });
  if (res.isError) return [];
  return res.payload.users.map((u) => ({
    id: u.user,
    imgUrl: u.avatarUrl,
    label: u.user,
    description: u.fullName ?? "",
  }));
}

// ---------------------------------------------------------------------------
// 3. Username availability — GET /api/check-username?username=
//    Called from the Sign Up flow to validate a chosen username live.
// ---------------------------------------------------------------------------
async function checkUsername(username) {
  const res = await fetch(`/api/check-username?username=${encodeURIComponent(username)}`);
  return res.isError ? null : res.payload;
}

// ---------------------------------------------------------------------------
// 4. Job count polling — GET /api/jobs/{id}/count?stage=RUNNING&stage=SCHEDULING
//    Used by the jobs/notifications indicator (index.js).
// ---------------------------------------------------------------------------
async function getRunningJobCount(jobId) {
  const url = `/api/jobs/${jobId}/count?stage=RUNNING&stage=SCHEDULING`;
  const res = await fetch(url);
  return res.isError ? null : res.payload.count;
}

// ---------------------------------------------------------------------------
// 5. Live metrics stream — GET /api/settings/metrics/live  (Server-Sent Events)
//    index.js declares `da = "/api/settings/metrics/live"` and polls/streams it
//    on a 600 000 ms cadence (`pa = 6e5`) using an AbortController. The bundle
//    also references `text/event-stream` and `getReader`, indicating a
//    ReadableStream / SSE-style consumer rather than a plain JSON poll.
// ---------------------------------------------------------------------------
const METRICS_URL = "/api/settings/metrics/live";
const METRICS_REFRESH_MS = 600_000;

let metricsAbort;
async function streamMetrics(onUpdate) {
  metricsAbort?.abort();
  metricsAbort = new AbortController();
  const res = await fetch(METRICS_URL, { signal: metricsAbort.signal });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Split on SSE event boundaries and dispatch complete events.
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      onUpdate(parseSseEvent(rawEvent));
    }
  }
}

function parseSseEvent(raw) {
  const event = { data: "" };
  for (const line of raw.split("\n")) {
    if (line.startsWith("data:")) event.data += line.slice(5).trimStart();
  }
  try {
    return JSON.parse(event.data);
  } catch {
    return event;
  }
}

// ---------------------------------------------------------------------------
// 6. Feedback widget — POST /api/feedback  (index.js)
// ---------------------------------------------------------------------------
async function submitFeedback(description) {
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      description,
      pageUrl: window.location.href,
    }),
  });
  return res.isError ? res.error : res.payload;
}

// ---------------------------------------------------------------------------
// 7. Client-side error reporting — POST /api/client-errors
//    The ClientErrorCatcher-9oQTefDG.js module wires window.onerror /
//    unhandledrejection into this endpoint (see exported script).
// ---------------------------------------------------------------------------
async function reportClientError(payload) {
  await fetch("/api/client-errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// 8. Analytics — Plausible, self-hosted at /api/event
//    Inlined in the <head> of every page (see evidence/homepage-desktop/02_settle.dom.html).
//    `plausible.init({ customProperties: { loggedIn: "false" }, endpoint: "/api/event" })`
//    means pageview + custom events POST to the same-origin /api/event.
// ---------------------------------------------------------------------------
window.plausible = window.plausible || function () { (plausible.q = plausible.q || []).push(arguments); };
plausible.init = plausible.init || function (i) { plausible.o = i || {}; };
plausible.init({ customProperties: { loggedIn: "false" }, endpoint: "/api/event" });
// e.g. plausible("Signup", { props: { method: "github" } });

// ---------------------------------------------------------------------------
// 9. Bootstrapping — window.hfConfig / window.hubConfig (inlined in <head>)
//    The server injects a JSON config the client reads at boot. Verbatim keys
//    captured from the homepage DOM (values redacted where sensitive):
// ---------------------------------------------------------------------------
window.hubConfig = {
  features: { signupDisabled: false },
  sshGitUrl: "git@hf.co",
  moonHttpUrl: "https://huggingface.co",
  captchaApiKey: "5bd005a4-…",                 // hCaptcha-style key (public)
  datasetViewerPublicUrl: "https://datasets-server.huggingface.co",
  stripePublicKey: "pk_live_…",                 // Stripe publishable key (public)
  environment: "production",
  userAgent: "HuggingFace (production)",
  spacesIframeDomain: "hf.space",
  spacesApiUrl: "https://api.hf.space",
  logoDev: { apiUrl: "https://img.logo.dev/", apiKey: "pk_…" },
};
window.requestId = "Root=1-6ad7c9ff-6fe45a0a7c9de515583f9251"; // matches x-request-id
window.featureFlags = { containers: false };
