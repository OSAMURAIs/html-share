// Evaluates the route geometry contract against captured metrics.
//
// These are GUARDRAILS, not a pixel-diff. Every check is either a comparison of
// computed geometry between the two sides against a stated tolerance, or a
// structural expectation declared in visual/route-geometry.contract.json.
//
// TWO MODES, TWO DIFFERENT QUESTIONS.
//
//   production_target  - what a candidate implementation MUST satisfy. This is the
//                        acceptance standard: Prototype v5 plus the explicit
//                        production deltas required by the final handoff. Recorded
//                        Prototype defects are NOT part of it, so a candidate can
//                        never pass by copying one.
//   prototype_observed - what the Prototype actually does. Used only to prove the
//                        harness measured the Prototype correctly. It tolerates the
//                        enumerated Prototype defects, which is exactly why it must
//                        never be used to grade a candidate.
export const ACCEPTANCE_SCHEMA = 'html-share.visual.acceptance/2';
export const MODES = Object.freeze(['production_target', 'prototype_observed']);

const pass = (id, title, detail) => ({ id, title, status: 'PASS', detail });
const fail = (id, title, detail, severity = 'major') => ({ id, title, status: 'FAIL', severity, detail });
const skip = (id, title, detail) => ({ id, title, status: 'SKIP', detail });
// A check the Prototype does not satisfy because of a recorded Prototype defect.
// Produced in prototype_observed mode only, never in production_target mode.
const observedDefect = (check, divergence) => ({
  id: check.id,
  title: check.title,
  status: 'OBSERVED_PROTOTYPE_DEFECT',
  detail: check.detail,
  divergence: {
    id: divergence.id,
    prototype_observed: divergence.prototype_observed,
    production_target: divergence.production_target,
    authority_source: divergence.authority_source,
  },
});

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

  // Which section leads the page. Monotonic order alone cannot express "X must
  // not be what the user meets first", which is exactly what the handoff requires
  // on the routes where it legislates emphasis.
  if (Array.isArray(routeView.first_section) && routeView.first_section.length) {
    const contractIdOf = (section) => routeView.section_order
      ?.find((entry) => matches(section, entry.match))?.id ?? null;
    const leading = current.main.sectionOrder.map(contractIdOf).find((id) => id !== null) ?? null;
    const detail = { allowed: routeView.first_section, leading, why: routeView.first_section_why };
    results.push(leading !== null && routeView.first_section.includes(leading)
      ? pass(`${idPrefix}.section-first`, 'The page leads with the section the target requires', detail)
      : fail(`${idPrefix}.section-first`, 'The page leads with the section the target requires', detail, 'critical'));
  }

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

export function divergenceIndex(contract) {
  const byCheckId = new Map();
  for (const divergence of contract.divergences ?? []) {
    for (const checkId of divergence.relaxed_in_prototype_observation ?? []) {
      byCheckId.set(checkId, divergence);
    }
  }
  return byCheckId;
}

export function evaluateContract({ contract, captures, destinations, mode = 'production_target' }) {
  if (!MODES.includes(mode)) throw new Error(`unknown evaluation mode: ${mode}`);
  // Observation mode does not use a weaker contract. It applies named, enumerated
  // relaxations on top of the same one, so the two modes cannot drift apart.
  const relaxations = mode === 'prototype_observed' ? divergenceIndex(contract) : new Map();
  const index = new Map();
  for (const capture of captures) index.set(`${capture.destination_id}|${capture.side}|${capture.viewport.name}`, capture);

  const routes = {};
  for (const destination of destinations) {
    const id = destination.destination_id;
    const route = contract.routes[id];
    let checks = [];
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
    checks = checks.map((check) => {
      if (check.status !== 'FAIL') return check;
      const divergence = relaxations.get(check.id);
      return divergence ? observedDefect(check, divergence) : check;
    });

    const failures = checks.filter((check) => check.status === 'FAIL');
    routes[id] = {
      destination_id: id,
      label: route?.label ?? id,
      domain_grammar: route?.domain_grammar ?? null,
      divergences: (contract.divergences ?? []).filter((divergence) => divergence.where === id || divergence.where === 'global'),
      checks,
      counts: {
        pass: checks.filter((check) => check.status === 'PASS').length,
        fail: failures.length,
        skip: checks.filter((check) => check.status === 'SKIP').length,
        observed_prototype_defect: checks.filter((check) => check.status === 'OBSERVED_PROTOTYPE_DEFECT').length,
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
    mode,
    acceptance_standard: mode === 'production_target'
      ? 'Prototype v5 plus the explicit production deltas required by the final handoff'
      : 'the Prototype as it actually renders, including its recorded defects',
    tolerances: contract.tolerances,
    routes,
    summary: {
      mode,
      routes_evaluated: all.length,
      routes_passing_guardrails: all.filter((route) => route.guardrail_status === 'PASS').length,
      routes_failing_guardrails: all.filter((route) => route.guardrail_status === 'FAIL').length,
      total_checks: all.reduce((sum, route) => sum + route.checks.length, 0),
      total_failures: all.reduce((sum, route) => sum + route.counts.fail, 0),
      critical_failures: all.reduce((sum, route) => sum + route.counts.critical, 0),
      observed_prototype_defects: all.reduce((sum, route) => sum + route.counts.observed_prototype_defect, 0),
    },
  };
}

const asBothSides = (captures) => captures
  .filter((capture) => capture.side === 'prototype')
  .flatMap((capture) => [capture, { ...capture, side: 'current' }]);

// PROTOTYPE OBSERVATION VALIDATION.
//
// Proves the harness measured the Prototype correctly: with the Prototype standing
// in as both sides, every check must either pass or be a named, recorded Prototype
// defect. This says nothing about what production must do.
export function validatePrototypeObservation({ contract, captures, destinations }) {
  const result = evaluateContract({
    contract, captures: asBothSides(captures), destinations, mode: 'prototype_observed',
  });
  const allChecks = Object.values(result.routes).flatMap((route) => route.checks);
  const unexplained = allChecks
    .filter((check) => check.status === 'FAIL')
    .map((check) => ({ id: check.id, severity: check.severity, detail: check.detail }));
  const reproduced = allChecks
    .filter((check) => check.status === 'OBSERVED_PROTOTYPE_DEFECT')
    .map((check) => ({ id: check.id, divergence: check.divergence.id }));
  const declared = [...divergenceIndex(contract).keys()];
  const notReproduced = declared.filter((id) => !reproduced.some((entry) => entry.id === id));
  return {
    mode: 'prototype_observed',
    question: 'did the harness measure the Prototype correctly?',
    valid: unexplained.length === 0 && notReproduced.length === 0,
    total_checks: result.summary.total_checks,
    prototype_defects_reproduced: reproduced,
    unexplained_failures: unexplained,
    declared_defects_not_observed: notReproduced,
  };
}

// PRODUCTION TARGET INTEGRITY.
//
// Proves the acceptance standard is genuinely stricter than the Prototype: every
// geometry-observable Prototype defect must actually FAIL in production_target
// mode. If one of them passed, a candidate could satisfy the standard by copying
// the defect, which is the failure mode this split exists to prevent.
export function validateProductionTargetIntegrity({ contract, captures, destinations }) {
  const result = evaluateContract({
    contract, captures: asBothSides(captures), destinations, mode: 'production_target',
  });
  const failed = new Set(Object.values(result.routes)
    .flatMap((route) => route.checks)
    .filter((check) => check.status === 'FAIL')
    .map((check) => check.id));
  const rejected = [];
  const wronglyAccepted = [];
  for (const [checkId, divergence] of divergenceIndex(contract)) {
    (failed.has(checkId) ? rejected : wronglyAccepted).push({ check_id: checkId, divergence: divergence.id });
  }
  return {
    mode: 'production_target',
    question: 'would the acceptance standard reject a candidate that copied a Prototype defect?',
    valid: wronglyAccepted.length === 0,
    prototype_routes_failing_the_production_target: result.summary.routes_failing_guardrails,
    defects_rejected_by_the_production_target: rejected,
    defects_the_production_target_would_wrongly_accept: wronglyAccepted,
  };
}
