# html-share v5 — Current Implementation State

Last updated: 2026-08-27 JST

## Status

V5 Reconstruction Audit — COMPLETE
Phase R1 Presentation Foundation & Preview — COMPLETE / MERGED
Phase R2 Research End-to-End — COMPLETE / MERGED
Phase R3 Personal End-to-End — COMPLETE / MERGED
Phase R4 Investment — COMPLETE / MERGED
Phase R5 Home + Browser Shell — COMPLETE / MERGED
Phase R6 Integrated V5 Acceptance — NEXT
Phase R7 Production Cutover — BLOCKED

Prototype v5 and the final implementation handoff remain the sole UI/UX/IA
authority. The Phase 3 presentation branches remain reference-only and are not
the implementation lineage.

## Production topology

Normal production/generated path remains:

12 static canonical
+
1 separate operational Live Work

Production has NOT been cut over to v5.

## Development / acceptance topology

Isolated v5 staging/development target is:

14 static canonical
+
1 separate operational Live Work

This is the v5 development/acceptance path, not normal production generation.

## Final authoritative mains

html-share:

30e2a2eae1abe7b51a746eedcd27a5e6b9e21cb7

html-share-hub:

338b195eb4f8ae70c468cc79f9c5ec889f027841

R1 pull requests:

- html-share #11 — merged
- html-share-hub #21 — merged

Accepted implementation tips before merge:

- html-share: 02238d49ddf7bc4f87aed169c79cfa56342ad9ef
- html-share-hub: 775a8bbc135cf8b5ede0f650625cc95b8159e04b

R2 pull request:

- html-share-hub #22 — merged
- validated R2 head: cb9392e61d2077b9b9735aa0bcd20373eeaca447

R3 pull request:

- html-share-hub #23 — merged
- accepted R3 head: 91dc123731b2264fc36ae852bb4ccc980410df7c
- merge commit: 59decd9d96d8e22a896020f99140ff389b5c41f5

R5 pull requests:

- html-share #13 — merged; merge commit: 30e2a2eae1abe7b51a746eedcd27a5e6b9e21cb7
- html-share-hub #25 — merged; merge commit: 338b195eb4f8ae70c468cc79f9c5ec889f027841

## R5 Home + Browser Shell closure facts

- Home consumes accepted R2/R3/R4 semantics and is not a new source of truth.
- html-share is the sole visible application-shell owner.
- Global human-domain navigation is Home, Research, 暮らし, and Investment.
- Live Work is separate operational access, not a fifth peer human-domain category.
- Generated canonical pages do not duplicate the full application/global/domain navigation shell.
- All seven representative routes were CONFORMANT at 1280×900 and 390×844.
- Browser runtime acceptance passed.
- BFCache runtime classification was NOT ENTERED + CONTRACT VERIFIED.
- No production topology change occurred and R5 did not perform production cutover.
- Production remains 12 static canonical + 1 operational Live Work.

## R2 Research closure facts

- Research Feed is candidate-level.
- Candidate-to-project relation was not inferred when unsupported.
- No Research KB schema migration was required.
- Current digest candidates without an explicit relation remain unclassified.
- Papers preserve the complete lifecycle collection.
- Papers use honest source-backed focus/current semantics rather than inferred priority.
- Knowledge Review preserves complete useful review and backlog information.
- Research desktop/mobile visual acceptance passed.
- No R1 shared-foundation defect or change was required by R2.

## R3 Personal closure facts

- Final Personal acceptance used live read-only Notion data.
- All eight required Personal visual acceptance cells were CONFORMANT: Current desktop/mobile, Plans desktop/mobile, Library desktop/mobile, and Travel desktop/mobile.
- Current uses honest deterministic focus semantics; human-authored `現在地` and `次の一手` remain source-backed.
- Plans preserves the complete lifecycle collection.
- Library uses canonical lifecycle semantics with no fabricated Shopping intent gradient.
- Travel uses repeatable page-body information and keeps useful unknown sections reachable.
- No active `旅行中` Travel existed at R3 acceptance time; recent completed Travel was presented honestly, and explicit `旅行中` remains the only active-trip mode.
- Travel selector, no-JS reachability, keyboard behavior, and reduced-motion behavior passed.
- Personal watcher fingerprint algorithm was not changed; watcher baseline was not accepted.
- Production watcher/runtime state was not changed, and no Personal material gap was deferred.

## R1 implementation boundary

html-share owns browser routing, aliases, browser state, Manifest v2, shell
navigation, and managed `/assets/v5/1/*` presentation assets.

html-share-hub owns normalized source models and semantic canonical content.
Generated v5 pages are content-centric, useful without JavaScript, and do not
own duplicate global or domain application navigation.

The local preview supports explicit sanitized deterministic mode and explicit
read-only live mode. Live mode retains source freshness/reference validation and
may fail honestly when required credentials or sources are unavailable.

No source mutation, production publication, AWS mutation, worker restart,
watcher-baseline acceptance, or production topology change occurred.

## Experimental branches

The following branches remain reference-only and are not the implementation
lineage:

`codex/v5-phase-3-presentation-rebuild`

## Accepted local preview workflow

### Sanitized deterministic mode

```powershell
& 'C:\Users\starf\Documents\html-share-hub\scripts\v5-preview.ps1' -Mode sanitized -Port 4317
```

### Read-only live mode

```powershell
& 'C:\Users\starf\Documents\html-share-hub\scripts\v5-preview.ps1' -Mode live -Port 4317
```

### Staging root

`C:\Users\starf\Documents\html-share\.html-share\v5-staging`

### Generated root

`C:\Users\starf\Documents\html-share\.html-share\v5-staging\generated`

### Build root

`C:\Users\starf\Documents\html-share\.html-share\v5-staging\.html-share\build`

### Shell

`http://127.0.0.1:4317/app/index.html#/home`

### Representative routes

`http://127.0.0.1:4317/app/index.html#/research/overview`

`http://127.0.0.1:4317/app/index.html#/personal/current`

`http://127.0.0.1:4317/app/index.html#/investment/dashboard`

Accepted visual acceptance viewports:

- `1280x900`
- `390x844`

Read-only live mode must not be weakened to succeed when credentials or source
validation are unavailable.

## Next phase

Known pre-R6 items:

- Personal all-live privacy/validator preflight issue.
- Manual/live Investment credential UX/readiness.

Phase R6 Integrated V5 Acceptance is NEXT. Phase R7 Production Cutover is
BLOCKED. R7 has not started.
