# Harness metadata and metric schemas

Three versioned schemas. Their identifiers are constants in the harness and are pinned by
`test/visual-harness.test.ts`, so a schema change is a deliberate, visible edit.

| Schema id | Written to | Defined in |
| --- | --- | --- |
| `html-share.visual.capture/1` | `captures/<name>.json` | `scripts/visual/capture.mjs` |
| `html-share.visual.metrics/1` | `metrics` inside each capture | `scripts/visual/metrics.mjs` |
| `html-share.visual.acceptance/2` | `acceptance/guardrails.json` | `scripts/visual/check.mjs` |
| `html-share.visual.run/1` | `run.json` | `scripts/visual/run.mjs` |
| `html-share.visual.contract/1` | `visual/route-geometry.contract.json` | committed data |

Identity never depends on filenames alone: every capture carries its own metadata.

## `html-share.visual.capture/1`

```
schema                        the schema id
destination_id                one of the 15 v5 destination ids
domain                        home | research | personal | investment | operational
side                          prototype | current
viewport                      { name, width, height, device_scale_factor, mobile_emulation, zoom }
route_path                    stable per-side path (no ephemeral port)
url                           full local URL, debugging only
files                         { fold, full, metrics } relative paths
full_capture                  { height, content_height, truncated }
browser                       { product, user_agent, protocol_version, executable, headless, zoom, device_scale_factor }
tool                          { name, node, platform }
repositories                  { "html-share": <commit>, "html-share-hub": <commit> }
source                        side provenance (source_mode, roots, commits, preview mode, note)
presentation_asset_version    the v5 presentation contract and asset list
captured_at                   ISO timestamp (the only intentionally volatile field)
console_errors                up to 10 page console errors
metrics                       an html-share.visual.metrics/1 document
```

`source.source_mode` is `prototype_v5_actual_implementation` or
`sanitized_deterministic_fixture_build`. The latter carries an explicit note that the
baseline proves presentation, not live-source completeness.

## `html-share.visual.metrics/1`

All values are read from the live document with `getComputedStyle` and
`getBoundingClientRect`. Content-document coordinates are translated into the outer
viewport so both sides are measured on one common frame.

```
shell.globalChrome            { present, selector, x, y, width, height, position,
                                itemCount, orientation, occupiesLeftGutter }
shell.rail / shell.header     raw per-role bounds
shell.globalNavigation        bounds + item count
shell.domainNavigation        bounds + item count
shell.utilityActions          bounds + item count
shell.contentViewport         { x, y, width, height }
shell.firstContentY           first visible text top, composed coordinates

typography.body|h1|h2|h3|tableBody   { selector, fontSize, lineHeight, fontWeight, fontFamily }
typography.meta                      { fontSize, count } — smallest size carrying >= 3 text nodes
typography.dominantBodySize          most common text size
typography.sizeHistogram             size -> element count

main.principalContainer       { selector, mainSelector, x, y, width, height, contentWidth,
                                maxWidth, paddingLeft, paddingRight }
main.primaryContentTop        first content top
main.principalBandSelector    the page-level multi-column row
main.columnCount / columnWidths / columnRatios      that page band
main.contentBandSelector                            the largest repeating content grid
main.contentColumnCount / contentColumnRatios       that content band
main.columnBands              up to 10 bands with depth, chrome flag, grid-template-columns
main.chromeSections           page header / domain tabs, excluded from section order
main.sectionOrder             ordered majors: { index, tag, selector, classList, heading,
                                y, height, inFirstFold }
main.documentScrollWidth / documentClientWidth / documentScrollHeight
main.horizontalOverflowPx
main.overflowingElements      { selector, scrollableAncestor, scrollWidth, clientWidth,
                                overflowX, beyondViewportPx, overflowStyle }
main.firstFoldDensity         { textChars, textElements, interactiveElements, foldArea,
                                charsPerMegapixel }

grammar.tables                { selector, inScrollContainer, columnCount, rowCount, width,
                                scrollWidth, overflowsViewport }
grammar.stickyElementCount / stickySelectors
grammar.svgCount / canvasCount / proportionalBarCount
grammar.quantitativeVisualCount   figures counted regardless of technique: inline percentage
                                  custom properties, conic-gradient backgrounds, svg, canvas,
                                  meter, progress
grammar.listCount / headingCounts
grammar.classHistogram        every emitted class and its count — also the evidence used by
                              the cross-repository class contract
```

### Definitions that make the two sides comparable

- **Page wrapper** — the principal container, unwrapped through single full-height children,
  so both sides are measured at the level whose children are the page's major sections.
- **Major sections** — the direct children of the page wrapper, excluding page chrome
  (`header`, `nav`, `page-head`, `workspace-tabs`, `page-header`, `domain-nav`).
- **Page band** — the first direct-child multi-column row at least 80px tall that is not
  chrome. This is a page-layout metric, not a nested card grid.
- **Content band** — the largest multi-column row within three levels, for routes that group
  their content (feed batches, library regions) below the page band.
- **Meta text** — the smallest computed font size carrying at least three visible text nodes.
  A structural rule, not a hand-picked selector per side.
- **Clipping** — content past the viewport with no scrollable ancestor. A wide table inside
  an `overflow-x:auto` wrapper is the intended pattern, not clipping.

## `html-share.visual.acceptance/2`

```
schema
mode                          production_target | prototype_observed
acceptance_standard           prose statement of what this document graded against
tolerances
routes.<id>.divergences[]     the recorded Prototype-vs-target divergences for this route
routes.<id>.checks[]          { id, title, status, severity, detail, divergence? }
routes.<id>.counts            { pass, fail, skip, observed_prototype_defect,
                                critical, major, minor }
routes.<id>.guardrail_status  PASS | FAIL
summary                       mode plus route and check totals
```

### Modes

`production_target` is the acceptance standard and the default: Prototype v5 plus the
explicit production deltas the final handoff requires. **Recorded Prototype defects are not
part of it**, so a candidate can never pass by copying one.

`prototype_observed` exists only to prove the harness measured the Prototype correctly. It
evaluates the *same* contract and then applies named, enumerated relaxations drawn from
`contract.divergences[].relaxed_in_prototype_observation`. It must never grade a candidate.

### Statuses

| Status | Meaning |
| --- | --- |
| `PASS` | The check was satisfied. |
| `FAIL` | The check was not satisfied. Carries `severity`. |
| `SKIP` | The comparison was not possible (value missing on one side, or no contract declared). Reported, never counted as a pass. |
| `OBSERVED_PROTOTYPE_DEFECT` | `prototype_observed` mode only. The Prototype fails this check because of a recorded divergence; the entry carries that divergence's `prototype_observed`, `production_target` and `authority_source`. In `production_target` mode the same check is a plain `FAIL`. |

Every `detail` carries both the Prototype value and the current value, so a failure states
what was expected and what was measured rather than only that something differed.

## `divergences[]` in the contract

```
id                                stable identifier
where                             a destination_id, or "global"
aspect                            shell | layout | typography | colour | domain-grammar |
                                  mobile | motion | information-preservation
prototype_observed                what the Prototype actually does
production_target                 what a candidate must do instead
authority_source                  the document and section that requires the target
rationale                         why the target differs from the Prototype
relaxed_in_prototype_observation  check ids the Prototype legitimately fails, tolerated in
                                  prototype_observed mode only (omit when the divergence is
                                  not geometry-observable, e.g. motion)
```
