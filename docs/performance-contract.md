# Browser Performance Contract (v1)

This document is the browser-facing contract for `html-share`. It covers the
owner dashboard, canonical content pages, publication behavior, and the
operational boundaries that can be measured from a trusted authenticated
browser. It does not define `html-share-hub` behavior.

## Current baseline (structural, local)

The current source tree is the baseline used by the deterministic checks:

| Item | Current raw size | v1 budget |
| --- | ---: | ---: |
| `web/app/index.html` | 57,088 bytes | 81,920 bytes (80 KiB) |
| `web/page-list.js` | 19,807 bytes | 32,768 bytes (32 KiB) |
| Combined critical shell | 76,895 bytes | 122,880 bytes (120 KiB) |

These are source-tree byte measurements, not production transfer timings.
Production wall-clock baselines must be collected later from the trusted
Windows host after publication reaches production.

The current dashboard bootstrap loads `page-list.js`, navigation code, and the
inline dashboard shell, then requests owner preferences and the owner shares
manifest; the Inbox indicator separately checks review state. Desktop opens a
canonical page in the dashboard iframe. Narrow/mobile navigation opens the
canonical page at top level. Canonical pages are bundled with local assets as
data URLs and inline table behavior; their content CSP has `connect-src
'none'`, so the document is network-self-contained after its document request.

The generated web manifest currently has the identity/navigation fields
`name`, `short_name`, `lang`, `start_url`, `scope`, `display`, `theme_color`,
and `icons` (192px, 512px, and maskable 512px). It intentionally has no
service worker, stable `id`, or shortcuts requirement in v1.

The current publication path sets `Cache-Control: no-store, max-age=0` on
published S3 objects and on CloudFront responses. Both content and console
CloudFront distributions use `CACHING_DISABLED`; owner APIs and auth/review
handlers also explicitly use no-store where applicable. This is current
behavior, not an immutable architecture promise.

## Contractual invariants

### Metrics and scenarios

- Dashboard list-ready latency is the primary user-visible startup metric.
- Canonical page-open latency is a separate metric.
- Desktop iframe navigation and mobile top-level navigation are separate
  scenarios and must not be pooled into one number.

### Network

- There must be no third-party runtime requests.
- After the canonical content document request, the page must remain
  network-self-contained.
- Ordinary initial dashboard boot must not introduce duplicate application API
  or resource requests.
- Browser-managed favicon and PWA-manifest requests are not application
  request counts.

### Shell budgets

These are hard raw-byte budgets:

- `web/app/index.html` <= 80 KiB (81,920 bytes).
- `web/page-list.js` <= 32 KiB (32,768 bytes).
- Combined critical shell <= 120 KiB (122,880 bytes).

### Freshness

Browser freshness starts after publication has reached production. One explicit
browser reload must be sufficient to obtain the current manifest and content.
V1 does not promise automatic dashboard-manifest refresh merely on foreground
or visibility return. Inbox visibility refresh is current behavior, not the
general dashboard freshness mechanism.

Personal's approximately 1–2 minute convergence, Live Work's approximately
10–20 second target, and approximately 6-hour reconciliation are upstream
publication/runtime expectations. They are not browser-delivery latency
promises. A later independent `html-share-hub` change may add generated
canonical HTML byte/complexity budgets after real generated artifact sizes are
collected; no hub code is part of this contract.

### Cache policy

The contract is defined by resource class rather than by permanently freezing
one header value:

- Owner APIs must not be reused as stale cached data.
- Mutable manifest and content must preserve explicit-refresh freshness.
- Non-fingerprinted shell assets must not become unsafe immutable cache entries.
- Future fingerprinted static assets may be cached aggressively.
- Any future cache change must preserve the security, privacy, and freshness
  invariants above.

### PWA

The generated manifest must validate `start_url`, `scope`, `display`, and the
current icon set. Stable `id` and shortcuts are future enhancements, not v1
completion requirements. This task does not add a service worker.

## Provisional timing targets

These targets remain provisional until a trusted-host production baseline is
available and are not unstable wall-clock CI gates:

| Scenario/metric | Target |
| --- | ---: |
| Dashboard list-ready, desktop normal broadband, p95 | <= 2.0 s |
| Dashboard list-ready, mobile Fast-4G-equivalent, p95 | <= 3.0 s |
| Canonical page open, desktop, p95 | <= 1.5 s |
| Canonical page open, mobile, p95 | <= 2.5 s |
| Cumulative Layout Shift | <= 0.1 |
| Immediate local UI feedback (search/star/read-state) | <= 100 ms |

A timing regression is significant when both the median degrades by more than
25% and the absolute median increase exceeds 200 ms. Absolute target breaches
should also be reviewed.

## Baseline collection design

`scripts/performance-baseline.mjs` provides a small sanitizer/formatter for a
browser-console or trusted-host measurement record. It does not run a browser,
modify production, or add telemetry. A sanitized record may contain:

`timestamp`, browser/version, viewport/device profile, cold/warm mode,
scenario, TTFB, DOMContentLoaded, load, dashboard list-ready or page-ready,
FCP, LCP, CLS, request count, transfer bytes, manifest duration, preferences
API duration, reviews API duration, and bfcache/pageshow information for back
navigation.

The helper removes cookies, signed URLs, credentials, auth headers, raw private
page contents, and sensitive query strings. Store only the resulting JSON
record, never a HAR or page dump.

Until reliable list-ready instrumentation can be added without changing
production UI behavior or introducing permanent telemetry, use this manual
procedure:

1. On the trusted authenticated Windows host, open DevTools Network and
   Performance, enable Disable cache only for a cold run, and use a clean
   profile or explicit reload.
2. Record separate desktop-iframe and mobile-top-level runs, each as cold and
   warm. Mark the document request, manifest request, preferences request,
   reviews request, shares request, list-ready moment, and page-ready moment.
3. Read TTFB/DOMContentLoaded/load from Navigation Timing, FCP/LCP from Paint
   and Largest Contentful Paint entries, CLS from Layout Shift entries, and
   request/transfer totals from the Network summary. Treat favicon and
   manifest as browser-managed requests, not application requests.
4. For back navigation, record `pageshow.persisted` and the bfcache restoration
   result. Sanitize any URL before saving and do not save request headers,
   cookies, signed query parameters, or page text.
5. Produce one sanitized record per run and compare medians/p95s only within
   the same scenario, device profile, and cold/warm mode.

## Review guardrails

This contract is intentionally non-behavior-changing. v1 does not add browser
UX, cache, CloudFront, dashboard freshness, bfcache, Web Share, service-worker,
or PWA-shortcut work. Any such change must preserve these invariants and add a
new focused review and measurement plan.
