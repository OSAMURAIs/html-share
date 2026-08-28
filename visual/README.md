# V0 visual acceptance harness

An objective harness for comparing the **current presentation** against the **production
target**. It exists so that a materially non-conformant page cannot be declared acceptable
again on impression alone.

V0 builds the harness. It does **not** repair the presentation.

## Authority model — read this first

Prototype screenshot comparison is **mandatory**, **but** visual acceptance is against the
**normative production target**, which is:

> **Prototype v5 + the explicit final production deltas.**

Precedence:

| Rank | Source | Role |
| --- | --- | --- |
| 1 | `html-share-ui-v5-to-implementation-master-handoff.md` | **Normative.** Explicit requirements here override Prototype rough edges, omissions and implementation limitations. |
| 2 | Prototype v5 as it actually renders | **Primary visual and composition baseline** — geometry, hierarchy, palette, typography, spacing, composition, domain grammar, desktop/mobile gestalt — unless a rank 1 delta applies. |
| 3 | `DESIGN-DECISIONS.md`, `INFORMATION-PRESERVATION.md`, `REVIEW-v5.md` | **Intent and constraint clarification.** Not discarded merely because the Prototype's JS or CSS failed to implement an intended production behaviour. |

A candidate **never** becomes acceptable by reproducing a Prototype defect or omission.

> An earlier revision of this harness let the Prototype override the written authority
> wherever the two disagreed. That rule was **wrong** and is not the project contract. It
> has been corrected. If you find anything that still elevates the Prototype above the
> written authority, it is stale.

Every place the Prototype and the production target differ is enumerated in the contract's
`divergences`, each carrying `prototype_observed`, `production_target`, `authority_source`
and `rationale`. Those places are also printed on the affected route's comparison sheet, so
a reviewer is told where the left-hand column is **not** the standard.

## One command

```bash
npm run visual
```

Prerequisites:

| Requirement | Detail |
| --- | --- |
| Node | >= 22 (the CDP client uses the global `WebSocket`; developed on 24.19.0) |
| Chrome | Any recent build. Resolved automatically, or set `HTML_SHARE_VISUAL_CHROME` |
| Python | 3.11+ on `PATH`, or set `HTML_SHARE_VISUAL_PYTHON` |
| `npm run build` | The harness drives the compiled CLI at `dist/src/cli.js` |
| Prototype v5 | `reference/html-share-ui-prototype-v5/...`, or set `HTML_SHARE_VISUAL_PROTOTYPE_ROOT` |
| html-share-hub | A sibling checkout, or set `HTML_SHARE_VISUAL_HUB_ROOT` |

There is no browser-automation dependency. The harness speaks the Chrome DevTools
Protocol directly over Node's built-in WebSocket.

## What it does

1. **Prototype side** — serves the actual Prototype v5 implementation verbatim, including
   its own fixture JS. The Prototype is the authority, so it is never reconstructed.
2. **Current side** — runs the hub's sanitized deterministic preview (no live source is
   read at all), then builds it through the supported local path
   (`html-share build` with `HTML_SHARE_PREVIEW_LOCAL=1`) and serves it exactly the way
   `scripts/preview.mjs` does. Presentation code is the authoritative current
   implementation, unmodified.
3. Captures all 15 destinations on both sides at 1280x900 and 390x844.
4. Extracts computed geometry from the live document — never from CSS source text.
5. Evaluates `visual/route-geometry.contract.json`.
6. Writes comparison sheets and a review gallery.

Nothing contacts production. No AWS call, no publish, no CloudFront invalidation.

## Output

Generated under `.html-share/visual/<run>/`, which is gitignored. Screenshots are build
output, not repository content.

```
run.json                      run metadata, provenance, capture inventory, self-validation
captures/
  <destination>__<side>__<w>x<h>.png        required first-fold capture
  <destination>__<side>__<w>x<h>__full.png  supplementary full-length capture
  <destination>__<side>__<w>x<h>.json       capture metadata + computed metrics
comparisons/
  index.html                  gallery
  <destination>.html          per-route comparison sheet
acceptance/
  guardrails.json             every check, with prototype and current values
  review-packet.md            the context-free reviewer's worklist
```

File naming is derived from identity, never from ordering, so the same destination maps
to the same filename on every run and on every machine.

## The contract

`visual/route-geometry.contract.json` is committed, human-readable acceptance metadata.
It is **not** a screenshot hash. It records, per destination:

- expected major section order, with matchers that work against either implementation
- principal desktop layout, column count and column ratios
- the repeating content grid, recorded separately from the page band
- primary first-fold content and a first-fold density proxy
- explicit mobile hierarchy: section order, critical first-screen information, table
  overflow strategy, sticky identity, and a hierarchy note that says more than
  "desktop columns stack"
- route-specific visual grammar (wide tables, sticky identity, quantitative figures)

It also records `divergences` — every place the Prototype and the production target differ,
each with `prototype_observed`, `production_target`, `authority_source` and `rationale` —
and a `motion_contract` classifying each behaviour as `IMPLEMENTED_IN_PROTOTYPE`,
`REQUIRED_PRODUCTION_DELTA` or `NOT_REQUIRED`, with normal and `prefers-reduced-motion`
expectations wherever production motion is required.

Route views describe the **production target**. Where the Prototype does not meet it, the
route carries a divergence rather than a weakened expectation.

### Guardrail tolerances

| Guardrail | Tolerance |
| --- | --- |
| Principal content width | within 8% of Prototype |
| Major column ratios | within 10 percentage points |
| Body and table font size | within 1 CSS px |
| Major headings | within 2 CSS px |
| Major section order | exact |
| First content start / global chrome extent | 48 px / 24 px, Prototype-relative |
| Large unexpected horizontal overflow | fail |
| Mobile critical-content clipping | fail |

These detect gross drift. They are deliberately not a pixel-perfect diff.

### Two validations, two different questions

Every run answers both, and fails if either does.

**Prototype observation** — *did the harness measure the Prototype correctly?*
Evaluates the contract with the Prototype standing in as both sides, in
`prototype_observed` mode. Every check must pass or be a named, recorded Prototype defect.
This mode tolerates the defects, which is exactly why it must never grade a candidate.

**Production target integrity** — *would the acceptance standard reject a candidate that
copied a Prototype defect?* Evaluates the Prototype in `production_target` mode and
requires every geometry-observable recorded defect to actually **fail**. If one passed, a
candidate could satisfy the standard by copying it — the failure mode this split exists to
prevent.

Both modes read the *same* contract. Observation mode does not use a weaker one; it applies
named, enumerated relaxations on top of the production target, so the two cannot drift
apart.

Written to `acceptance/guardrails.json` (production target) and
`acceptance/prototype-observation.json` (both validations).

## Reviewing

The guardrails are objective but they do not produce the verdict. A reviewer who did not
build the harness reads `acceptance/review-packet.md`, looks at each comparison sheet and
answers one question:

> Would a user seeing both identify the current candidate as the production version of
> Prototype v5?

Allowed verdicts: `CLOSE`, `PARTIAL`, `MATERIAL GAP`, `FUNDAMENTALLY DIFFERENT`.

Page wording differs by design — the current side renders sanitized fixture content — so
the reviewer judges presentation, not wording. Each sheet also prints that route's
divergences, so the reviewer knows where the Prototype column is *not* the standard.

## Known limitations

- **This is a presentation baseline, not a source-completeness proof.** The current side
  renders sanitized fixtures. Nothing here demonstrates that live source information is
  preserved.
- **Fonts are machine-dependent.** Prototype v5 declares `Inter` with no `@font-face` and
  no font link, so a machine without Inter installed falls back. The resolved family is
  recorded in every capture's typography metrics; compare it before comparing font sizes
  across machines.
- **Second-machine reproduction is pending.** The harness is portable and deterministic,
  but has so far only been run on one machine.
- **Current-side rasters carry the build timestamp.** The local build stamps a wall-clock
  `updated_at` per page and the shell renders it, so current-side PNGs are byte-identical
  between back-to-back runs but differ across time. Prototype-side PNGs are byte-identical
  always. **Computed geometry is unaffected** — all 60 metric documents compare byte-identical
  across the authority correction. Judge reproducibility on `metrics`, not on PNG bytes.

## Options

```bash
node scripts/visual/run.mjs --only home,investment.positions   # subset, for iteration
node scripts/visual/run.mjs --out .html-share/visual/run-2     # alternate output root
```
