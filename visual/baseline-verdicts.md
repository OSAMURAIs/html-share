# V0 visual baseline — context-free review verdicts

Recorded at:

- html-share `daa9a6e48e0a1aa162e82dbea3fb83d9afe69ade` (origin/main)
- html-share-hub `c9a3d374776104671751a21aaf8e29604c965bbc` (origin/main)
- Chrome 151.0.7922.174, headless, 100% zoom, device scale factor 1
- Current side: sanitized deterministic fixture build (presentation code unmodified)

The reviewers did not build the harness and did not read its code. Each answered one
question per route:

> Would a user seeing both identify the current candidate as the production version of
> Prototype v5?

The current baseline was expected to fail. No threshold was adjusted to make it pass.

> **Unchanged by the V0.1 authority correction.** V0.1 corrected what the acceptance
> *target* means — written authority takes precedence over the Prototype, and a Prototype
> defect is never a production target. It did not change what was measured. All 60 capture
> metric documents compare byte-identical before and after the correction, every verdict
> below stands as recorded, and the candidate still passes 0 of 15 routes. Because the
> correction only ever tightens the target, none of these verdicts could improve under it.

## Verdicts

| Destination | Verdict | Worse viewport |
| --- | --- | --- |
| home | FUNDAMENTALLY DIFFERENT | mobile |
| research.overview | FUNDAMENTALLY DIFFERENT | desktop |
| research.feed | FUNDAMENTALLY DIFFERENT | neither |
| research.papers | FUNDAMENTALLY DIFFERENT | desktop |
| research.knowledge-review | FUNDAMENTALLY DIFFERENT | desktop |
| personal.current | FUNDAMENTALLY DIFFERENT | mobile |
| personal.plans | MATERIAL GAP | neither |
| personal.library | MATERIAL GAP | desktop |
| personal.travel | FUNDAMENTALLY DIFFERENT | neither |
| investment.dashboard | FUNDAMENTALLY DIFFERENT | mobile |
| investment.pulse | MATERIAL GAP | mobile |
| investment.positions | PARTIAL | desktop |
| investment.decisions | MATERIAL GAP | desktop |
| investment.journal | MATERIAL GAP | neither |
| operational.live-work | FUNDAMENTALLY DIFFERENT | desktop |

Distribution: **9 FUNDAMENTALLY DIFFERENT · 5 MATERIAL GAP · 1 PARTIAL · 0 CLOSE.**

Guardrail agreement: 0 of 15 routes pass the geometry contract; 174 failing checks of 583,
29 of them critical.

## Cross-route findings from the reviewers

These are observations about the current candidate, recorded as V1 input. They are not
instructions to change anything in V0.

1. **A page-header slab appears on every route that the Prototype does not have anywhere.**
   The Prototype opens each page with an eyebrow, a title and right-aligned metadata on the
   page background. The candidate opens with a filled dark banner that consumes a large part
   of the first fold. Measured: first content begins at y=38 on the Prototype and at
   y=228–345 on the candidate at 1280x900.

2. **One card template is applied to every route.** Reviewers independently reported that
   `investment.decisions` and `investment.journal` — which look nothing alike in the
   Prototype — render as the same layout with different titles, and likewise
   `investment.dashboard` versus `investment.pulse`.

3. **No quantitative figures exist.** The Prototype encodes allocation as a donut and P/L as
   a divergent bar chart growing outward from a zero rule. Measured: 10 quantitative visuals
   on the Prototype dashboard, 0 on the candidate. Both appear as plain tables instead.

4. **Compact components are replaced by looser ones.** Label/value tables become
   heading-plus-paragraph prose; boxed stat tiles become concatenated text
   ("Total assets¥4,060,000"); filter pills become default-bordered buttons; the papers
   collection table disappears entirely.

5. **Asymmetric multi-column compositions collapse.** Measured page-band column counts,
   Prototype versus candidate: research.overview 3→1, research.papers 3→1,
   research.knowledge-review 2→1, personal.current 2→1, personal.travel 2→1,
   investment.decisions 2→1, investment.journal 2→1, operational.live-work 2→1,
   investment.pulse 4→2, home 3→2.

6. **Colour carries no semantics.** The Prototype uses amber Waiting, red Blocked, tinted
   lifecycle bands and six chip hues as sorting signals. The candidate uses one pale blue
   chip everywhere.

7. **Empty states dominate sparse routes.** Reviewers noted this would look structurally
   identical with real data, so it is a presentation issue rather than a fixture artifact.

8. **Shell chrome has visible defects.** Floating controls overlap the rail's inbox label,
   the circular home button clips the first domain tab label, and on mobile the primary nav
   overlaps the tab strip. These are current-side implementation defects, observed on
   multiple routes.

## What this baseline does not establish

Live-source information preservation. The current side renders sanitized hub fixtures, so
nothing here shows whether real source content survives into the page.
