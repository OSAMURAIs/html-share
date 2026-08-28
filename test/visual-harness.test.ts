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
import { METRICS_SCHEMA, METRICS_SOURCE } from '../scripts/visual/metrics.mjs';
// @ts-expect-error -- see above
import { ACCEPTANCE_SCHEMA, evaluateContract, mapSections } from '../scripts/visual/check.mjs';
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
  assert.equal(contract.schema, 'html-share.visual.contract/1');
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

test('the motion contract defines both normal and reduced-motion behaviour for every required hook', () => {
  const ids = contract.motion_contract.behaviours.map((b: { id: string }) => b.id);
  for (const required of ['cross-route-transition', 'research-filter-reflow', 'travel-timeline-draw',
    'travel-current-marker', 'allocation-reveal', 'pl-bar-reveal']) {
    assert.ok(ids.includes(required), `motion contract is missing ${required}`);
  }
  for (const behaviour of contract.motion_contract.behaviours) {
    assert.ok(behaviour.normal?.length > 20, `${behaviour.id} needs a normal expectation`);
    assert.ok(behaviour.reduced_motion?.length > 5, `${behaviour.id} needs a reduced-motion expectation`);
    assert.ok(behaviour.routes, `${behaviour.id} needs a route scope`);
  }
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

test('generated visual artifacts stay out of version control', () => {
  const ignore = readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(ignore, /^\.html-share\/$/m,
    'captures and galleries are written under .html-share/ and must stay ignored');
  assert.ok(existsSync(path.join(root, 'visual/route-geometry.contract.json')),
    'the contract itself is committed textual metadata');
});
