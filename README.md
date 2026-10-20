# huggingface-rea — Reverse-engineering deliverable for huggingface.co

This repository is a **reverse-engineering deliverable** for the public website
<https://huggingface.co/>, produced with **REA (Reverse Engineer Anything)** —
the open-source `rea-agents` MCP server / CLI from eigent.ai
(<https://www.eigent.ai/blog/rea-reverse-engineer-anything>, <https://github.com/morluto/rea>).

It captures what a browser is actually served when visiting the Hugging Face Hub
homepage and a few key linked pages, then statically analyzes the page bundle and
network observations. Findings are evidence-backed (every claim cites a file, URL,
request, or script name) and explicitly note their limits.

> ⚖️ Scope: huggingface.co is a public site. Only what the browser receives was
> observed — DOM, scripts, network requests, response headers, cookies, and
> screenshots. No access controls were bypassed, no authenticated endpoints were
> hit, and no payloads were submitted beyond what the page itself sends
> (AWS WAF challenge + Stripe device fingerprinting).

## What was analyzed

| Target URL | Viewport | REA command | Evidence dir |
|---|---|---|---|
| `https://huggingface.co/` | 1440×900 (desktop) | `capture-browser-scenario` | `evidence/homepage-desktop/` |
| `https://huggingface.co/` | 390×844 @3x (mobile) | `capture-browser-scenario` | `evidence/homepage-mobile/` |
| `https://huggingface.co/models` | 1440×900 | `capture-browser-scenario` | `evidence/models-desktop/` |
| `https://huggingface.co/spaces` | 1440×900 | `capture-browser-scenario` | `evidence/spaces-desktop/` |
| `https://huggingface.co/docs` | 1440×900 | `capture-browser-scenario` | `evidence/docs-desktop/` |
| `https://huggingface.co/` (live tab) | — | `analyze-web-bundle --fetch-source-maps` | `evidence/analyze-web-bundle.raw.json` |
| `https://huggingface.co/` (live tab) | — | `inspect-web-page --include-script-sources` | `evidence/inspect-web-page.raw.json` |

Screenshots (desktop + mobile) are in `screenshots/` and inside each capture dir.

## Tooling & versions (exact)

- **REA:** `rea-agents` npm package, version **6.7.0** (`rea@6.7.0`),
  installed locally via `npm install rea-agents` (global install was blocked by
  `/usr/lib/node_modules` permissions, so the package's `scripts/rea.mjs` was
  invoked directly from `node_modules`).
- **Browser:** Google Chrome **154.0.8037.92** (`/opt/google/chrome/google-chrome`),
  launched headless by REA's Playwright provider in `launch` mode with an owned
  temporary profile. For `analyze-web-bundle` / `inspect-web-page`, Chrome was
  launched separately with `--remote-debugging-port=9223` and REA attached over
  CDP (`http://127.0.0.1:9223`).
- **Node.js:** v22.23.3, npm 10.9.9, Linux x86_64 (Ubuntu 24.04).

## How to reproduce

```bash
# 1. Install REA locally (global install needs root; local install works).
mkdir rea-work && cd rea-work && npm init -y && npm install rea-agents@6.7.0
REA="node node_modules/rea-agents/scripts/rea.mjs"

# 2. Capture a page (launch mode — REA owns a temp Chrome profile).
$REA capture-browser-scenario /abs/path/to/scenarios/homepage-desktop.json \
  --format json --full-output > homepage-desktop.raw.json

# 3. (Optional) Static bundle analysis with source-map fetch.
/opt/google/chrome/google-chrome --headless=new --no-sandbox \
  --remote-debugging-port=9223 --user-data-dir=/tmp/chrome-profile about:blank &
curl -X PUT "http://127.0.0.1:9223/json/new?https://huggingface.co/"   # open a tab
$REA analyze-web-bundle http://127.0.0.1:9223 <targetId> \
  --allowed-origins https://huggingface.co --fetch-source-maps \
  --format json --full-output > analyze-web-bundle.raw.json

# 4. Extract discrete artifacts (screenshot / DOM / network / scripts) from a
#    capture with the helper in scenarios/extract.js, and export scripts with
#    `rea export-web-scripts`.
node scenarios/extract.js homepage-desktop.raw.json homepage-desktop
$REA export-web-scripts inspect-web-page.data.json exported-scripts/
```

The exact scenario JSON files used are in `scenarios/`. The extraction helpers are
`scenarios/extract.js` (splits a capture into screenshot/DOM/accessibility/network
files) and `scenarios/analyze-network.js` (groups network events into a summary).

## Repository layout

```
huggingface-rea/
├── README.md                 ← this file
├── report.md                 ← the main reverse-engineering report (findings + evidence)
├── screenshots/              ← desktop + mobile screenshots (top-level copies)
├── snippets/                 ← representative reconstructed code excerpts
│   └── bundle-api-calls.js
├── scenarios/                ← REA scenario JSON + extraction helpers (reproducible)
│   ├── homepage-desktop.json … docs-desktop.json
│   ├── extract.js
│   └── analyze-network.js
└── evidence/                 ← raw REA output + extracted artifacts
    ├── homepage-desktop/  models-desktop/  spaces-desktop/
    │   docs-desktop/      homepage-mobile/      (per-capture extracted artifacts)
    ├── *.raw.json             (full REA output envelopes)
    ├── analyze-web-bundle.raw.json   (static bundle + import graph)
    ├── inspect-web-page.raw.json     (CDP page inspection)
    └── exported-scripts/       (the 23 retained JS modules, exported for static analysis)
```

## Headline findings (see report.md for detail and evidence)

- **Stack:** SvelteKit on Svelte 5 (runes), bundled with **Vite + Rolldown**
  (`rolldown-runtime`), served as fully **server-side-rendered** HTML with client
  hydration. Build dir: `/front/build/kube-e3dd6d7/…` with content-hashed filenames.
  No source maps are shipped (`source_maps: 0`).
- **Origin / edge:** `x-powered-by: huggingface-moon` (HF's own server, "moon"),
  fronted by **AWS CloudFront** (`via`, `x-amz-cf-id`, `x-amz-cf-pop=IAD55-P8`,
  `x-cache: Hit from cloudfront`), with **HTTP/3** (`alt-svc: h3=":443"`).
- **Bot protection / payments:** **AWS WAF** challenge (`*.edge.sdk.awswaf.com`
  `challenge.js`, `mp_verify`, `telemetry`, `aws-waf-token` cookie) and **Stripe.js**
  (`js.stripe.com/dahlia/stripe.js`, `m.stripe.com` device fingerprint, `__stripe_mid`
  / `__stripe_sid` cookies) are loaded on every page.
- **Analytics:** self-hosted **Plausible** (`endpoint: /api/event`,
  `customProperties.loggedIn`).
- **API surface:** the Hub publishes `/.well-known/openapi.json` (OpenAPI 3.1,
  "Hub API Endpoints"), `/.well-known/api-catalog`, `/.well-known/ai-catalog.json`,
  and an **MCP server** at `https://huggingface.co/mcp` (server-card version 0.4.31,
  streamable-http). Client bundles call `/api/quicksearch`, `/api/jobs/{id}/count`,
  `/api/feedback`, `/api/check-username`, `/api/client-errors`, `/api/settings/metrics/live`
  (SSE/streaming — `text/event-stream` + `getReader`), and `POST /settings/theme`.
- **Rendering model:** pages are SSR'd with the data already embedded (e.g. the
  models list, trending feed) — initial loads issue **no** client-side fetch to
  `/api/models`; the only XHR/fetch on first paint are AWS WAF + Stripe. A large
  `window.hubConfig` blob is injected for client bootstrapping.
- **Key features:** model/dataset/Space browsing with a dense faceted filter UI
  (tasks, parameter slider, libraries, apps, inference providers), quicksearch,
  live metrics streaming, theme toggle, SSO/signup banners, KaTeX math rendering,
  and an MCP-first discoverability layer.

## Limitations

- REA's `capture-browser-scenario` is **passive and bounded**: it does not click
  around, log in, or exercise authenticated flows. Only first-paint behavior was
  captured. Authenticated areas (settings, billing, repo creation) were not
  exercised and are out of scope.
- Response/request **bodies** were not retained (`request_body/response_body`
  left false) — only header names+values, URLs, and metadata. So exact JSON
  shapes of `/api/quicksearch` etc. are inferred from bundle source, not from a
  recorded response body.
- **No source maps** are shipped by the site, so the exported scripts are
  minified production bundles; reconstructed snippets are illustrative, not
  verbatim original source.
- `inspect-web-page` attached after load, so its `network.requests` was empty
  (`prior_activity_available: false`); the network picture comes from the
  scenario captures, which observe from `about:blank` → navigation.
- REA explicitly does not infer request initiator stacks for scenario captures,
  so "which script sent which request" is not proven for the WAF/Stripe calls.
- Capture dates: 2026-10-20. The Hub changes frequently; counts (e.g. "3,171,792
  models") and exact bundle hashes are point-in-time.

## License of this deliverable

The reverse-engineering notes, report, and helper scripts in this repo are
provided as-is for documentation purposes. The exported JavaScript bundles under
`evidence/exported-scripts/` are **Hugging Face's production minified code**,
retained solely as analytical evidence of what the browser was served; they are
not licensed for redistribution and are not original work of this deliverable.
