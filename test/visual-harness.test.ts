import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { V5_DESTINATIONS } from '../src/v5-contract.js';
// @ts-expect-error -- the harness is plain ESM tooling, not part of the published build
import { DESTINATIONS, VIEWPORTS } from '../scripts/visual/build-sides.mjs';
// @ts-expect-error -- see above
import { CAPTURE_METADATA_SCHEMA, SHELL_PROBES } from '../scripts/visual/capture.mjs';
// @ts-expect-error -- see above
import { METRICS_SCHEMA, METRICS_SOURCE, firstMatchingSelector } from '../scripts/visual/metrics.mjs';
// @ts-expect-error -- see above
import {
  ACCEPTANCE_SCHEMA, MODES, divergenceIndex, evaluateContract, mapSections,
  validateProductionTargetIntegrity, validatePrototypeObservation,
} from '../scripts/visual/check.mjs';
// @ts-expect-error -- see above
import { RUN_SCHEMA, TOOL_VERSION } from '../scripts/visual/run.mjs';

const root = path.resolve(import.meta.dirname, '..');
const contract = JSON.parse(readFileSync(path.join(root, 'visual/route-geometry.contract.json'), 'utf8'));

const capture = (destinationId: string, side: string, viewport: string, metrics: unknown) => ({
  schema: CAPTURE_METADATA_SCHEMA,
  destination_id: destinationId,
  side,
  viewport: { name: viewport },
  metrics,
});

test('the harness covers exactly the 15 v5 destinations, in v5-contract identity', () => {
  const harnessIds = DESTINATIONS.map((item: { destination_id: string }) => item.destination_id);
  const contractIds = V5_DESTINATIONS.map((item) => item.destination_id);
  assert.equal(harnessIds.length, 15);
  assert.equal(new Set(harnessIds).size, 15);
  assert.deepEqual([...harnessIds].sort(), [...contractIds].sort());
  for (const destination of DESTINATIONS) {
    // Every destination must name a real Prototype page and a real generated page.
    assert.match(destination.prototype, /\.html$/);
    assert.match(destination.generated, /\.html$/);
    assert.ok(destination.slug.length > 0);
    assert.ok(['home', 'research', 'personal', 'investment', 'operational'].includes(destination.domain));
  }
  assert.equal(new Set(DESTINATIONS.map((d: { slug: string }) => d.slug)).size, 15, 'slugs must be unique');
  assert.equal(new Set(DESTINATIONS.map((d: { prototype: string }) => d.prototype)).size, 15, 'prototype pages must be unique');
});

test('both required viewports are declared at 100% zoom scale', () => {
  assert.equal(VIEWPORTS.length, 2);
  assert.deepEqual(VIEWPORTS.map((v: { width: number; height: number }) => [v.width, v.height]), [[1280, 900], [390, 844]]);
  assert.deepEqual(VIEWPORTS.map((v: { name: string }) => v.name), ['desktop', 'mobile']);
});

test('the route geometry contract declares all 15 destinations with both viewports', () => {
  assert.equal(contract.schema, 'html-share.visual.contract/2');
  assert.equal(contract.authority.current_production_is_not_authority, true);
  assert.deepEqual(Object.keys(contract.routes).sort(), V5_DESTINATIONS.map((d) => d.destination_id).sort());
  for (const [id, route] of Object.entries<Record<string, any>>(contract.routes)) {
    assert.ok(route.label, `${id} needs a label`);
    assert.ok(route.domain_grammar && route.domain_grammar.length > 40,
      `${id} must encode domain grammar, not just "cards exist"`);
    for (const viewport of ['desktop', 'mobile']) {
      const view = route[viewport];
      assert.ok(view, `${id}.${viewport} missing`);
      assert.ok(Array.isArray(view.section_order) && view.section_order.length > 0,
        `${id}.${viewport} needs an expected section order`);
      for (const section of view.section_order) {
        assert.ok(section.id, `${id}.${viewport} section needs an id`);
        assert.ok(section.match && (section.match.heading || section.match.classAny || section.match.selector),
          `${id}.${viewport} section ${section.id} needs a matcher`);
        if (section.match.heading) assert.doesNotThrow(() => new RegExp(section.match.heading));
      }
      assert.equal(new Set(view.section_order.map((s: { id: string }) => s.id)).size, view.section_order.length,
        `${id}.${viewport} section ids must be unique`);
      assert.ok(['vertical-rail', 'horizontal-bar'].includes(view.global_chrome_orientation),
        `${id}.${viewport} must declare the global chrome orientation`);
    }
    assert.ok(route.mobile.critical_first_screen?.length,
      `${id} mobile must state its critical first-screen information`);
    assert.ok(['none', 'horizontal-scroll-container'].includes(route.mobile.table_overflow_strategy),
      `${id} mobile must declare a table overflow strategy`);
    assert.equal(typeof route.mobile.sticky_identity, 'boolean',
      `${id} mobile must state whether sticky identity is required`);
    assert.ok(route.mobile.hierarchy_note && route.mobile.hierarchy_note.length > 40,
      `${id} mobile hierarchy must say more than "desktop columns stack"`);
    assert.doesNotMatch(route.mobile.hierarchy_note, /^desktop columns stack\.?$/i);
  }
});

test('quantitative guardrails are declared and are the agreed tolerances', () => {
  assert.deepEqual(contract.tolerances, {
    principal_width_pct: 8,
    column_ratio_points: 10,
    body_font_px: 1,
    table_font_px: 1,
    heading_font_px: 2,
    first_content_y_px: 48,
    shell_chrome_extent_px: 24,
    overflow_px: 8,
    fold_density_pct: 50,
  });
});

test('the motion contract classifies every hook and covers the handoff candidate list', () => {
  const behaviours = contract.motion_contract.behaviours;
  const ids = behaviours.map((b: { id: string }) => b.id);
  for (const required of ['cross-route-transition', 'research-filter-reflow', 'travel-timeline-draw',
    'travel-current-marker', 'allocation-reveal', 'pl-bar-reveal', 'disclosure', 'plan-travel-continuity',
    'live-work-active-indicator']) {
    assert.ok(ids.includes(required), `motion contract is missing ${required}`);
  }
  for (const behaviour of behaviours) {
    assert.ok(contract.motion_contract.classifications.includes(behaviour.classification),
      `${behaviour.id} needs a classification from the declared taxonomy`);
    assert.ok(behaviour.prototype_observed?.length > 10, `${behaviour.id} needs prototype_observed`);
    assert.ok(behaviour.production_target?.length > 10, `${behaviour.id} needs production_target`);
    assert.ok(behaviour.authority_source?.length > 5, `${behaviour.id} needs an authority_source`);
    assert.ok(behaviour.routes, `${behaviour.id} needs a route scope`);
    // Reduced motion is mandatory wherever production motion is required.
    if (behaviour.classification !== 'NOT_REQUIRED') {
      assert.ok(behaviour.reduced_motion?.length > 5,
        `${behaviour.id} is required for production, so it needs a reduced-motion expectation`);
    }
  }
  assert.match(contract.motion_contract.reduced_motion_rule, /mandatory/i);
});

test('required motion absent from the Prototype is still required for production', () => {
  const byId = new Map(contract.motion_contract.behaviours.map((b: { id: string }) => [b.id, b]));
  // These are documented intent that the Prototype never implemented. Under the
  // corrected precedence a Prototype omission is not a production target.
  for (const id of ['research-filter-reflow', 'travel-current-marker']) {
    const behaviour: any = byId.get(id);
    assert.equal(behaviour.classification, 'REQUIRED_PRODUCTION_DELTA',
      `${id} is absent from the Prototype but required by written authority`);
    assert.match(behaviour.prototype_observed, /ABSENT/,
      `${id} must record that the Prototype does not implement it`);
    assert.ok(behaviour.reduced_motion?.length > 5, `${id} still needs a reduced-motion expectation`);
    assert.ok(behaviour.authority_source.length > 20, `${id} must cite the authority that requires it`);
  }
  // And the converse: something the Prototype does implement is not automatically
  // required, if no authority asks for it.
  const stagger: any = byId.get('entry-reveal-stagger');
  assert.equal(stagger.classification, 'NOT_REQUIRED');
  assert.equal(stagger.authority_strength, 'SILENT');
});

test('the authority model is the corrected one, and the superseded rule is named as wrong', () => {
  const authority = contract.authority;
  assert.match(authority.acceptance_standard, /production target/i);
  assert.match(authority.rule, /never becomes acceptable by reproducing a Prototype defect/i);
  assert.equal(authority.precedence.length, 3);
  assert.match(authority.precedence[0].source, /master-handoff/);
  assert.match(authority.precedence[0].role, /NORMATIVE/);
  assert.match(authority.precedence[1].source, /Prototype v5/);
  assert.match(authority.precedence[1].role, /PRIMARY VISUAL AND COMPOSITION BASELINE/);
  assert.match(authority.precedence[2].role, /not discarded merely because/i);
  assert.match(authority.superseded_rule, /was wrong/i);

  // The discarded rule must not survive anywhere in the committed harness.
  for (const file of ['visual/README.md', 'visual/metadata-schema.md', 'visual/route-geometry.contract.json',
    'visual/baseline-verdicts.md', 'scripts/visual/check.mjs', 'scripts/visual/compare.mjs']) {
    const text = readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(text, /implementation wins/i,
      `${file} still carries the discarded "implementation wins" rule`);
  }
});

test('prototype_observed and production_target are distinct, separately sourced concepts', () => {
  assert.ok(Array.isArray(contract.divergences) && contract.divergences.length > 0);
  assert.deepEqual(MODES, ['production_target', 'prototype_observed']);
  const strengths = Object.keys(contract.authority.strength_scale);
  for (const divergence of contract.divergences) {
    assert.ok(divergence.id, 'every divergence needs an id');
    assert.ok(divergence.where, `${divergence.id} needs a scope`);
    assert.ok(divergence.aspect, `${divergence.id} needs an aspect`);
    assert.ok(divergence.prototype_observed?.length > 10, `${divergence.id} needs prototype_observed`);
    assert.ok(divergence.production_target?.length > 10, `${divergence.id} needs production_target`);
    assert.ok(divergence.authority_source?.length > 5, `${divergence.id} needs an authority_source`);
    assert.ok(divergence.rationale?.length > 10, `${divergence.id} needs a rationale`);
    assert.ok(strengths.includes(divergence.authority_strength),
      `${divergence.id} needs an authority_strength from the declared scale`);
    assert.notEqual(divergence.prototype_observed, divergence.production_target,
      `${divergence.id} records no actual divergence`);
  }
  // The two modes are not interchangeable.
  assert.notEqual(
    JSON.stringify(evaluateContract({ contract, captures: [], destinations: [], mode: 'production_target' }).acceptance_standard),
    JSON.stringify(evaluateContract({ contract, captures: [], destinations: [], mode: 'prototype_observed' }).acceptance_standard),
  );
  assert.throws(() => evaluateContract({ contract, captures: [], destinations: [], mode: 'whatever' }));
});

test('an explicit final-handoff production delta overrides a Prototype omission', () => {
  const byId = new Map(contract.divergences.map((entry: { id: string }) => [entry.id, entry]));
  // The handoff deletes this panel outright; the Prototype still renders it.
  const relationModel: any = byId.get('research-overview.relation-model-panel-removed');
  assert.equal(relationModel.authority_strength, 'explicit-normative');
  assert.match(relationModel.production_target, /REMOVED/);
  // ...and the route contract must therefore not require it.
  for (const viewport of ['desktop', 'mobile']) {
    const sections = contract.routes['research.overview'][viewport].section_order;
    for (const section of sections) {
      assert.ok(!(section.match.classAny ?? []).includes('context-panel'),
        `research.overview ${viewport} must not require the Relation model panel the handoff deletes`);
    }
  }
  // A mandatory addition the Prototype never made.
  const grouping: any = byId.get('positions.market-product-grouping');
  assert.equal(grouping.authority_strength, 'explicit-normative');
  assert.match(grouping.authority_source, /未反映必須修正/);
  // Where the handoff is silent, the contract says so rather than inventing a rule.
  const sticky: any = byId.get('positions.sticky-identity-transparent');
  assert.equal(sticky.authority_strength, 'intent-doc');
  assert.match(sticky.handoff, /SILENT/);
});

test('recorded Prototype defects are never required production behaviour', () => {
  const declared = divergenceIndex(contract);
  assert.ok(declared.size > 0, 'at least one Prototype defect must be geometry-observable');
  for (const [checkId, divergence] of declared) {
    // A relaxation may only ever weaken observation, never the target.
    assert.ok(divergence.production_target.length > 10,
      `${checkId} is relaxed for observation but states no production target`);
    assert.notEqual(divergence.production_target, divergence.prototype_observed);
  }
});

test('Investment Pulse mobile overflow is not an accepted production target', () => {
  const byId = new Map(contract.divergences.map((entry: { id: string }) => [entry.id, entry]));
  const overflow: any = byId.get('pulse.half-width-table-abolished');
  assert.ok(overflow, 'the Pulse overflow divergence must exist');
  assert.equal(overflow.authority_strength, 'explicit-normative');
  assert.match(overflow.prototype_observed, /overflow/i);
  assert.match(overflow.production_target, /ABOLISHED/);
  assert.match(overflow.production_target, /No horizontal document overflow/i);
  // The handoff names this exact defect and prescribes removing the table, not wrapping it.
  assert.match(overflow.authority_source, /overflow bug/);
  assert.ok(overflow.relaxed_in_prototype_observation.includes('investment.pulse.mobile.overflow.document'));

  // The production target must still forbid it. The overflow guardrail is absolute,
  // so a candidate reproducing the Prototype's overflow fails.
  const metrics = (overflowPx: number) => ({
    shell: {
      globalChrome: { present: true, selector: 'header', width: 390, height: 83, orientation: 'horizontal-bar' },
      globalNavigation: { present: true }, domainNavigation: { present: true }, firstContentY: 100,
    },
    typography: { body: { fontSize: 15 }, h1: { fontSize: 30 }, h2: { fontSize: 22 }, tableBody: { fontSize: 14 }, meta: { fontSize: 13 } },
    main: {
      principalContainer: { contentWidth: 358 }, columnCount: 1, columnRatios: [100],
      contentColumnCount: 1, contentColumnRatios: [100], contentBandSelector: null,
      sectionOrder: [], horizontalOverflowPx: overflowPx, overflowingElements: [],
      firstFoldDensity: { charsPerMegapixel: 600 },
    },
    grammar: {
      tables: [], stickyElementCount: 0, svgCount: 0, canvasCount: 0, proportionalBarCount: 0,
      quantitativeVisualCount: 1, listCount: 2, headingCounts: { h1: 1, h2: 3, h3: 0 },
    },
  });
  const capture = (side: string, overflowPx: number) => ({
    destination_id: 'investment.pulse', side, viewport: { name: 'mobile' }, metrics: metrics(overflowPx),
  });
  const captures = [
    capture('prototype', 392), capture('current', 392),
    { ...capture('prototype', 392), viewport: { name: 'desktop' } },
    { ...capture('current', 392), viewport: { name: 'desktop' } },
  ];
  const destinations = [{ destination_id: 'investment.pulse', domain: 'investment' }];

  const target = evaluateContract({ contract, captures, destinations, mode: 'production_target' });
  const overflowCheck = target.routes['investment.pulse'].checks
    .find((check: { id: string }) => check.id === 'investment.pulse.mobile.overflow.document');
  assert.equal(overflowCheck.status, 'FAIL',
    'a candidate reproducing the Prototype overflow must FAIL the production target');

  const observation = evaluateContract({ contract, captures, destinations, mode: 'prototype_observed' });
  const observed = observation.routes['investment.pulse'].checks
    .find((check: { id: string }) => check.id === 'investment.pulse.mobile.overflow.document');
  assert.equal(observed.status, 'OBSERVED_PROTOTYPE_DEFECT',
    'observation mode records the defect instead of failing on it');
  assert.equal(observed.divergence.id, 'pulse.half-width-table-abolished');
});

test('the source-truth constraints the handoff states are recorded, and flagged as unchecked here', () => {
  const block = contract.source_truth_constraints;
  assert.match(block.note, /does not check them/i);
  const ids = block.constraints.map((entry: { id: string }) => entry.id);
  for (const required of ['travel.no-fixed-booking-slots', 'library.intent-gradient-not-promotable',
    'feed.no-ai-canon']) {
    assert.ok(ids.includes(required), `source-truth constraint ${required} is missing`);
  }
  for (const constraint of block.constraints) {
    assert.ok(constraint.requirement?.length > 20, `${constraint.id} needs a requirement`);
    assert.ok(constraint.authority_source?.length > 5, `${constraint.id} needs an authority_source`);
  }
});

test('the contract does not overreach into canonical page topology', () => {
  assert.match(contract.scope.statement, /NOT a canonical page-topology decision/i);
  assert.match(contract.scope.authority_source, /L908/);
});

test('the navigation invariant from the parked history fix is recorded for V1', () => {
  assert.match(contract.navigation_invariant.statement, /one logical browser history entry/i);
  assert.match(contract.navigation_invariant.status, /NOT merged/);
});

test('shell probes name an explicit element per side rather than guessing', () => {
  for (const side of ['prototype', 'current']) {
    const probes = SHELL_PROBES[side];
    assert.ok(probes.globalChrome, `${side} must name its persistent global chrome`);
    assert.ok(probes.globalNav, `${side} must name its global navigation`);
    assert.ok(probes.domainNav, `${side} must name its domain navigation`);
    assert.ok(probes.utility, `${side} must name its utility actions`);
    assert.ok(probes.main, `${side} must name its main content container`);
  }
  assert.equal(SHELL_PROBES.prototype.contentFrame, null, 'the Prototype is a single document');
  assert.equal(SHELL_PROBES.current.contentFrame, '#frame', 'the current shell renders content in an iframe');
});

test('the global-nav probe finds shell-owned navigation, by whatever shape it actually takes', () => {
  // Historical defect: the Prototype's own rail nav — rendered by
  // assets/app.js as `<nav class="nav" aria-label="メインナビゲーション">`
  // inside `<aside class="rail">` — matched NONE of ".global-nav", "nav.global",
  // `nav[aria-label*="global" i]`, or "header nav" (it is classed plainly "nav",
  // its Japanese aria-label never contains "global", and it is never inside a
  // <header>). The probe was encoding one hypothetical implementation's naming
  // convention rather than the normative question — does this product view
  // have global navigation at all — and so reported the Prototype's own global
  // navigation as absent on every route, every time.
  const prototypeNavShape = { tag: 'nav', classes: ['nav'], attrs: { 'aria-label': 'メインナビゲーション' }, inHeader: false };
  const matchesPrototypeShape = (selector) => {
    if (selector === 'nav.nav') return prototypeNavShape.tag === 'nav' && prototypeNavShape.classes.includes('nav');
    if (selector === '.global-nav') return prototypeNavShape.classes.includes('global-nav');
    if (selector === 'nav.global') return prototypeNavShape.classes.includes('global');
    if (selector === 'nav[aria-label*="global" i]') return /global/i.test(prototypeNavShape.attrs['aria-label']);
    if (selector === 'header nav') return prototypeNavShape.inHeader;
    return false;
  };
  assert.equal(
    firstMatchingSelector(SHELL_PROBES.prototype.globalNav, matchesPrototypeShape),
    'nav.nav',
    'the corrected probe list must find the Prototype\'s real global navigation',
  );
  const oldGlobalNavProbe = '.global-nav, nav.global, nav[aria-label*="global" i], header nav';
  assert.equal(
    firstMatchingSelector(oldGlobalNavProbe, matchesPrototypeShape),
    null,
    'demonstrates the historical defect: the pre-fix probe list could never match the Prototype\'s actual nav shape',
  );

  // The fix must not paper over a genuinely missing navigation: a page with no
  // element any listed selector can find must still report absent.
  assert.equal(
    firstMatchingSelector(SHELL_PROBES.prototype.globalNav, () => false),
    null,
    'a page with no matching element anywhere must still be reported as missing global navigation',
  );

  // The current side is shell-owned by html-share's own app/index.html
  // (#global-nav) and is unaffected by this correction — it already matched.
  assert.equal(
    firstMatchingSelector(SHELL_PROBES.current.globalNav, (selector) => selector === '#global-nav'),
    '#global-nav',
  );
});

test('the metric extractor reports computed browser values, never CSS source declarations', () => {
  assert.equal(METRICS_SCHEMA, 'html-share.visual.metrics/1');
  assert.match(METRICS_SOURCE, /getComputedStyle/);
  assert.match(METRICS_SOURCE, /getBoundingClientRect/);
  // It must be self-contained: it is serialised into the page, so no imports or
  // closure references may leak into it.
  assert.doesNotMatch(METRICS_SOURCE, /\bimport\b|\brequire\(/);
  for (const required of ['globalChrome', 'firstContentY', 'principalContainer', 'contentWidth', 'columnRatios',
    'contentColumnRatios', 'sectionOrder', 'horizontalOverflowPx', 'firstFoldDensity', 'stickyElementCount',
    'quantitativeVisualCount', 'classHistogram', 'sizeHistogram']) {
    assert.match(METRICS_SOURCE, new RegExp(required), `metrics must report ${required}`);
  }
});

test('capture file naming is deterministic and derived from identity, not from ordering', () => {
  // Reproducing the naming rule here is deliberate: it is a contract, and a
  // silent change to it would break every downstream comparison mapping.
  for (const destination of DESTINATIONS) {
    for (const viewport of VIEWPORTS) {
      for (const side of ['prototype', 'current']) {
        const base = `${destination.destination_id}__${side}__${viewport.width}x${viewport.height}`;
        assert.match(base, /^[a-z]+(\.[a-z-]+)?__(prototype|current)__\d+x\d+$/);
      }
    }
  }
});

test('section mapping distinguishes an absent section from an out-of-order one', () => {
  const expected = [
    { id: 'first', match: { classAny: ['a'] } },
    { id: 'second', match: { classAny: ['b'] } },
    { id: 'third', match: { classAny: ['c'] } },
  ];
  const section = (token: string) => ({ classList: [token], heading: token, y: 0, inFirstFold: true });

  const inOrder = mapSections([section('a'), section('b'), section('c')], expected);
  assert.deepEqual(inOrder.found, ['first', 'second', 'third']);
  assert.deepEqual(inOrder.absent, []);
  assert.deepEqual(inOrder.outOfOrder, []);

  const swapped = mapSections([section('b'), section('a'), section('c')], expected);
  assert.deepEqual(swapped.outOfOrder.map((entry: { id: string }) => entry.id), ['second'],
    'a section that exists but sits too early is out of order, not absent');
  assert.deepEqual(swapped.absent, []);

  const missing = mapSections([section('a'), section('c')], expected);
  assert.deepEqual(missing.absent, ['second']);
  assert.deepEqual(missing.outOfOrder, []);

  const extra = mapSections([section('a'), section('z'), section('b'), section('c')], expected);
  assert.equal(extra.unmapped.length, 1, 'sections outside the contract are reported, not silently dropped');
});

test('the checker fails loudly on gross drift and does not quietly pass missing data', () => {
  const metrics = (overrides: Record<string, unknown> = {}) => ({
    shell: {
      globalChrome: { present: true, selector: 'aside', width: 236, height: 900, orientation: 'vertical-rail' },
      globalNavigation: { present: true }, domainNavigation: { present: true },
      firstContentY: 40,
    },
    typography: {
      body: { fontSize: 15 }, h1: { fontSize: 34 }, h2: { fontSize: 23 },
      tableBody: { fontSize: 14 }, meta: { fontSize: 13 },
    },
    main: {
      principalContainer: { contentWidth: 941.6 },
      columnCount: 3, columnRatios: [33.3, 33.3, 33.3],
      contentColumnCount: 3, contentColumnRatios: [33.3, 33.3, 33.3], contentBandSelector: 'section',
      sectionOrder: [
        { classList: ['home-research'], heading: '研究', y: 100, inFirstFold: true },
        { classList: ['home-lower'], heading: '暮らし', y: 500, inFirstFold: true },
        { classList: ['home-live-work'], heading: 'Live Work', y: 900, inFirstFold: false },
        { classList: ['recent-grid'], heading: '最近更新', y: 1200, inFirstFold: false },
      ],
      horizontalOverflowPx: 0, overflowingElements: [],
      firstFoldDensity: { charsPerMegapixel: 765 },
      ...(overrides.main as object ?? {}),
    },
    grammar: {
      tables: [], stickyElementCount: 0, svgCount: 0, canvasCount: 0,
      proportionalBarCount: 0, quantitativeVisualCount: 0, listCount: 4,
      headingCounts: { h1: 1, h2: 5, h3: 0 },
    },
    ...overrides,
  });

  const destinations = [{ destination_id: 'home', domain: 'home' }];
  const clean = evaluateContract({
    contract,
    destinations,
    captures: [
      capture('home', 'prototype', 'desktop', metrics()),
      capture('home', 'current', 'desktop', metrics()),
      capture('home', 'prototype', 'mobile', metrics()),
      capture('home', 'current', 'mobile', metrics({
        shell: { ...metrics().shell, globalChrome: { present: true, selector: 'header', width: 390, height: 83, orientation: 'horizontal-bar' } },
      })),
    ],
  });
  assert.equal(clean.schema, ACCEPTANCE_SCHEMA);
  assert.equal(clean.routes.home.counts.critical, 0, 'matching geometry must not raise critical failures');

  // Gross drift: half the content width, wrong column count, a dropped section.
  const drifted = metrics();
  drifted.main.principalContainer.contentWidth = 470;
  drifted.main.columnCount = 1;
  drifted.main.columnRatios = [100];
  drifted.main.sectionOrder = drifted.main.sectionOrder.filter((s) => !s.classList.includes('home-research'));
  drifted.typography.body.fontSize = 19;
  const failed = evaluateContract({
    contract,
    destinations,
    captures: [
      capture('home', 'prototype', 'desktop', metrics()),
      capture('home', 'current', 'desktop', drifted),
      capture('home', 'prototype', 'mobile', metrics()),
      capture('home', 'current', 'mobile', drifted),
    ],
  });
  const ids = failed.routes.home.checks.filter((c: { status: string }) => c.status === 'FAIL').map((c: { id: string }) => c.id);
  assert.ok(ids.includes('home.desktop.main.principal-width'), 'a 50% width change must fail');
  assert.ok(ids.includes('home.desktop.main.column-count'), 'losing two columns must fail');
  assert.ok(ids.includes('home.desktop.type.body'), 'a 4px body font change must fail');
  assert.ok(ids.includes('home.desktop.section-present'), 'a dropped required section must fail');
  assert.ok(failed.routes.home.counts.critical > 0);
  assert.equal(failed.routes.home.guardrail_status, 'FAIL');

  // A missing capture must fail, never silently pass.
  const incomplete = evaluateContract({
    contract,
    destinations,
    captures: [capture('home', 'prototype', 'desktop', metrics())],
  });
  assert.equal(incomplete.routes.home.guardrail_status, 'FAIL');
  assert.ok(incomplete.routes.home.checks.some((c: { id: string }) => c.id === 'home.desktop.captures'));
});

test('the harness runs entirely locally and depends on no production URL', () => {
  const sources = ['run.mjs', 'capture.mjs', 'build-sides.mjs', 'server.mjs', 'compare.mjs', 'check.mjs', 'metrics.mjs', 'cdp.mjs', 'compare-runs.mjs']
    .map((file) => readFileSync(path.join(root, 'scripts/visual', file), 'utf8'));
  for (const source of sources) {
    assert.doesNotMatch(source, /https?:\/\/(?!127\.0\.0\.1|localhost)/,
      'the harness must not reference any remote origin');
    // Placeholder `aws:` keys appear in the generated local build config because
    // the config schema requires them; what must never appear is a real client.
    assert.doesNotMatch(source, /@aws-sdk|new (S3|CloudFront|SSM|DynamoDB)\w*Client/,
      'the harness must not construct an AWS client');
    assert.doesNotMatch(source, /createInvalidation|PutObjectCommand|cdk deploy/i,
      'the harness must not deploy or invalidate anything');
    assert.doesNotMatch(source, /\bpublish\b\s*\(/, 'the harness must never invoke publish');
  }
  assert.equal(RUN_SCHEMA, 'html-share.visual.run/1');
  assert.match(TOOL_VERSION, /^html-share-visual-harness\/\d+\.\d+\.\d+$/);
});

test('the recorded V0 baseline verdicts are unchanged by the authority correction', () => {
  // The authority correction changes what the TARGET means. It does not change what
  // was measured, so this evidence must survive it untouched.
  const verdicts = readFileSync(path.join(root, 'visual/baseline-verdicts.md'), 'utf8');
  const expected: Record<string, string> = {
    home: 'FUNDAMENTALLY DIFFERENT',
    'research.overview': 'FUNDAMENTALLY DIFFERENT',
    'research.feed': 'FUNDAMENTALLY DIFFERENT',
    'research.papers': 'FUNDAMENTALLY DIFFERENT',
    'research.knowledge-review': 'FUNDAMENTALLY DIFFERENT',
    'personal.current': 'FUNDAMENTALLY DIFFERENT',
    'personal.plans': 'MATERIAL GAP',
    'personal.library': 'MATERIAL GAP',
    'personal.travel': 'FUNDAMENTALLY DIFFERENT',
    'investment.dashboard': 'FUNDAMENTALLY DIFFERENT',
    'investment.pulse': 'MATERIAL GAP',
    'investment.positions': 'PARTIAL',
    'investment.decisions': 'MATERIAL GAP',
    'investment.journal': 'MATERIAL GAP',
    'operational.live-work': 'FUNDAMENTALLY DIFFERENT',
  };
  assert.equal(Object.keys(expected).length, 15);
  for (const [destination, verdict] of Object.entries(expected)) {
    assert.ok(new RegExp(`\\|\\s*${destination.replace('.', '\\.')}\\s*\\|\\s*${verdict}\\s*\\|`).test(verdicts),
      `baseline verdict for ${destination} must remain ${verdict}`);
  }
  assert.match(verdicts, /9 FUNDAMENTALLY DIFFERENT · 5 MATERIAL GAP · 1 PARTIAL · 0 CLOSE/);
  assert.match(verdicts, /0 of 15 routes pass/);
  assert.doesNotMatch(verdicts, /CONFORMANT/);
});

test('every run records both validations so reproducibility covers them', () => {
  const runner = readFileSync(path.join(root, 'scripts/visual/run.mjs'), 'utf8');
  assert.match(runner, /validatePrototypeObservation/);
  assert.match(runner, /validateProductionTargetIntegrity/);
  assert.match(runner, /mode: 'production_target'/,
    'candidates must be graded against the production target');
  const comparator = readFileSync(path.join(root, 'scripts/visual/compare-runs.mjs'), 'utf8');
  assert.match(comparator, /prototype_observation/);
  assert.match(comparator, /production_target_integrity/);
  // The ephemeral local port must be normalised, or two runs can never compare equal.
  assert.match(comparator, /127\\\.0\\\.0\\\.1:\\d\+/);
});

test('generated visual artifacts stay out of version control', () => {
  const ignore = readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(ignore, /^\.html-share\/$/m,
    'captures and galleries are written under .html-share/ and must stay ignored');
  assert.ok(existsSync(path.join(root, 'visual/route-geometry.contract.json')),
    'the contract itself is committed textual metadata');
});
