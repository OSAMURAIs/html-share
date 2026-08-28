// Evaluates the route geometry contract against captured metrics.
//
// These are GUARDRAILS, not a pixel-diff. Every check is either a comparison of
// computed geometry between the two sides against a stated tolerance, or a
// structural expectation declared in visual/route-geometry.contract.json.
export const ACCEPTANCE_SCHEMA = 'html-share.visual.acceptance/1';

const pass = (id, title, detail) => ({ id, title, status: 'PASS', detail });
const fail = (id, title, detail, severity = 'major') => ({ id, title, status: 'FAIL', severity, detail });
const skip = (id, title, detail) => ({ id, title, status: 'SKIP', detail });

const pct = (value) => Math.round(value * 10) / 10;

function compareNumber({ id, title, actual, expected, tolerance, unit, severity = 'major' }) {
  if (actual === null || actual === undefined || expected === null || expected === undefined) {
    return skip(id, title, { actual, expected, reason: 'value unavailable on one side' });
  }
  const delta = Math.abs(actual - expected);
  const detail = { prototype: expected, current: actual, delta: pct(delta), tolerance, unit };
  return delta <= tolerance ? pass(id, title, detail) : fail(id, title, detail, severity);
}

function comparePercent({ id, title, actual, expected, tolerancePct, severity = 'major' }) {
  if (!expected) return skip(id, title, { actual, expected, reason: 'prototype value is zero or missing' });
  const deltaPct = Math.abs((actual - expected) / expected) * 100;
  const detail = { prototype: expected, current: actual, delta_pct: pct(deltaPct), tolerance_pct: tolerancePct };
  return deltaPct <= tolerancePct ? pass(id, title, detail) : fail(id, title, detail, severity);
}

// ---- section-order mapping -------------------------------------------------
function matches(section, matcher) {
  if (matcher.heading) {
    if (new RegExp(matcher.heading, 'i').test(section.heading)) return true;
  }
  if (Array.isArray(matcher.classAny)) {
    if (matcher.classAny.some((token) => section.classList.includes(token))) return true;
  }
  if (matcher.selector && section.selector && section.selector.includes(matcher.selector)) return true;
  return false;
}

// Monotonic alignment: walk the contract in order and consume sections forward
// only. A contract section that exists but sits earlier than the cursor is
// reported as OUT OF ORDER; one that does not exist anywhere is ABSENT. Those
// are different defects and must not be collapsed into one another.
export function mapSections(sections, expected) {
  const consumed = new Set();
  const mapped = [];
  const outOfOrder = [];
  const absent = [];
  let cursor = 0;
  for (const entry of expected) {
    let index = -1;
    for (let i = cursor; i < sections.length; i += 1) {
      if (matches(sections[i], entry.match)) { index = i; break; }
    }
    if (index >= 0) {
      consumed.add(index);
      mapped.push({ id: entry.id, heading: sections[index].heading, y: sections[index].y, inFirstFold: sections[index].inFirstFold });
      cursor = index + 1;
      continue;
    }
    const anywhere = sections.findIndex((section) => matches(section, entry.match));
    if (anywhere >= 0) outOfOrder.push({ id: entry.id, heading: sections[anywhere].heading, at: anywhere, expected_after: cursor });
    else absent.push(entry.id);
  }
  const unmapped = sections
    .map((section, index) => ({ index, section }))
    .filter(({ index }) => !consumed.has(index))
    .map(({ section }) => ({ heading: section.heading, classList: section.classList.slice(0, 4), y: section.y }));
  return { mapped, unmapped, outOfOrder, absent, found: mapped.map((entry) => entry.id) };
}

function checkSectionOrder({ idPrefix, sections, expected }) {
  if (!expected || !expected.length) return [skip(`${idPrefix}.section-order`, 'Major section order', { reason: 'no section contract declared' })];
  const { mapped, unmapped, outOfOrder, absent } = mapSections(sections, expected);
  const required = new Set(expected.filter((entry) => entry.required !== false).map((entry) => entry.id));
  const results = [];

  const missingRequired = absent.filter((id) => required.has(id));
  results.push(missingRequired.length
    ? fail(`${idPrefix}.section-present`, 'Required sections present', {
      absent: missingRequired, found: mapped.map((entry) => entry.id), unmapped_count: unmapped.length,
    }, 'critical')
    : pass(`${idPrefix}.section-present`, 'Required sections present', { found: mapped.map((entry) => entry.id) }));

  const misordered = outOfOrder.filter((entry) => required.has(entry.id));
  results.push(misordered.length === 0
    ? pass(`${idPrefix}.section-order`, 'Major section order exact', { order: mapped.map((entry) => entry.id) })
    : fail(`${idPrefix}.section-order`, 'Major section order exact', {
      out_of_order: misordered, observed: mapped.map((entry) => entry.id),
    }, 'critical'));

  if (unmapped.length) {
    results.push(skip(`${idPrefix}.section-unmapped`, 'Sections outside the contract', { unmapped: unmapped.slice(0, 8) }));
  }
  return results;
}

// ---- per viewport ----------------------------------------------------------
function checkViewport({ destinationId, viewportName, prototype, current, route, tolerances }) {
  const idPrefix = `${destinationId}.${viewportName}`;
  const routeView = route?.[viewportName] ?? {};
  const results = [];

  // Shell framing. The persistent global chrome is compared as one role: a left
  // rail on desktop, a top bar on mobile, whichever element each side uses.
  const expectedOrientation = routeView.global_chrome_orientation;
  const protoChrome = prototype.shell.globalChrome;
  const currentChrome = current.shell.globalChrome;
  results.push(protoChrome.present === currentChrome.present
    ? pass(`${idPrefix}.shell.global-chrome`, 'Persistent global chrome present on both sides', {
      prototype: protoChrome.selector, current: currentChrome.selector,
    })
    : fail(`${idPrefix}.shell.global-chrome`, 'Persistent global chrome present on both sides', {
      prototype: protoChrome, current: currentChrome,
    }, 'critical'));
  if (expectedOrientation && currentChrome.present) {
    results.push(currentChrome.orientation === expectedOrientation
      ? pass(`${idPrefix}.shell.chrome-orientation`, 'Global chrome orientation matches contract', {
        expected: expectedOrientation, current: currentChrome.orientation, prototype: protoChrome.orientation,
      })
      : fail(`${idPrefix}.shell.chrome-orientation`, 'Global chrome orientation matches contract', {
        expected: expectedOrientation, current: currentChrome.orientation, prototype: protoChrome.orientation,
      }, 'critical'));
  }
  results.push(compareNumber({
    id: `${idPrefix}.shell.chrome-extent`,
    title: 'Global chrome extent matches Prototype',
    actual: currentChrome.present ? (expectedOrientation === 'vertical-rail' ? currentChrome.width : currentChrome.height) : null,
    expected: protoChrome.present ? (expectedOrientation === 'vertical-rail' ? protoChrome.width : protoChrome.height) : null,
    tolerance: tolerances.shell_chrome_extent_px,
    unit: 'px',
  }));
  results.push(compareNumber({
    id: `${idPrefix}.shell.first-content-y`,
    title: 'First content starts at the Prototype-relative offset',
    actual: current.shell.firstContentY,
    expected: prototype.shell.firstContentY,
    tolerance: tolerances.first_content_y_px,
    unit: 'px',
  }));
  results.push(prototype.shell.globalNavigation.present === current.shell.globalNavigation.present
    ? pass(`${idPrefix}.shell.global-nav`, 'Global navigation present on both sides', {
      prototype: prototype.shell.globalNavigation.present, current: current.shell.globalNavigation.present,
    })
    : fail(`${idPrefix}.shell.global-nav`, 'Global navigation present on both sides', {
      prototype: prototype.shell.globalNavigation, current: current.shell.globalNavigation,
    }));
  results.push(prototype.shell.domainNavigation.present === current.shell.domainNavigation.present
    ? pass(`${idPrefix}.shell.domain-nav`, 'Domain navigation present on both sides', {
      prototype: prototype.shell.domainNavigation.present, current: current.shell.domainNavigation.present,
    })
    : fail(`${idPrefix}.shell.domain-nav`, 'Domain navigation present on both sides', {
      prototype: prototype.shell.domainNavigation, current: current.shell.domainNavigation,
    }, 'minor'));

  // Principal geometry.
  results.push(comparePercent({
    id: `${idPrefix}.main.principal-width`,
    title: 'Principal content width within tolerance of Prototype',
    actual: current.main.principalContainer.contentWidth,
    expected: prototype.main.principalContainer.contentWidth,
    tolerancePct: tolerances.principal_width_pct,
  }));

  // Typography (computed, not declared).
  for (const [key, tolerance, title] of [
    ['body', tolerances.body_font_px, 'Body font size'],
    ['tableBody', tolerances.table_font_px, 'Table body font size'],
    ['h1', tolerances.heading_font_px, 'H1 font size'],
    ['h2', tolerances.heading_font_px, 'H2 font size'],
  ]) {
    results.push(compareNumber({
      id: `${idPrefix}.type.${key}`,
      title: `${title} within tolerance`,
      actual: current.typography[key]?.fontSize ?? null,
      expected: prototype.typography[key]?.fontSize ?? null,
      tolerance,
      unit: 'px',
    }));
  }
  results.push(compareNumber({
    id: `${idPrefix}.type.meta`,
    title: 'Secondary/meta text size within tolerance',
    actual: current.typography.meta?.fontSize ?? null,
    expected: prototype.typography.meta?.fontSize ?? null,
    tolerance: tolerances.body_font_px,
    unit: 'px',
    severity: 'minor',
  }));

  // Column structure, desktop only — mobile is governed by the mobile hierarchy.
  if (viewportName === 'desktop') {
    const expectedColumns = routeView.expected_column_count;
    if (expectedColumns !== undefined) {
      results.push(current.main.columnCount === expectedColumns
        ? pass(`${idPrefix}.main.column-count`, 'Main column count matches contract', { expected: expectedColumns, current: current.main.columnCount })
        : fail(`${idPrefix}.main.column-count`, 'Main column count matches contract', {
          expected: expectedColumns, current: current.main.columnCount, prototype: prototype.main.columnCount,
        }, 'critical'));
    }
    const expectedContentColumns = routeView.expected_content_column_count;
    if (expectedContentColumns !== undefined) {
      results.push(current.main.contentColumnCount === expectedContentColumns
        ? pass(`${idPrefix}.main.content-column-count`, 'Repeating content grid column count matches contract', {
          expected: expectedContentColumns, current: current.main.contentColumnCount,
          current_band: current.main.contentBandSelector, prototype_band: prototype.main.contentBandSelector,
        })
        : fail(`${idPrefix}.main.content-column-count`, 'Repeating content grid column count matches contract', {
          expected: expectedContentColumns, current: current.main.contentColumnCount,
          prototype: prototype.main.contentColumnCount,
          current_band: current.main.contentBandSelector, prototype_band: prototype.main.contentBandSelector,
        }, 'major'));
    }
    const expectedRatios = routeView.expected_column_ratios;
    if (Array.isArray(expectedRatios) && expectedRatios.length) {
      const observed = current.main.columnRatios;
      const comparable = observed.length === expectedRatios.length;
      const worst = comparable ? Math.max(...expectedRatios.map((value, index) => Math.abs(value - observed[index]))) : null;
      results.push(comparable && worst <= tolerances.column_ratio_points
        ? pass(`${idPrefix}.main.column-ratios`, 'Major column ratios within tolerance', { expected: expectedRatios, current: observed, worst_delta_points: pct(worst) })
        : fail(`${idPrefix}.main.column-ratios`, 'Major column ratios within tolerance', {
          expected: expectedRatios, current: observed, prototype: prototype.main.columnRatios,
          worst_delta_points: worst === null ? 'column count differs' : pct(worst),
          tolerance_points: tolerances.column_ratio_points,
        }, 'critical'));
    }
  }

  // Overflow and clipping.
  const overflow = current.main.horizontalOverflowPx;
  results.push(overflow <= tolerances.overflow_px
    ? pass(`${idPrefix}.overflow.document`, 'No unexpected horizontal document overflow', { overflow_px: overflow })
    : fail(`${idPrefix}.overflow.document`, 'No unexpected horizontal document overflow', {
      overflow_px: overflow, tolerance_px: tolerances.overflow_px, prototype_overflow_px: prototype.main.horizontalOverflowPx,
      offenders: current.main.overflowingElements.slice(0, 5),
    }, 'critical'));

  if (viewportName === 'mobile') {
    // Clipping: content extending past the viewport inside a container that does
    // not scroll is unreachable, which the contract treats as a hard failure.
    // Content that extends past the viewport is only a failure when nothing can
    // scroll to reach it. A wide table inside an overflow-x:auto wrapper is the
    // intended pattern, not clipping.
    const clipped = current.main.overflowingElements.filter((entry) => entry.beyondViewportPx > tolerances.overflow_px
      && entry.overflowStyle !== 'auto' && entry.overflowStyle !== 'scroll' && !entry.scrollableAncestor);
    results.push(clipped.length === 0
      ? pass(`${idPrefix}.mobile.clipping`, 'No critical content clipped off-screen', {})
      : fail(`${idPrefix}.mobile.clipping`, 'No critical content clipped off-screen', { clipped: clipped.slice(0, 5) }, 'critical'));

    if (routeView.table_overflow_strategy === 'horizontal-scroll-container') {
      const unscrollable = current.grammar.tables.filter((table) => table.overflowsViewport && !table.inScrollContainer);
      results.push(unscrollable.length === 0
        ? pass(`${idPrefix}.mobile.table-overflow`, 'Wide tables stay inside a scroll container', { tables: current.grammar.tables.length })
        : fail(`${idPrefix}.mobile.table-overflow`, 'Wide tables stay inside a scroll container', { offenders: unscrollable }, 'major'));
    }
    if (routeView.sticky_identity) {
      results.push(current.grammar.stickyElementCount > 0
        ? pass(`${idPrefix}.mobile.sticky-identity`, 'Sticky identity retained', { count: current.grammar.stickyElementCount })
        : fail(`${idPrefix}.mobile.sticky-identity`, 'Sticky identity retained', {
          current: 0, prototype: prototype.grammar.stickyElementCount,
        }, 'major'));
    }
  }

  // First-fold information density proxy.
  results.push(comparePercent({
    id: `${idPrefix}.fold.density`,
    title: 'First-fold content density comparable to Prototype',
    actual: current.main.firstFoldDensity.charsPerMegapixel,
    expected: prototype.main.firstFoldDensity.charsPerMegapixel,
    tolerancePct: tolerances.fold_density_pct,
    severity: 'minor',
  }));

  // Section order.
  results.push(...checkSectionOrder({ idPrefix, sections: current.main.sectionOrder, expected: routeView.section_order }));

  // Route-specific visual grammar.
  for (const [key, expectation] of Object.entries(routeView.visual_grammar ?? {})) {
    const actual = readGrammar(current, key);
    const ok = (expectation.min === undefined || actual >= expectation.min)
      && (expectation.max === undefined || actual <= expectation.max);
    const detail = { current: actual, prototype: readGrammar(prototype, key), expectation, why: expectation.why };
    results.push(ok
      ? pass(`${idPrefix}.grammar.${key}`, `Visual grammar: ${key}`, detail)
      : fail(`${idPrefix}.grammar.${key}`, `Visual grammar: ${key}`, detail, expectation.severity ?? 'major'));
  }

  return results;
}

function readGrammar(metrics, key) {
  switch (key) {
    case 'tables': return metrics.grammar.tables.length;
    case 'widest_table_columns': return Math.max(0, ...metrics.grammar.tables.map((table) => table.columnCount));
    case 'sticky_elements': return metrics.grammar.stickyElementCount;
    case 'quantitative_visuals': return metrics.grammar.quantitativeVisualCount;
    case 'proportional_bars': return metrics.grammar.proportionalBarCount;
    case 'svg': return metrics.grammar.svgCount;
    case 'lists': return metrics.grammar.listCount;
    case 'sections': return metrics.main.sectionOrder.length;
    case 'h2': return metrics.grammar.headingCounts.h2;
    case 'h3': return metrics.grammar.headingCounts.h3;
    default: return null;
  }
}

export function evaluateContract({ contract, captures, destinations }) {
  const index = new Map();
  for (const capture of captures) index.set(`${capture.destination_id}|${capture.side}|${capture.viewport.name}`, capture);

  const routes = {};
  for (const destination of destinations) {
    const id = destination.destination_id;
    const route = contract.routes[id];
    const checks = [];
    if (!route) {
      checks.push(fail(`${id}.contract`, 'Route declared in the geometry contract', { destination_id: id }, 'critical'));
    } else {
      for (const viewportName of ['desktop', 'mobile']) {
        const prototype = index.get(`${id}|prototype|${viewportName}`);
        const current = index.get(`${id}|current|${viewportName}`);
        if (!prototype || !current) {
          checks.push(fail(`${id}.${viewportName}.captures`, 'Both sides captured', { prototype: !!prototype, current: !!current }, 'critical'));
          continue;
        }
        checks.push(...checkViewport({
          destinationId: id,
          viewportName,
          prototype: prototype.metrics,
          current: current.metrics,
          route,
          tolerances: contract.tolerances,
        }));
      }
    }
    const failures = checks.filter((check) => check.status === 'FAIL');
    routes[id] = {
      destination_id: id,
      label: route?.label ?? id,
      domain_grammar: route?.domain_grammar ?? null,
      checks,
      counts: {
        pass: checks.filter((check) => check.status === 'PASS').length,
        fail: failures.length,
        skip: checks.filter((check) => check.status === 'SKIP').length,
        critical: failures.filter((check) => check.severity === 'critical').length,
        major: failures.filter((check) => check.severity === 'major').length,
        minor: failures.filter((check) => check.severity === 'minor').length,
      },
      guardrail_status: failures.length === 0 ? 'PASS' : 'FAIL',
    };
  }

  const all = Object.values(routes);
  return {
    schema: ACCEPTANCE_SCHEMA,
    tolerances: contract.tolerances,
    routes,
    summary: {
      routes_evaluated: all.length,
      routes_passing_guardrails: all.filter((route) => route.guardrail_status === 'PASS').length,
      routes_failing_guardrails: all.filter((route) => route.guardrail_status === 'FAIL').length,
      total_checks: all.reduce((sum, route) => sum + route.checks.length, 0),
      total_failures: all.reduce((sum, route) => sum + route.counts.fail, 0),
      critical_failures: all.reduce((sum, route) => sum + route.counts.critical, 0),
    },
  };
}

// Validates the contract against the design authority itself. If the Prototype
// cannot satisfy its own contract — outside the failures the contract explicitly
// documents as Prototype defects — the contract is wrong, not the candidate.
export function selfValidateContract({ contract, captures, destinations }) {
  const prototypeOnly = captures
    .filter((capture) => capture.side === 'prototype')
    .flatMap((capture) => [capture, { ...capture, side: 'current' }]);
  const result = evaluateContract({ contract, captures: prototypeOnly, destinations });
  const allowed = new Set(contract.expected_prototype_failures?.check_ids ?? []);
  const failures = Object.values(result.routes)
    .flatMap((route) => route.checks)
    .filter((check) => check.status === 'FAIL')
    .map((check) => ({ id: check.id, severity: check.severity, detail: check.detail }));
  const unexpected = failures.filter((failure) => !allowed.has(failure.id));
  const documentedButPassing = [...allowed].filter((id) => !failures.some((failure) => failure.id === id));
  return {
    valid: unexpected.length === 0 && documentedButPassing.length === 0,
    total_checks: result.summary.total_checks,
    expected_failures: [...allowed],
    unexpected_failures: unexpected,
    documented_failures_that_now_pass: documentedButPassing,
  };
}
