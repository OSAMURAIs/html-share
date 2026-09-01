# html-share / 共有くん — Project Reference

**Last consolidated:** 2026-08-26 JST  
**Status:** Final consolidated reference for the next implementation-planning context.  
**Trusted-host audit timestamp:** 2026-08-26 15:34–15:35 JST

---

## 0. How to use this reference

This document consolidates:

- current GitHub mainline state,
- trusted Windows host read-only audit results,
- current uploaded generated/production snapshot,
- Prototype v5,
- v5 final handoff,
- explicit user decisions made after the 2026-08-21 Project Reference.

### Authority / precedence

When information conflicts, use this order:

1. **Latest explicit user decision**
2. **Actual current source / repository / trusted-runtime state**
3. **Prototype v5 + its final production delta for UI/UX/information architecture**
4. **This Project Reference**
5. Older handoffs / older Project References / historical phase plans

Repository/runtime facts can change after this document. Re-audit before significant implementation or deployment.

### Critical UI/UX rule

**Prototype v5 is the sole UI/UX design authority for the next implementation plan.**

Do not use previous html-share UI design philosophy as a competing design authority.

This explicitly supersedes:

- the old Personal Pulse / Tabler-inspired redesign as a future design foundation,
- old page-count-preservation thinking,
- old route-preservation thinking,
- old Investment UI proposals where they conflict with v5,
- old phase numbering/order as the implementation roadmap.

The existing production implementation is a **migration source**, not the future product-design target.

---

# PART I — Current System / Engineering State

## 1. Product overview

`html-share` / `html-share-hub` form a personal web presentation, integration, sharing, and operational-status system over several canonical sources.

Current production entry:

`https://share.osamurais.com/app/index.html`

### Source of truth

- **Research**
  - `research-knowledge-base` / Obsidian
- **Personal**
  - Notion Personal System
- **Investment**
  - canonical Investment sources

`html-share` / `html-share-hub` are not the canonical knowledge/data stores.

---

## 2. Repository responsibilities

### `OSAMURAIs/html-share`

Local path:

`C:\Users\starf\Documents\html-share`

Primary responsibilities:

- browser application / shell
- HTML listing/navigation
- owner-only / limited sharing
- mobile Inbox / approval
- authentication / device-facing product behavior
- AWS publication infrastructure
- S3 publication / recovery
- public manifest / privacy boundary
- rollback/recovery support
- browser Performance Contract
- strict production publication verification

Do not casually move source-specific Research/Personal/Investment business logic here.

### `OSAMURAIs/html-share-hub`

Local path:

`C:\Users\starf\Documents\html-share-hub`

Primary responsibilities:

- Research adapter/model/presenter/renderer
- Personal adapter/model/presenter/renderer
- Investment adapter/model/presenter/renderer
- unified generated tree
- validation
- scheduled refresh orchestration
- Live Work
- Personal low-latency watcher
- runtime contract / worker deployment identity
- `hub doctor`
- platform-health watchdog

Source-specific integration belongs here unless a future architecture explicitly changes the boundary.

---

## 3. Current Git / GitHub state

### `html-share`

Trusted-host checkout:

- branch: `main`
- local HEAD: `8ecaacf717110f3cd221bb522aeaee55a8fbdba5`
- `origin/main`: same SHA
- origin-relative local-only commits: none
- worktree: dirty, **4 existing documentation files**
- tracking configuration: local `main` tracks `upstream/main`, not `origin/main`
- relative to `upstream/main`: HEAD is 18 commits ahead

GitHub independently verified in this consolidation:

- default branch: `main`
- current main HEAD: `8ecaacf717110f3cd221bb522aeaee55a8fbdba5`
- open PRs: **0**
- latest main CI:
  - run `32814334402`
  - head SHA matches main
  - conclusion: **success**

Recent completed mainline work:

- PR #5 — reconcile production architecture into `main`
- PR #6 — Browser Performance Contract
- PR #7 — strict production publication verifier

The historical state where GitHub `main` represented the stale/destructive publisher lineage is no longer current.

### `html-share-hub`

Trusted-host checkout:

- branch: `main`
- local HEAD: `146c3048a986cd27d01bd3e089bc7b83c1d743b9`
- `origin/main`: same SHA
- worktree: **clean**

GitHub independently verified:

- default branch: `main`
- current main HEAD: `146c3048a986cd27d01bd3e089bc7b83c1d743b9`
- open PRs: **0**
- latest main CI:
  - run `32828681708`
  - head SHA matches main
  - conclusion: **success**

Recent completed mainline work:

- PR #9 — credential-free Ubuntu/Windows CI
- PR #10 — first Personal Pulse Tabler-inspired redesign
- PR #11 — worker restart / Notion-write-boundary runbook
- PR #12 — runtime contract + worker deployment identity
- PR #13 — read-only `hub doctor`
- PR #14 — platform-health watchdog
- PR #15 — hidden watchdog task execution
- PR #16 — no-flash hidden `wscript.exe` launcher

### Git safety

Preserve the four existing dirty `html-share` documentation files.

Do not use:

- `git reset --hard`
- `git clean`
- unrelated stash
- destructive checkout
- force push

---

## 4. Current runtime

Shared resolver selected:

`html-share-hub\.venv\Scripts\python.exe`

Runtime:

- Python 3.12.13
- Python >= 3.11: PASS
- `ZoneInfo("Asia/Tokyo")`: PASS

Other observations:

- `HTML_SHARE_PYTHON`: unset
- repository `.venv`: present
- Codex runtime candidate: present, Python 3.12.13
- long-lived workers were recorded using Codex primary runtime executable

The runtime contract itself is healthy.

---

## 5. Current worker state — IMPORTANT

The trusted-host audit found the runtime is **not currently a healthy/ready deployment baseline**.

### Live Work worker

- running
- PID: `41444`
- lock: held
- runtime: Python 3.12.13
- freshness: **STALE**
- code fingerprint: mismatch
- launcher fingerprint: mismatch
- last successful publish: 2026-08-26 06:32:55Z
- current generation: current

Interpretation:

The worker is alive but is running a deployment identity that no longer matches the current code/launcher deployment unit.

Do not silently treat it as CURRENT.

### Personal Watch worker

- **stopped / not running**
- recorded PID: `65644`, but process not present
- lock: not held
- freshness: **UNKNOWN**
- failure count: 1
- failure category: `refresh_failed`
- display state: **PENDING**
- accepted fingerprint: set
- observed fingerprint: set and different
- last check: 2026-08-25 03:22:10Z

Interpretation:

Personal low-latency convergence is currently degraded.  
This is a real planning/runtime issue, not just a historical note.

Do not repair it as part of a read-only planning audit.  
It must be included in the next implementation/deployment readiness plan.

---

## 6. Scheduled Tasks — current visibility limitation

The trusted-host audit session could not authoritatively query Task Scheduler:

- CIM query: access denied
- `schtasks.exe /Query`: unavailable due environment/system-path limitation

Therefore the following are **not authoritatively verified in the current audit**:

- `HTML Share Hub Live Work Worker`
- `HTML Share Hub Personal Watch Worker`
- `HTML Share Hub Daily Refresh`
- `HTML Share Hub Platform Health Watch`

The doctor may report these as “not installed”, but in this audit context that result is confounded by the same visibility restriction.

Code-level expected configuration remains:

- Live Work: logon-triggered worker
- Personal Watch: logon-triggered worker
- Daily Refresh: 02:00 / 08:00 / 14:00 / 20:00
- Platform Health Watch: approximately 5-minute cadence

Before deployment, re-check these from an authoritative trusted-host context with sufficient Task Scheduler visibility.

---

## 7. `hub doctor` current state — IMPORTANT

Commands executed read-only:

```text
.\scripts\hub.ps1 doctor
.\scripts\hub.ps1 doctor --json
```

Result:

- overall: **FAIL**
- JSON schema version: `1`
- exit code: `2`
- PASS: 20
- WARN: 6
- FAIL: 6
- SKIP: 4

Important findings:

- runtime: PASS
- Live Work liveness: PASS
- Live Work freshness: STALE
- Personal Watch: FAIL, worker stopped
- Scheduled Task failures are affected by visibility limitation
- publication journal: PASS, all observed transactions terminal
- pending publication: none
- publication digest: WARN, generated digest differs from published state
- canonical/generated tree: **FAIL / malformed**
- AWS CLI: unavailable in audit session
- credential files exist, but decryptability/usability not tested

Therefore:

**Do not describe the trusted host as currently healthy.**

The state is usable as planning evidence, but not as a clean deployment baseline.

---

## 8. Platform-health watchdog current state

State file:

`C:\Users\starf\AppData\Local\HTMLShareHub\platform-health\watchdog-state.json`

Latest evaluation:

- 2026-08-26 06:32:38Z

Current condition:

- degraded/open incidents exist

Open incidents observed:

- `live_work.code_freshness`
- `live_work.scheduled_task`
- `personal_watch.worker`
- `personal_watch.scheduled_task`
- `scheduled_refresh.task`
- `publication.digest`
- `personal_watch.display_state`
- `personal_watch.failure_category`
- `personal_watch.failure_state`

No worker restart-loop evidence was identified.

The watchdog task's actual installed/running state remains unverified because of Task Scheduler visibility limitations.

---

## 9. Current generated topology — IMPORTANT CAVEAT

The uploaded generated snapshot used for migration analysis contains the historical/current intended migration-source structure:

### Research

- `research-pulse.html`
- `digest-queue.html`
- `paper-queue.html`
- `knowledge-review.html`

### Personal

- `personal-pulse.html`
- `active-plans.html`
- `trips.html`
- `library-focus.html`

### Investment

- `investment-pulse.html`
- `investment-positions.html`
- `investment-decisions.html`
- `investment-journal.html`

### Operational

- `live-work.html`

This corresponds to:

- 12 static canonical pages
- 1 operational Live Work page

However, the trusted-host audit could directly enumerate only:

### Research

- `research-pulse.html`
- `digest-queue.html`
- `knowledge-review.html`
- `paper-queue.html`

### Operational

- `live-work.html`

Personal and Investment directories existed but were not readable in the restricted audit session.

Additionally, `hub doctor` classified the canonical/generated tree as **malformed**.

Therefore:

- the 12+1 structure remains the known migration-source design/baseline,
- but the trusted-host audit did **not** prove that all 12+1 artifacts are currently present and readable,
- do not claim the current trusted-host generated tree is healthy or complete.

### Superseding product rule

**12+1 is not a future UI/IA constraint.**

It is migration/history context only.

---

## 10. Publication state

Observed publication state:

- terminal transactions: 253
- latest committed transaction: `mt9pvw7u-d371m641`
- latest committed time: 2026-08-26 06:32:51Z
- pending publication request: none
- latest publish success: 2026-08-26 06:32:55Z
- published generation: `375253ef56b2`
- generated digest vs published state: **mismatch**

No unresolved/non-terminal journal state was observed.

The digest mismatch is an active degraded condition and is also surfaced by the watchdog.

---

## 11. Strict production verifier — currently UNVERIFIED

Read-only command executed:

```text
node .\dist\src\cli.js verify-production --config .\html-share.config.yaml --json
```

Result:

- exit code: `1`
- `ok: false`
- no AWS mutation performed
- AWS credential provider unavailable in the audit session

Verification stopped before it could confirm:

- bucket Versioning
- desired object VersionId coverage
- stale managed keys

Therefore current strict production verification status is:

**UNVERIFIED**

Do not misstate this as a production verifier functional failure.  
The verifier could not complete because the audit session lacked usable AWS credentials/provider access.

---

## 12. Tests / CI baseline

### `html-share` local trusted-host test run

`npm test`

- total: 44
- PASS: 42
- FAIL: 2

Known environment-dependent failures:

- symlink creation: `EPERM`
- config page-add test expected 1, observed 0

GitHub main CI was independently verified as **green** for the current main SHA.

### `html-share-hub` local trusted-host test run

```text
python -m unittest discover -s tests -t tests
```

- total: 530
- PASS: 525
- ERROR: 5

Known environment-dependent errors:

- `claude_hooks` tests hit `PermissionError` while stat-ing inaccessible `Python313\python.exe`

GitHub main CI was independently verified as **green** for the current main SHA.

Do not confuse these known local environment failures with a current mainline regression unless a new change alters their behavior.

---

## 13. Audit no-write boundary

The audit intentionally performed no:

- source write
- commit/merge/reset/checkout/stash
- AWS mutation
- Notion mutation
- Google mutation
- Task install/start/stop/change
- runtime install
- explicit `refresh`
- explicit `publish`
- `recover`
- `rollback`
- `prune`

Existing dirty `html-share` docs were preserved.

### Important exception

The Codex global Live Work reporting hook ran as part of the environment lifecycle.

That mandatory hook:

- updated Live Work registry/publish-request state
- caused the existing worker to perform Live Work publication

Therefore the audit cannot claim a mathematically complete no-write/no-publication environment.

This publication was an external lifecycle side effect of Codex reporting, not an intentional audit action.

---

## 14. Current baseline suitability

The 2026-08-26 trusted-host state is:

### Suitable for:

- current-state evidence
- architecture planning
- v5 implementation roadmap design
- dependency analysis
- migration planning

### Not suitable to describe as:

- healthy runtime baseline
- clean deployment baseline
- fully verified production state

Active/degraded/unverified items to carry forward:

1. Live Work worker STALE
2. Personal Watch stopped
3. Personal Watch PENDING / `refresh_failed`
4. Task Scheduler actual state not authoritatively visible
5. doctor overall FAIL
6. generated tree malformed
7. generated/published digest mismatch
8. strict production verification incomplete because AWS credentials/provider unavailable
9. Personal/Investment generated artifacts not fully enumerated in restricted audit

The next planning chat must distinguish:

- **v5 product migration work**
- **current runtime/deployment-health cleanup required before safe production rollout**

Do not silently mix the two.

---

# PART II — Completed Platform / Reliability Capabilities

## 15. Completed integration / production-era capabilities

The initial platform is not an unfinished prototype.

Already implemented before v5 migration planning:

- Research integration
- Personal integration
- Investment integration
- Personal frozen-schema adaptation
- scheduled full refresh / reconciliation
- publication / recovery hardening
- Live Work
- Personal low-latency watcher
- digest-based no-op publication suppression

Future work is enhancement, migration, reliability, or new feature work.

---

## 16. Completed mainline reliability work that must not reappear as unfinished

### `html-share`

Completed:

- hardened production lineage reconciliation into main
- rollback-safe publisher lineage
- S3 Versioning / journal / recovery architecture
- privacy-hardened publication path
- Browser Performance Contract
- strict production publication verifier

### `html-share-hub`

Completed in code/mainline:

- credential-free Linux/Windows CI
- deterministic Python runtime contract
- shared runtime resolver
- worker deployment identity
- CURRENT / STALE / UNKNOWN worker freshness model
- read-only `hub doctor`
- platform-health watchdog
- hidden/no-flash watchdog launcher implementation

Important distinction:

**The capabilities are implemented. The current trusted-host runtime is nevertheless degraded.**

Do not re-implement doctor/watchdog/runtime identity merely because they currently report faults.

Use them to diagnose/recover the deployment state.

---

## 17. Publication and security architecture

The trusted publication path remains the production safety baseline unless deliberately replaced by an equivalent-or-stronger architecture.

Important properties:

- trusted Windows host performs production publication
- agent reporters do not hold production publication credentials
- no second raw S3 publisher
- shared publication lock
- schema / row / generated-tree validation
- privacy validation
- build validation
- AWS identity gate
- rollback-safe publication
- S3 Versioning
- persistent publication journal
- stale managed-key cleanup
- restart-safe recovery
- digest-based no-op publication suppression
- strict production verifier

### Public artifact privacy

Do not publish:

- credentials
- API keys
- tokens
- private keys
- raw prompts
- hidden/private reasoning
- unnecessary local absolute paths
- private integration metadata
- sensitive operational logs

Use allowlisted public metadata.

---

## 18. Personal deterministic maintenance

The normal full refresh contains a narrow deterministic Personal maintenance write path.

Example:

- fill a missing `Completed` date for a terminal item when deterministic rules allow it

This is not AI inference/writeback.

Important distinction:

- full refresh can perform this narrow maintenance
- Personal watcher-triggered publication normally does not

Therefore:

```text
hub.ps1 refresh
```

is **not** a read-only verification command.

Do not run it casually during diagnosis or planning verification.

---

## 19. Personal low-latency watcher design

Intended production-era behavior:

- approximately 30s poll
- approximately 30s debounce
- practical convergence approximately 1–2 minutes
- Notion read-only polling
- rendered-output fingerprint rather than arbitrary field-watch list
- volatile generated timestamps normalized out
- watcher-triggered path avoids normal Personal maintenance writes
- approximately 6-hour full refresh remains fallback/reconciliation

### Current exception

As of the trusted-host audit:

- Personal Watch worker is stopped
- freshness is UNKNOWN
- display state is PENDING
- failure category is `refresh_failed`

Do not describe the watcher as currently healthy simply because its design previously passed E2E.

---

## 20. Live Work semantics

Live Work is operational AI-task status, not human-domain knowledge content.

Display as Active only when a task is actually running.

Do not treat as Active:

- idle session
- completed task
- stale task
- mere agent process presence

Preserve:

- credential-free agent reporting
- trusted-host publication
- bounded task-level metadata
- no raw prompts/reasoning/secrets

Prototype v5 visually integrates Live Work, including a compact Home projection, but operational semantics remain separate.

### Current exception

As of the audit, the Live Work worker is running but STALE.

---

## 21. Runtime / deployment identity / health architecture

### Runtime contract

- Python >= 3.11
- `ZoneInfo("Asia/Tokyo")` must work
- shared deterministic PowerShell resolver
- declared invalid runtime candidates fail safely
- discovered invalid candidates may be skipped
- Python-side runtime backstop

### Worker deployment identity

Long-lived workers retain loaded code.

Runtime identity/freshness includes:

- live PID
- process start token
- runtime
- code fingerprint
- launcher fingerprint

Freshness:

- CURRENT
- STALE
- UNKNOWN

Deployment changes under the conservative deployment boundary can require restarting both long-lived workers.

### `hub doctor`

Read-only operator diagnostic with:

- human output
- versioned JSON
- PASS / WARN / FAIL / SKIP
- stable exit-code contract
- runtime
- workers
- tasks
- locks
- publication state
- canonical state
- credential-presence proxies
- secret-safe output

### Platform-health watchdog

Mainline code includes:

- periodic `hub doctor` consumption
- bounded local incident state
- no automatic arbitrary repair/publish
- hidden/no-flash Scheduled Task launcher implementation

The watchdog exists to expose degradation, not to imply that degradation is already repaired.

---

## 22. Browser Performance Contract

`html-share` main includes a Browser Performance Contract.

Current role:

- deterministic shell-size budget
- browser architecture/network invariants
- self-contained canonical-content expectations
- freshness semantics
- cache-policy semantics by resource class
- current PWA baseline
- trusted-host/manual measurement boundary

Prototype v5 may require changing the resource architecture.

If so:

- update the contract intentionally
- do not silently bypass it
- measure new shared assets/navigation against the new v5 implementation

---

# PART III — Prototype v5 Product Design Authority

## 23. UI/UX authority

The latest explicit product decision is:

**Discard previous html-share UI design philosophy as a design authority. Use Prototype v5 as the sole UI/UX design philosophy for the next implementation plan.**

The v5 final handoff remains useful for:

- final production delta
- source/model gaps
- migration concerns
- semantic-motion requirements
- information-preservation requirements

Current/old production topology is a migration fact, not a design authority.

---

## 24. Prototype v5 target UX topology

Prototype v5 contains 15 UX destinations.

### Home

- Home

### Research

- Research Overview
- Research Feed
- Papers
- Knowledge Review

### 暮らし

- 現在地
- 案件
- Library
- Travel

### Investment

- Dashboard
- Pulse
- Positions
- Decisions
- Journal

### Operational

- Live Work

### Planning rule

Treat these 15 destinations as the authoritative target **user experience topology**.

The exact production file/route/canonical-resource implementation must be decided in the clean implementation-planning context.

Do not force them back into the old 12-page structure.

---

## 25. v5 visual language

Prototype v5 combines high information density with clearer hierarchy.

### Primary palette

- deep navy
- clear blue
- pale blue
- off-white

Semantic colors:

- green → positive
- amber → warning
- red → blocked / negative

Large surfaces should contain concrete user data:

- project state
- NEXT
- blocked state
- portfolio totals
- current decision/review

Avoid large abstract decorative hero areas.

### Typography / density

v5 reference scale:

- body around 15px
- secondary body 13–14px
- table body around 14px
- headings clearly larger

Reduce wasted whitespace by layout and pairing, not by shrinking text.

### Desktop

Use the available width.

Prefer:

- related 2-column compositions
- strong numeric alignment
- readable dense tables
- visual hierarchy over generic cards

### Mobile

Do not merely stack the desktop layout.

Recompose information based on domain/task.

---

## 26. v5 global navigation

Global human-domain navigation:

- ホーム
- 研究
- 暮らし
- 投資

Live Work is an operational destination rather than a peer human-domain category.

Domain secondary navigation remains visible where useful.

Travel remains inside the 暮らし navigation context.

Investment may retain English secondary labels where useful for continuity.

---

## 27. Focus + Complete Collection

Major v5 rule:

**Prioritizing information in an overview is not permission to delete useful source information.**

Examples:

### Papers

- rich focus layer
- full queue remains reachable

### Knowledge Review

- actionable focus
- backlog remains reachable

### 暮らし

- priority/current items
- complete plan/detail surface remains reachable

### Investment

- Dashboard/Pulse summarize
- Positions/Decisions/Journal preserve detailed information

Use disclosure/search/table/horizontal scroll where appropriate rather than deleting information solely to shorten pages.

---

## 28. Research v5 model

### Projects

Only:

- 修士論文
- CPGteam

### Research Exploration

Not a third Project.

Includes non-project research activity such as:

- arXiv Digest
- paper discovery
- literature survey
- Knowledge Review
- Research Notes
- project-independent exploration

### Entity ↔ Project relation

Feed/Paper/Knowledge items may relate to:

- 修士論文
- CPGteam
- both
- neither

Do not model `横断` as a third Project.

### Research Overview

Keep three main surfaces:

- 修士論文
- CPGteam
- 研究探索

Use real current information where available:

- definition/purpose
- goal
- current state
- NEXT
- Active / Waiting / Blocked
- open question
- recent decision
- important notes/papers

For 研究探索, show actual current research activity/content, not only counts.

### Research Feed

Design priority:

**body > title > metadata**

Useful content includes:

- what the research did
- why it matters
- relationship to the user's research
- what must be verified

Preserve Digest batch/provenance.

### Papers

Use **Focus + Complete Collection**.

Rich focus may show:

- title
- authors/year
- status
- summary
- relationship to user's research
- important result
- next reading/action
- question

Full queue remains available.

### Knowledge Review

Primary human-facing grouping:

#### 事実・記述を確認する

#### 研究への適用を検討する

Then:

- 不確実
- 矛盾
- unreviewed backlog

Preserve source semantics such as Explicit / Uncertain / Conflict, but do not let old labels dictate primary UI hierarchy.

Do not invent priority if the source has no priority contract.

---

## 29. 暮らし v5 model

Global label:

**暮らし**

Secondary destinations:

- 現在地
- 案件
- Library
- Travel

Technical/repository terms may still use `Personal`.

### 現在地

Glance page focused on:

- important current plans
- current state
- NEXT
- near-term dated items
- ongoing/non-dated context

Do not reduce it to generic KPI cards.

### 案件

Complete active-work detail.

Preserve useful plan fields such as:

- status
- kind
- date
- companion
- destination
- current state
- next action

Human-owned `現在地` / `次の一手` / `次に決めること` are not automatic AI writeback targets.

---

## 30. Library v5 lifecycle

Primary visual order:

1. 今見ている / 使っている
2. あとで見る
3. 最近入手
4. 検討中

Do not collapse distinct semantics:

- reading/watching
- saved/unstarted
- recently acquired
- shopping

Prototype v5 includes a Shopping intent gradient concept:

- 気になる
- 本格検討
- 入手予定

This is not yet a confirmed source contract.

Treat it as a candidate for source/schema review, not as already-existing durable data.

---

## 31. Travel v5 workspace

Travel is a high-density operational workspace, not just a generic plan card.

### Collection

Preserve:

- upcoming/current travel
- planning
- recently completed/archive

### Detail

Target information includes:

- overview
- confirmed/bookings
- transportation
- itinerary by day
- exact times
- important times
- fallback
- day-of operational context

### Repeatable data model

Do not hard-code exactly:

- one outbound leg
- one return leg
- one hotel
- one ticket

Prefer normalized repeatable records such as:

- `Transportation[]`
- `Accommodation[]`
- `ReservationOrTicket[]`

Potential fields:

- date/time
- start/end
- provider/service
- reservation state
- booking reference/link
- notes
- day association

### Traveling mode

Use the same source data but recompose it for active travel.

Prioritize:

- next movement
- next important time
- critical deadline
- fallback

### Current source gap

Rich Travel information appears to exist partly in Notion page body while the current Personal adapter is more property-centric.

Likely future work:

- page-body retrieval
- deterministic parser
- normalized Travel model
- validation
- bounded Personal watcher change detection

Do not distort Notion purely to satisfy the renderer.

---

## 32. Investment v5 structure

Investment target UX has **five destinations**:

- Dashboard
- Pulse
- Positions
- Decisions
- Journal

Do not collapse Dashboard and Pulse merely to preserve the old 4-page topology.

### Dashboard job

**Understand portfolio shape quickly.**

Target content includes:

- total assets
- attention/review
- invested-asset allocation
- Top 5 + Other concentration
- position price P/L contribution
- leverage-adjusted exposure where supported

Any denominator must be explicit.

Do not invent portfolio-wide cost-basis P/L if the source does not provide it.

### Pulse job

**Understand what needs review/decision now.**

Target content includes:

- next review
- Action / Review items
- asset composition
- compact ranked holdings
- positive/negative movers
- data quality/freshness

### Positions

Keep a high-information table.

Preserve important fields rather than converting the table into lossy cards.

Potential grouping:

- 投資信託
- 日本株
- 米国上場
- other meaningful source-backed categories

Desktop:

- numeric right alignment
- readable column separation
- sensible width
- full information contract

Mobile:

- horizontal reachability
- no `overflow:hidden` information loss

### Decisions / Journal

Preserve existing decision/journal semantics and full detail.

---

## 33. Home v5

Home is a first-class cross-domain overview.

It should communicate current context across:

- Research
- 暮らし
- Investment
- Live Work

Avoid a large abstract hero.

Use concrete current information.

### Production responsibility

The exact Home generation contract is not yet finalized.

Preferred architecture principle:

- source-specific normalization/projection remains in `html-share-hub`
- browser/product shell remains in `html-share`

Do not make the browser shell directly query raw Research/Notion/Investment sources merely for Home.

The clean implementation-planning chat should decide the final Home model and delivery topology.

---

## 34. v5 semantic motion

Motion is a first-class semantic design tool.

Candidates include:

- same-origin navigation continuity
- Research filter/reflow
- disclosure
- Personal timeline
- Plan → Travel continuity
- Travel timeline/current marker
- Investment donut sweep
- P/L diverging bars
- Live Work active indicator

Requirements:

- no external runtime/CDN dependency merely for motion
- static semantic fallback
- `prefers-reduced-motion`
- no decorative ambient animation as a substitute for information

---

## 35. v5 production renderer rule

Prototype v5 uses JS for fixture/prototype behavior.

Production must not depend on a post-render patch pipeline to make the document structurally correct.

Preferred flow:

source  
→ adapter  
→ normalized model  
→ presenter/view model  
→ renderer  
→ semantic HTML  
→ interaction/motion JS

JavaScript should enhance:

- filters
- disclosure
- stateful presentation
- motion

not repair malformed/incomplete generated markup.

---

# PART IV — Remaining Work / Replanning

## 36. Old phase plan is superseded

Do not continue automatically from the old:

- Phase 3 UI
- Phase 4 Investment Dashboard
- Phase 5 Browser Reliability
- Phase 6 Research low-latency
- Phase 7 Personal AI Fabric

The next implementation-planning chat must rebuild the phase plan.

### Required classification

For each previous proposal classify:

- **ABSORB INTO V5**
- **KEEP INDEPENDENT**
- **DEFER UNTIL V5 STABILIZES**
- **DROP**

---

## 37. Known proposals requiring re-evaluation

### v5 implementation

Core product migration work.

Likely includes:

- source gap audit
- model changes
- renderer redesign
- Home
- Research 4 destinations
- 暮らし 4 destinations
- Investment 5 destinations
- global shell
- routes
- migration
- desktop/mobile
- semantic motion

### Investment Dashboard workstream

Its UI/information design should generally be considered superseded/absorbed by v5.

Non-UI source/model ideas may still be independently valuable and should be re-evaluated.

Historical Investment/time-series remains a separate optional source-design question.

### Browser Reliability / UX

Known candidates:

- mutation idempotency
- safe retry
- Client Freshness
- bfcache
- Optimistic Inbox
- native Web Share
- draft recovery
- Command Palette
- selective caching / asset versioning
- optional Push / Badge

Do not automatically implement in the old order.

Re-evaluate dependencies against the v5 shell/routes/assets.

### Research low-latency watcher

Still a plausible independent enhancement.

Likely should wait until v5 Research model/renderer/change semantics stabilize.

Do not simply copy the Personal watcher.

### Personal AI Fabric

Separate architecture project.

Not adopted as a required html-share feature.

Previously discussed options:

- no Fabric
- thin cross-repo catalog/Skills layer
- separate lightweight Fabric repo

Must be re-decided independently.

### Cloudflare architecture

Separate infrastructure decision.

Do not mix Cloudflare migration into the v5 application migration unless explicitly approved after a new architecture review.

---

## 38. Explicitly superseded decisions / assumptions

Do not resurrect these as active requirements:

### Permanent 12+1 target

Superseded.

12+1 is migration/history context only.

### Personal Pulse v1 as design foundation

Superseded.

PR #10 remains implementation history/current code until migration, but Prototype v5 is the UI/UX authority.

### Preserve old routes/page names because they are current

Superseded as a design principle.

Old routes may require compatibility/migration, but they are not sacred.

### Preserve old Investment 4-page topology

Superseded as a design requirement.

v5 explicitly separates Dashboard and Pulse.

### Previous phase numbering/order

Superseded.

Rebuild from actual dependencies.

### Old UI framework comparison as an active decision

Historical only.

Do not restart Tabler-vs-daisyUI-vs-Pico selection unless v5 creates a concrete implementation blocker.

---

## 39. Engineering constraints that remain active

These remain because they protect correctness/security/operations, not because of old UI philosophy:

- source-of-truth boundaries
- repository responsibility separation unless intentionally redesigned
- trusted publication
- rollback/recovery guarantees
- privacy/security boundary
- Personal watcher read-only behavior
- Live Work actual-task semantics
- deterministic generation/publication
- Browser Performance Contract
- runtime contract
- deployment freshness
- doctor/watchdog
- Git safety

If these interact with v5, redesign implementation architecture rather than silently reverting product design to the old UI.

---

## 40. Immediate planning issue: current platform degradation

The next planning chat must not conflate product redesign with runtime recovery.

It should explicitly decide whether to:

### Option A — restore a healthy operational baseline first

Resolve/verify:

- Live Work STALE
- Personal Watch stopped
- Personal Watch PENDING / `refresh_failed`
- authoritative Scheduled Task state
- malformed generated tree
- digest mismatch
- strict production verification

then begin v5 implementation.

### Option B — plan v5 architecture first, but block production implementation/deployment until baseline is restored

This may save time because architecture planning is read-only and can proceed from the current evidence.

Either way, deployment should not begin while the trusted-host baseline remains ambiguously degraded.

---

## 41. Recommended next-context input set

Start the next implementation-planning chat with:

1. Prototype v5 ZIP
2. v5 implementation handoff
3. **this Project Reference**
4. current generated/production snapshot
5. optionally the trusted-host audit

Old v1/v2 UI prototypes and the 2026-08-21 Project Reference are unnecessary unless historical investigation is explicitly needed.

---

## 42. Required next-planning deliverable

The next chat should **not start implementation immediately**.

First produce:

### A. Current-state inventory

- actual repo/runtime/source state
- completed vs remaining work
- current degraded/unverified operational items

### B. Workstream re-evaluation

For each old proposal:

- ABSORB INTO V5
- KEEP INDEPENDENT
- DEFER
- DROP

### C. v5 gap matrix

For each v5 requirement:

- current source sufficient
- body extraction needed
- adapter/model extension needed
- source schema change needed
- shell/publication change needed

### D. Architecture decisions

Including:

- production topology/routes
- Home responsibility
- Research relation model
- Travel model/body extraction
- Library semantics
- Investment Dashboard/Pulse
- shared assets/components
- semantic motion
- desktop/mobile shell
- old-route migration
- manifest/search/favorites/unread migration

### E. Dependency graph

source  
→ adapter  
→ model  
→ presenter  
→ renderer  
→ shell  
→ validation  
→ publication  
→ runtime

### F. New implementation phases

Do not inherit old phase numbers.

Each phase should define:

- scope
- affected repos/sources
- prerequisites
- Codex model
- reasoning effort
- context-clear recommendation
- subagent recommendation
- tests
- migration
- acceptance criteria
- rollback point
- production E2E

### G. Production migration

Design:

- old URLs
- new routes
- manifest
- browser state
- exact/managed tree
- watcher fingerprint
- no-op digest
- stale keys
- worker restart
- rollback/recovery

### H. Runtime readiness gate

Explicitly define the conditions required before the first v5 production deployment.

At minimum account for:

- worker freshness
- Personal Watch health
- Scheduled Task visibility/health
- generated-tree validity
- digest consistency
- strict production verification

Only after this roadmap is reviewed should implementation begin.

---

## 43. Primary references

### Repositories

- `OSAMURAIs/html-share`
- `OSAMURAIs/html-share-hub`
- `research-knowledge-base`

### UI reference

- Prototype v5
- v5 implementation handoff
- v5 design decisions / information preservation notes

### Trusted-host current-state evidence

- 2026-08-26 15:34–15:35 JST read-only audit

### Historical Project Reference

- 2026-08-21 Project Reference

Use the historical reference only for implementation history and stable engineering context.

Do not use its permanent-12+1 wording as current product-design authority.
