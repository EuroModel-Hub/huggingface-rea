# Reverse-engineering report — huggingface.co

> Produced with **REA (`rea-agents` v6.7.0)** on 2026-10-20.
> Target: the public Hugging Face Hub at `https://huggingface.co/`.
> Method: passive browser capture + static bundle analysis. See `README.md` for
> the exact commands and `evidence/` for the raw artifacts.

---

## 1. Executive summary

huggingface.co is a **server-side-rendered SvelteKit application** (Svelte 5 with
runes), bundled with **Vite + Rolldown**, served behind **AWS CloudFront** by a
custom Hugging Face origin server that identifies itself as
`x-powered-by: huggingface-moon` ("moon" is HF's internal name for the Hub web
server). Pages arrive with their data already embedded in the HTML, so first
paint issues **no** client-side fetch to the content APIs — the only XHR/fetch
traffic on initial load is bot-protection (AWS WAF) and payment-device
fingerprinting (Stripe). The Hub also publishes a machine-readable API surface:
an OpenAPI 3.1 spec at `/.well-known/openapi.json`, an API catalog, an
AI-catalog, and an MCP server at `/mcp`.

Everything below is backed by evidence in `evidence/`; each section cites the
specific file, URL, request, or script.

---

## 2. Site structure (pages captured)

Captured via `rea capture-browser-scenario` (launch mode, headless Chrome 154):

| URL | Title | Net txns | Scripts | Screenshot |
|---|---|---|---|---|
| `/` (desktop 1440×900) | Hugging Face – The AI community building the future. | 126 | 52 | `screenshots/homepage-desktop.png` |
| `/` (mobile 390×844 @3x) | (same) | 126 | 52 | `screenshots/homepage-mobile.png` |
| `/models` (desktop) | Models – Hugging Face | 256 | 192 | `screenshots/models-desktop.png` |
| `/spaces` (desktop) | Spaces – Hugging Face | 216 | 128 | `screenshots/spaces-desktop.png` |
| `/docs` (desktop) | Hugging Face - Documentation | 74 | 52 | `screenshots/docs-desktop.png` |

Source: `evidence/<capture>/network-summary.json` and `evidence/<capture>/02_settle.dom.html`.

### 2.1 Homepage layout

From `evidence/homepage-desktop/02_settle.accessibility.json` + DOM:

- **Top banner / nav** (`role=banner`): logo → `/`, search textbox
  "Search models, datasets, users…", and a `Main` nav list: `/models`,
  `/datasets`, `/spaces`, `/storage` (Buckets, "new"), `/docs`, `/pricing`,
  plus a "more" menu exposing `/tasks`, `/chat` (HuggingChat), `/collections`,
  `/languages`, `/organizations`, `/blog`, `/posts`, `/papers` (Daily Papers),
  `/hardware`, `/learn`, `/join/discord`, `/forum`.
- **Hero** (dark rounded panel): headline "The AI community building the
  future.", CTA `Explore AI Apps` + `Browse 2M+ models`, and an inline mock-up of
  the model browser (tasks/libraries/parameters/inference-provider filters + a
  model list).
- **Trending feed**: "Trending on 🤗 this week" — server-rendered, no XHR.
- **Footer**: standard HF footer.

### 2.2 `/models`, `/spaces`, `/docs`

`/models` is a dense faceted model browser (Tasks, Parameters slider <1B→>500B,
Libraries, Apps, Inference Providers) with a vertical feed of model cards.
`/spaces` mirrors that pattern for Spaces (demos on `hf.space`). `/docs` is the
documentation hub rendered by the same SvelteKit shell
(`<title>Hugging Face - Documentation</title>`).
Source: `screenshots/*.png`, `evidence/<capture>/02_settle.dom.html`.

---

## 3. Tech stack

### 3.1 Frontend framework — SvelteKit on Svelte 5

Evidence:

- **Hydration markers**: SSR HTML contains Svelte-style hydration anchor
  comments such as `<!--164igl-->` right after `<link rel="canonical" …>`
  (`evidence/homepage-desktop/02_settle.dom.html`). Svelte emits these
  `<!--XXXXXX-->` comments as hydration anchors.
- **Svelte 5 runes runtime**: `index-client-BtDI23kz.js` (65 244 bytes) contains
  `Symbol("$state")`, `Symbol("component")`, `Symbol("legacy props")`,
  `Symbol("proxy path")`, `svelte_boundary_reset_onerror`,
  `svelte_boundary_reset_noop`, `svelte-trusted-html`, `StaleReactionError` —
  Svelte 5 runes / boundary symbols.
  Source: `evidence/exported-scripts/files/origins/<h>/front/build/kube-e3dd6d7/index-client-BtDI23kz.js`.
- **Bundle runtime inference**: REA's `analyze-web-bundle` returned
  `{ kind: "bundle_runtime", value: "Vite", confidence: "medium",
  detector: "vite-runtime" }` with basis `scr_5cbbc93…` (the `index.js` entry).
  Source: `evidence/analyze-web-bundle.raw.json` → `normalized_result.inferences`.
- **Rolldown**: `rolldown-runtime-hePW80VL.js` is modulepreloaded; `index.js`
  references `rolldown` and `__vite`. Rolldown is the Rust-based bundler Vite is
  migrating to; HF uses it in production.

### 3.2 Build & asset pipeline

- Hashed assets under `/front/build/kube-e3dd6d7/` with content-hashed filenames
  (e.g. `ViewUtils-CzR5Z2rw.js`). `kube-e3dd6d7` is a build/release id.
- Fonts: Source Sans Pro (latin 400/600/700 `.woff2`, preloaded).
- Math: KaTeX (`/front/build/kube-e3dd6d7/katex.css`, lazy-loaded with
  `<noscript>` fallback).
- 30 scripts observed on homepage; 23 retained and exported to
  `evidence/exported-scripts/` (7 were disallowed-origin / inline).
  Source: `evidence/analyze-web-bundle.raw.json` → `capture.scripts_observed=30`;
  `evidence/exported-scripts/manifest.json` → `scripts: 23`.

### 3.3 Source maps — none shipped

`analyze-web-bundle --fetch-source-maps` reported `source_maps_count: 0` and
`source_maps: []`. The site ships no `//# sourceMappingURL=` declarations, so
exported scripts are minified only.
Source: `evidence/analyze-web-bundle.raw.json` → `normalized_result.observations.source_maps`.

### 3.4 Hosting, CDN, and edge

From the main document response headers
(`evidence/homepage-desktop.raw.json` → `events.items`, transaction `request-1`,
phase `response`):

| Header | Value | Meaning |
|---|---|---|
| `x-powered-by` | `huggingface-moon` | HF's own origin server ("moon") |
| `via` | `1.1 5b0b018dc5d72a42f205b24b17f4f56e.cloudfront.net (CloudFront)` | AWS CloudFront |
| `x-amz-cf-id` | `21p7_J4PdBoA1mTt1qcIPel0yG2TpCua4QCu1FMS22yAwzofyJnY_w==` | CloudFront request id |
| `x-amz-cf-pop` | `IAD55-P8` | CloudFront edge POP (US East) |
| `x-cache` | `Hit from cloudfront` | Cached at the edge |
| `age` | `44` | Object age in cache (s) |
| `alt-svc` | `h3=":443"; ma=86400` | HTTP/3 / QUIC advertised |
| `content-encoding` | `gzip` | gzip transfer |
| `vary` | `Accept-Encoding` | — |
| `etag` | `W/"2c3b8-…"` | Weak validator |
| `content-type` | `text/html; charset=utf-8` | — |
| `x-request-id` | `Root=1-6ad7c9ff-6fe45a0a7c9de515583f9251` | Mirrored into `window.requestId` in the DOM |

Security headers: `cross-origin-opener-policy: same-origin`,
`x-frame-options: DENY`, `referrer-policy: strict-origin-when-cross-origin`,
`strict-transport-security: max-age=31536000`.

Rate limiting (draft `ratelimit` / `ratelimit-policy` headers):

- `ratelimit: "pages";r=98;t=237`
- `ratelimit-policy: "fixed window";"pages";q=100;w=300`

→ 100 page requests per 300 s fixed window per client; this response reports
98 used, 237 s remaining.

### 3.5 Third-party / edge services on every page

| Service | Evidence |
|---|---|
| **AWS WAF** (bot challenge) | `<script src="https://de5282c3ca0c.edge.sdk.awswaf.com/de5282c3ca0c/526cf06acb0d/challenge.js" defer>` in `<head>`; runtime POSTs to `…/mp_verify?region=us-east-1` and `…/telemetry`; sets `aws-waf-token` cookie (`.huggingface.co`); localStorage `awswaf_token_refresh_timestamp`, `awswaf_session_storage`. Source: `evidence/homepage-desktop/02_settle.dom.html`, `02_settle.storage.json`, `network-summary.json`. |
| **Stripe** (payments + device fingerprint) | `<script src="https://js.stripe.com/dahlia/stripe.js" async>`; loads `js.stripe.com/v3/m-outer-*.html` + `m.stripe.network/inner.html`; POSTs `m.stripe.com/6` (XHR); sets `__stripe_mid`, `__stripe_sid` cookies. `window.hubConfig.stripePublicKey` present. |
| **Plausible Analytics** (self-hosted) | Inlined `<script>` bootstraps `window.plausible` with `endpoint: "/api/event"`, `customProperties: { loggedIn: "false" }`. Events POST same-origin to `/api/event`. |
| **hCaptcha** (auth flows) | `window.hubConfig.captchaApiKey` (public key `5bd005a4-…`). Not exercised in this passive capture. |
| **logo.dev** | `window.hubConfig.logoDev = { apiUrl: "https://img.logo.dev/", apiKey: "pk_…" }` — org/company logo lookups. |

### 3.6 Cookies & storage on first paint

From `evidence/homepage-desktop/02_settle.storage.json`:

- Cookies: `aws-waf-token` (`.huggingface.co`, Secure, SameSite=Lax),
  `__stripe_mid` (Strict), `__stripe_sid` (Strict).
- localStorage: `awswaf_token_refresh_timestamp`, `awswaf_session_storage`.
- sessionStorage / IndexedDB / CacheStorage: empty.

(REA retains storage values only as SHA-256 fingerprints, never plaintext.)

---

## 4. Scripts / bundles

The 23 retained modules (exported to
`evidence/exported-scripts/files/origins/<h>/front/build/kube-e3dd6d7/`):

| File | Bytes | Role (inferred) |
|---|---|---|
| `index.js` | 280 562 | Main route/entry — API call sites, theme, quicksearch, jobs, feedback, metrics |
| `index-client-BtDI23kz.js` | 65 244 | Svelte 5 client runtime (runes, reactivity, boundaries) |
| `ViewUtils-CzR5Z2rw.js` | 116 503 | View utilities (DOM helpers, formatting) |
| `index-client-CabHKwXS.js` | 6 228 | Svelte reactive `SvelteSet` / `SvelteMap` collections |
| `ProductBanners-AZmIzLJr.js` | 4 923 | Product/promo banners |
| `IconSunFull-BBJFy9KC.js` | 5 745 | Theme-toggle icon (sun) |
| `Dropdown-ByEhxA8T.js` | 5 592 | Dropdown component |
| `ClientErrorCatcher-9oQTefDG.js` | 2 999 | `window.onerror` → `/api/client-errors` |
| `motion-DhANlOer.js` | 2 403 | Animation/motion helpers |
| `IconProSparkle-ZWn-dXSa.js` | 1 806 | Pro badge icon |
| `transition-BC1V4nXS.js` | 1 640 | Svelte transition |
| `SSOBanner-BY7ePK5v.js` | 1 375 | Sign-in / SSO banner |
| `rolldown-runtime-hePW80VL.js` | 716 | Rolldown/Vite runtime |
| `DeviceProvider-DHlUgcPX.js` | 558 | Device/viewport provider |
| `IconCaret-CiRXXM-N.js` | 543 | Caret icon |
| `SystemThemeMonitor-Dt6zgFfj.js` | 588 | `prefers-color-scheme` monitor |
| `noBodyScroll-CgU0IkG5.js` | 410 | Body-scroll lock |
| `easing-Bpv0HHWv.js` | 175 | Easing functions |
| `disclose-version-xihTtKlq.js` | 65 | Svelte version disclosure |
| `events-DwBWi-Ht.js` | 35 | Event helpers |
| `legacy-Bz6oZbHy.js` | 52 | Legacy compat shim |

Plus same-origin `/js/script.js` (5 974 bytes) and several inline `<head>`
scripts (theme bootstrap, plausible init, `window.hubConfig`, animation-phase
offset).

The static import graph (`evidence/analyze-web-bundle.raw.json` →
`observations.chunks.edges`, 323 edges) shows every module `static_import`s
`./index-client-BtDI23kz.js` (the Svelte runtime) and most also import
`./ViewUtils-CzR5Z2rw.js` and `./disclose-version-xihTtKlq.js` — a typical
SvelteKit code-split layout where runtime + shared utils are common deps.

---

## 5. Network / API endpoints observed

### 5.1 Endpoints the client actually called during capture

From `evidence/<capture>/network-summary.json` (filtering `resource_type` ∈
{`fetch`,`xhr`} and `/api/` paths):

| Method | URL | When | Type |
|---|---|---|---|
| POST | `https://de5282c3ca0c.edge.sdk.awswaf.com/…/mp_verify?region=us-east-1` | every page | AWS WAF challenge verify |
| POST | `https://de5282c3ca0c.edge.sdk.awswaf.com/…/telemetry` | every page | AWS WAF telemetry |
| POST | `https://m.stripe.com/6` | every page | Stripe device fingerprint (XHR) |
| GET | `https://js.stripe.com/v3/m-outer-*.html` | every page | Stripe iframe |
| GET | `https://m.stripe.network/inner.html` | every page | Stripe iframe |

**No client-side fetch to `/api/models`, `/api/datasets`, etc. occurred on
initial load** — confirming the SSR model. The content APIs are exercised only
on interaction (search, filter changes, infinite scroll), which the passive
capture did not trigger.

### 5.2 Endpoints statically recoverable from the bundle

Grepping the exported scripts for `/api/…` and `fetch(\`…\`)` patterns:

| Endpoint | Method | Found in | Purpose |
|---|---|---|---|
| `/api/quicksearch` | GET | `index.js` | Type-ahead search (users/models/etc.); params `q`, `type`, `limit` |
| `/api/jobs/{id}/count?stage=RUNNING&stage=SCHEDULING` | GET | `index.js` | Running/scheduled job count for the jobs indicator |
| `/api/settings/metrics/live` | GET (stream) | `index.js` | Live metrics; `text/event-stream` + `getReader` (SSE/ReadableStream), refreshed every 600 000 ms |
| `/api/settings/notifications` | — | `index.js` | Notification settings |
| `/api/feedback` | POST | `index.js` | Feedback widget submission (`description`, `pageUrl`) |
| `/api/check-username?username=` | GET | `index.js` | Username availability (signup flow) |
| `/api/client-errors` | POST | `ClientErrorCatcher-*.js` | Client-side error reporting |
| `/settings/theme` | POST | `index.js` (also an `analyze-web-bundle` `endpoint_candidate`) | Persist `theme` preference |
| `/api/event` | POST | inline `<head>` (Plausible) | Analytics events |

Reconstructed call sites are in `snippets/bundle-api-calls.js`.

### 5.3 Published machine-readable API surface

The homepage document advertises these via `link` headers and well-known files
(fetched directly to confirm):

- `link: </.well-known/ai-catalog.json>; rel="ai-catalog"; type="application/ai-catalog+json"`
- `link: </.well-known/api-catalog>; rel="api-catalog"`

Confirmed contents:

- **`/.well-known/openapi.json`** — OpenAPI **3.1**, `info.title: "Hub API
  Endpoints"`, server `https://huggingface.co`. Describes `/api/models` and the
  rest of the Hub REST API; references `huggingface_hub` (Python) and
  `huggingface.js` clients, and webhooks. Repo types enum:
  `dataset, model, space, bucket, kernel, container`.
- **`/.well-known/api-catalog`** — a linkset pointing to the OpenAPI spec.
- **`/.well-known/ai-catalog.json`** — an AI catalog (spec 1.0) listing:
  - `urn:air:huggingface.co:registry:discover` → `https://huggingface-hf-discover.hf.space`
    ("Search indexed HF Skills, Space skills and MCP-enabled Spaces")
  - `urn:air:huggingface.co:mcp:hub` → `https://huggingface.co/mcp/server-card`
- **`/mcp/server-card`** — an MCP server card (schema v1):
  `name: "huggingface.co/mcp"`, `version: "0.4.31"`,
  `title: "Hugging Face"`, remote `streamable-http` at `https://huggingface.co/mcp`.
  → The Hub is itself an MCP server.

### 5.4 Request patterns

- All same-origin content is served from `huggingface.co` (96 requests on
  homepage, 204 on /models). Avatars/images come from `cdn-avatars.huggingface.co`.
- Static assets are cacheable at CloudFront (document was a cache `Hit`).
- The browser uses HTTP/2+ (pseudo-headers `:authority`, `:method`, `:path`,
  `:scheme` in request headers) and advertises HTTP/3 via `alt-svc`.
- `accept-encoding: gzip, deflate, br, zstd` — the client supports Brotli and
  Zstandard; the origin responded with `gzip` for the document.

---

## 6. Rendering / interaction model

1. **Server-side rendering with hydration.** The HTML arrives fully composed:
   the trending feed, the model list on `/models`, navigation, and the hero
   mock-up are all in the initial document. Svelte hydration anchors
   (`<!--164igl-->`) and the `index.js` entry's `hydrate` references confirm
   SvelteKit's hydration path.
2. **Client bootstrapping via `window.hubConfig`.** The server injects a JSON
   config in `<head>` that the client reads at boot (verbatim keys captured
   from `evidence/homepage-desktop/02_settle.dom.html`):

   ```
   window.hubConfig = {
     features: { signupDisabled: false },
     sshGitUrl: "git@hf.co",
     moonHttpUrl: "https://huggingface.co",
     captchaApiKey: "5bd005a4-…",
     datasetViewerPublicUrl: "https://datasets-server.huggingface.co",
     stripePublicKey: "pk_live_…",
     environment: "production",
     userAgent: "HuggingFace (production)",
     spacesIframeDomain: "hf.space",
     spacesApiUrl: "https://api.hf.space",
     logoDev: { apiUrl: "https://img.logo.dev/", apiKey: "pk_…" }
   };
   window.requestId = "Root=1-6ad7c9ff-…";   // matches x-request-id
   window.featureFlags = { containers: false };
   ```

3. **Theme before paint.** An inline `<head>` script reads a `theme=` cookie
   and toggles the `dark` class on `<html>` before first paint to avoid a flash;
   `SystemThemeMonitor` and `IconSunFull` modules manage it thereafter, and
   `POST /settings/theme` persists user choice.
4. **Progressive enhancement.** KaTeX CSS is lazy-loaded with an `onload`
   switch and a `<noscript>` fallback. Modulepreload hints warm the JS runtime
   (`index.js`, `rolldown-runtime`) before the entry executes.
5. **No SPA data fetching on first paint.** Because content is SSR'd, the
   client only talks to the network for WAF + Stripe + (later) analytics.
   Content APIs (`/api/models`, `/api/quicksearch`, `/api/jobs/…`,
   `/api/settings/metrics/live`) are used on interaction, not on load.
6. **Streaming for live data.** `/api/settings/metrics/live` is consumed as a
   stream (`text/event-stream`, `getReader`) on a 10-minute cadence with an
   `AbortController` — a ReadableStream/SSE pattern rather than JSON polling.

---

## 7. Key features and how they're implemented

### 7.1 Faceted model/dataset/Space browsing (`/models`, `/spaces`, `/datasets`)

- The filter UI (tasks, parameter slider, libraries, apps, inference providers)
  is a Svelte component tree rendered server-side and hydrated. Filter state
  drives URL query parameters (SvelteKit-style), enabling shareable/bookmarkable
  filter URLs and SSR-friendly deep links.
- The model list itself is in the initial HTML (no `/api/models` fetch on
  load). Subsequent filter changes re-navigate (client-side routing) and the
  server returns a fresh SSR page; infinite scroll / "load more" then hits the
  REST API.
- Evidence: `screenshots/models-desktop.png`;
  `evidence/models-desktop/02_settle.dom.html` (model cards present in initial
  HTML); `evidence/models-desktop/network-summary.json` (no `/api/models` in
  initial fetch/xhr).

### 7.2 Quicksearch

- Header search box → `GET /api/quicksearch?q=…&type=user&limit=5` with an
  `AbortController` (cancellable per keystroke). Returns `payload.users[]` with
  `user`, `avatarUrl`, `fullName`. Other `type` values (models, datasets) are
  supported via the same endpoint.
- Evidence: `snippets/bundle-api-calls.js` §2; `evidence/exported-scripts/…/index.js`
  (`/api/quicksearch`, `type: \`user\``, `limit: 5`).

### 7.3 Theme toggle (light / dark / system)

- Inline `<head>` script applies theme before paint; `SystemThemeMonitor`
  watches `prefers-color-scheme`; `IconSunFull` is the toggle affordance;
  `POST /settings/theme` persists the choice.
- Evidence: `evidence/homepage-desktop/02_settle.dom.html` (inline theme
  script); `evidence/exported-scripts/…/SystemThemeMonitor-Dt6zgFfj.js`,
  `IconSunFull-BBJFy9KC.js`; `index.js` `fetch('/settings/theme', …)`.

### 7.4 Live metrics / notifications

- `/api/settings/metrics/live` is a streaming endpoint (SSE/ReadableStream)
  polled/streamed every 600 000 ms with an `AbortController`.
- `/api/settings/notifications` for notification settings.
- Evidence: `index.js` (`da = "/api/settings/metrics/live"`, `pa = 6e5`,
  `text/event-stream`, `getReader`).

### 7.5 Job progress indicator

- `GET /api/jobs/{id}/count?stage=RUNNING&stage=SCHEDULING` returns a count of
  running/scheduling jobs shown as a badge.
- Evidence: `index.js` (`/api/jobs/${p()}/count?stage=RUNNING&stage=SCHEDULING`).

### 7.6 Feedback widget

- `POST /api/feedback` with `{ description, pageUrl }`.
- Evidence: `index.js` (`fetch('/api/feedback', { description, pageUrl })`).

### 7.7 Client-side error reporting

- `ClientErrorCatcher-9oQTefDG.js` wires `window.onerror` /
  `unhandledrejection` to `POST /api/client-errors`.
- Evidence: `evidence/exported-scripts/…/ClientErrorCatcher-9oQTefDG.js`.

### 7.8 Analytics (self-hosted Plausible)

- Inline `<head>` script initializes `window.plausible` with
  `endpoint: "/api/event"` and `customProperties: { loggedIn: "false" }`.
  Pageviews and custom events POST same-origin.
- Evidence: `evidence/homepage-desktop/02_settle.dom.html`.

### 7.9 Bot protection & payments

- AWS WAF challenge (`challenge.js` + `mp_verify` + `telemetry` +
  `aws-waf-token` cookie) runs on every page.
- Stripe.js (`dahlia/stripe.js`) loads for payment flows and device
  fingerprinting (`m.stripe.com/6`, `__stripe_mid`/`__stripe_sid`).
- Evidence: `evidence/homepage-desktop/02_settle.dom.html`;
  `evidence/homepage-desktop/network-summary.json`;
  `evidence/homepage-desktop/02_settle.storage.json`.

### 7.10 MCP / AI-catalog discoverability

- The Hub publishes `/.well-known/ai-catalog.json`, `/.well-known/api-catalog`,
  `/.well-known/openapi.json`, and an MCP server card at `/mcp/server-card`
  (MCP server `huggingface.co/mcp`, streamable-http, v0.4.31). This makes the
  Hub discoverable by AI agents and MCP-aware clients as a first-class
  tool/registry provider.
- Evidence: see §5.3.

---

## 8. Stated limitations & uncertainties

These are the limits of *this* analysis (not of the site). They are partly
inherent to REA's passive-capture model and partly to what was exercised.

- **Passive, first-paint only.** REA's `capture-browser-scenario` is passive and
  bounded: it does not click, log in, scroll, or change filters. So
  interaction-only endpoints (`/api/models` pagination, infinite scroll,
  filter changes, login, billing, repo creation) were **not** exercised and are
  described from bundle source, not from recorded traffic.
- **No authenticated flows.** No credentials were used; authenticated areas
  (settings, billing, repo CRUD) are out of scope. The `loggedIn: "false"`
  Plausible custom property and the empty session storage confirm the captures
  were anonymous.
- **No request/response bodies retained.** `request_body` and `response_body`
  were left `false` in the scenario captures, so exact JSON shapes of
  `/api/quicksearch`, `/api/jobs/…/count`, etc. are inferred from the bundle
  (which references `payload.users[].user/avatarUrl`, `payload.count`, etc.),
  not from a recorded response body. Header *values* were retained
  (`header_values: true`), which is how the `x-powered-by`, CloudFront, and
  ratelimit facts were established.
- **No source maps.** The site ships no source maps, so the exported scripts are
  minified production bundles. The reconstructed snippets in
  `snippets/bundle-api-calls.js` are illustrative reformats of the minified call
  sites, not verbatim original source.
- **`inspect-web-page` attached post-load.** Its `network.requests` was empty
  (`prior_activity_available: false`); the network picture comes from the
  scenario captures, which observe from `about:blank` → navigation. The two
  methods are complementary, not redundant.
- **No request initiator stacks for scenario captures.** REA explicitly does
  not infer which script sent which request for scenario captures, so the WAF
  and Stripe fetch/XHR calls are attributed to those libraries by URL/origin
  and by the `<script>` tags in the DOM, not by a proven initiator chain.
- **Point-in-time.** Captured 2026-10-20. The Hub changes frequently; model
  counts ("3,171,792 models", "2M+ models"), exact bundle hashes, and the
  `kube-e3dd6d7` build id are point-in-time and will drift.
- **`rea doctor` environment.** Native binary-analysis engines (Hopper, Ghidra,
  IDA, JADX, Kuna) were not configured — irrelevant for website analysis, which
  needs only a Chrome-family browser (provided). `rea setup` (agent/MCP
  registration) was intentionally skipped; all commands were invoked directly.
- **Global install blocked.** `npm i -g rea-agents` failed with `EACCES` on
  `/usr/lib/node_modules`; REA was used from a local `node_modules` install
  instead. This does not affect output.

---

## 9. Reproducibility (exact commands)

```bash
# Environment
node -v   # v22.23.3
/opt/google/chrome/google-chrome --version   # 154.0.8037.92

# Install REA locally (global install blocked by perms)
mkdir rea-work && cd rea-work && npm init -y && npm install rea-agents@6.7.0
REA="node $(pwd)/node_modules/rea-agents/scripts/rea.mjs"

# 1) Capture pages (launch mode — REA owns a temp Chrome profile)
$REA capture-browser-scenario /abs/huggingface-rea/scenarios/homepage-desktop.json \
  --format json --full-output > evidence/homepage-desktop.raw.json
# (repeat for models-desktop, spaces-desktop, docs-desktop, homepage-mobile)

# 2) Extract artifacts (screenshot/DOM/accessibility/network) from a capture
node scenarios/extract.js evidence/homepage-desktop.raw.json evidence/homepage-desktop

# 3) Static bundle analysis with source-map fetch (needs a live CDP target)
/opt/google/chrome/google-chrome --headless=new --no-sandbox \
  --remote-debugging-port=9223 --user-data-dir=/tmp/chrome-profile about:blank &
curl -X PUT "http://127.0.0.1:9223/json/new?https://huggingface.co/"   # open tab, note id
$REA analyze-web-bundle http://127.0.0.1:9223 <targetId> \
  --allowed-origins https://huggingface.co --fetch-source-maps \
  --format json --full-output > evidence/analyze-web-bundle.raw.json

# 4) Inspect page (with script sources) and export scripts
$REA inspect-web-page http://127.0.0.1:9223 <targetId> \
  --allowed-origins https://huggingface.co --include-script-sources \
  --format json > evidence/inspect-web-page.data.json
$REA export-web-scripts evidence/inspect-web-page.data.json evidence/exported-scripts/

# 5) Network summary per capture
node scenarios/analyze-network.js evidence/homepage-desktop evidence/homepage-desktop/network-summary.json
```

Scenario JSON files are in `scenarios/`; extraction helpers in
`scenarios/extract.js` and `scenarios/analyze-network.js`.

---

## 10. Evidence index

| Path | What |
|---|---|
| `evidence/homepage-desktop.raw.json` | Full REA capture envelope — homepage desktop (1.2 MB) |
| `evidence/homepage-desktop/` | Extracted: `02_settle.{dom.html,accessibility.json,storage.json,history.json,url.json}`, `screenshots/02_settle.png`, `events-all.json`, `network-events.json`, `network-summary.json`, `summary.json` |
| `evidence/homepage-mobile/` | Same, mobile 390×844 @3x |
| `evidence/models-desktop/`, `evidence/spaces-desktop/`, `evidence/docs-desktop/` | Same, per page |
| `evidence/analyze-web-bundle.raw.json` | Static bundle analysis: 30 scripts, 323 import edges, Vite inference, endpoint candidates, 0 source maps |
| `evidence/inspect-web-page.raw.json` | CDP page inspection (DOM tree, scripts, resources, metadata) |
| `evidence/exported-scripts/` | 23 retained JS modules + `manifest.json` (for static analysis) |
| `screenshots/` | Top-level copies of the 5 screenshots |
| `snippets/bundle-api-calls.js` | Reconstructed representative API call sites |
| `scenarios/*.json` | The exact REA scenario inputs (reproducible) |
| `scenarios/extract.js`, `scenarios/analyze-network.js` | Extraction helpers |

---

*End of report.*
