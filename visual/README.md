# V0 visual acceptance harness

An objective harness for comparing the **current presentation** against **Prototype v5**,
the only visual authority. It exists so that a materially non-conformant page cannot be
declared acceptable again on impression alone.

V0 builds the harness. It does **not** repair the presentation.

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

It also records `known_prototype_defects` — places where the Prototype implementation is
wrong and V1 must reconstruct the intent rather than replicate the defect — and a
`motion_contract` defining normal and `prefers-reduced-motion` behaviour for every
transition V1+ will implement.

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

### The contract validates itself

Every run evaluates the contract with the Prototype standing in as both sides. If the
design authority cannot satisfy its own contract — outside the failures listed in
`expected_prototype_failures` — the run fails. A contract that has drifted away from the
Prototype cannot keep quietly grading the candidate.

## Reviewing

The guardrails are objective but they do not produce the verdict. A reviewer who did not
build the harness reads `acceptance/review-packet.md`, looks at each comparison sheet and
answers one question:

> Would a user seeing both identify the current candidate as the production version of
> Prototype v5?

Allowed verdicts: `CLOSE`, `PARTIAL`, `MATERIAL GAP`, `FUNDAMENTALLY DIFFERENT`.

Page wording differs by design — the current side renders sanitized fixture content — so
the reviewer judges presentation, not wording.

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

## Options

```bash
node scripts/visual/run.mjs --only home,investment.positions   # subset, for iteration
node scripts/visual/run.mjs --out .html-share/visual/run-2     # alternate output root
```
