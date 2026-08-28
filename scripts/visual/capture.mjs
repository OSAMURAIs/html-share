// Deterministic per-destination capture: navigate, settle, screenshot, extract metrics.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { metricsExpression, METRICS_SCHEMA } from './metrics.mjs';

export const CAPTURE_METADATA_SCHEMA = 'html-share.visual.capture/1';
export const MAX_FULL_CAPTURE_HEIGHT = 6000;

// Explicit per-side shell probes. Both sides are measured with named selectors
// rather than heuristics, so the numbers stay stable as either side changes.
export const SHELL_PROBES = Object.freeze({
  prototype: {
    contentFrame: null,
    globalChrome: 'aside.rail, .rail',
    rail: '.rail, .sidebar, aside.rail',
    header: '.topbar, header.topbar, header[role="banner"], body > header',
    globalNav: '.global-nav, nav.global, nav[aria-label*="global" i], header nav',
    domainNav: '.domain-nav, nav.domain, nav[aria-label*="domain" i], .subnav',
    utility: '.topbar-actions, .actions, .utility, header .actions',
    main: 'main, .v5-main, .content',
  },
  current: {
    contentFrame: '#frame',
    // At >=46.01rem this element is laid out as a 236px fixed left rail; below
    // that it is a top bar. One element, both roles.
    globalChrome: 'header.topbar',
    rail: '.rail, aside.rail',
    header: 'header.topbar',
    globalNav: '#global-nav',
    domainNav: '#domain-nav',
    utility: '.topbar-actions',
    main: 'main, .v5-main',
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function evaluate(page, expression) {
  const result = await page.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`page evaluation failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
  }
  return result.result.value;
}

function readinessExpression(side, destinationId) {
  if (side === 'current') {
    return `(() => {
      const frame = document.querySelector('#frame');
      if (!frame || frame.hidden) return false;
      const doc = frame.contentDocument;
      if (!doc || doc.readyState !== 'complete') return false;
      const meta = doc.querySelector('meta[name="html-share:destination-id"]');
      if (!meta || meta.content !== ${JSON.stringify(destinationId)}) return false;
      const main = doc.querySelector('main, .v5-main') || doc.body;
      return !!main && main.getBoundingClientRect().height > 0;
    })()`;
  }
  return `(() => {
    if (document.readyState !== 'complete') return false;
    const main = document.querySelector('main, .v5-main, .content') || document.body;
    return !!main && main.getBoundingClientRect().height > 0 && main.textContent.trim().length > 0;
  })()`;
}

async function waitFor(page, expression, { timeoutMs = 20000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await evaluate(page, expression);
    if (last) return true;
    await sleep(intervalMs);
  }
  return false;
}

async function settle(page) {
  // Fonts, then every running animation in both documents, then two animation
  // frames. Entry-reveal animations start at opacity:0, so without waiting for
  // them geometry and even element visibility would depend on capture timing.
  await evaluate(page, `(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const docs = [document];
    const frame = document.querySelector('#frame');
    if (frame && frame.contentDocument) docs.push(frame.contentDocument);
    const running = [];
    for (const doc of docs) {
      if (!doc.getAnimations) continue;
      for (const animation of doc.getAnimations()) running.push(animation.finished.catch(() => {}));
    }
    await Promise.race([
      Promise.all(running),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true;
  })()`);
}

async function setViewport(page, { width, height, mobile }) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: Boolean(mobile),
    screenWidth: width,
    screenHeight: height,
  });
}

async function screenshot(page) {
  const result = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  return Buffer.from(result.data, 'base64');
}

export async function captureDestination({
  page, browser, side, sideConfig, destination, viewport, origin, outputDir, runContext,
}) {
  const probes = SHELL_PROBES[side];
  const url = `${origin}${sideConfig.urlFor(destination)}`;
  const consoleErrors = [];
  const offConsole = page.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') consoleErrors.push((params.args ?? []).map((a) => a.description ?? a.value).join(' ').slice(0, 300));
  });

  await setViewport(page, viewport);
  await page.send('Page.navigate', { url });
  const ready = await waitFor(page, readinessExpression(side, destination.destination_id));
  if (!ready) throw new Error(`${side}/${destination.destination_id}/${viewport.name}: content never became ready at ${url}`);
  await settle(page);

  const base = `${destination.destination_id}__${side}__${viewport.width}x${viewport.height}`;
  const foldPng = await screenshot(page);
  writeFileSync(path.join(outputDir, 'captures', `${base}.png`), foldPng);

  const metrics = await evaluate(page, metricsExpression({ side, destinationId: destination.destination_id, probes }));
  if (metrics.schema !== METRICS_SCHEMA) throw new Error(`metrics schema mismatch for ${base}`);

  // Supplementary full-length capture. The outer viewport is grown so the
  // current side's flex iframe expands too, keeping both sides symmetric.
  const contentHeight = await evaluate(page, `(() => {
    const frame = document.querySelector(${JSON.stringify(probes.contentFrame ?? 'null')});
    const doc = frame && frame.contentDocument ? frame.contentDocument : document;
    const offset = frame ? frame.getBoundingClientRect().top : 0;
    return Math.ceil(doc.documentElement.scrollHeight + offset);
  })()`);
  const fullHeight = Math.max(viewport.height, Math.min(contentHeight + 16, MAX_FULL_CAPTURE_HEIGHT));
  await setViewport(page, { ...viewport, height: fullHeight });
  await settle(page);
  const fullPng = await screenshot(page);
  writeFileSync(path.join(outputDir, 'captures', `${base}__full.png`), fullPng);
  await setViewport(page, viewport);

  offConsole();

  const metadata = {
    schema: CAPTURE_METADATA_SCHEMA,
    destination_id: destination.destination_id,
    domain: destination.domain,
    side,
    viewport: {
      name: viewport.name,
      width: viewport.width,
      height: viewport.height,
      device_scale_factor: 1,
      mobile_emulation: Boolean(viewport.mobile),
      zoom: '100%',
    },
    // route_path is the stable identifier; url carries the ephemeral local port
    // and is kept only for debugging a single run.
    route_path: sideConfig.urlFor(destination),
    url,
    files: {
      fold: `captures/${base}.png`,
      full: `captures/${base}__full.png`,
      metrics: `captures/${base}.json`,
    },
    full_capture: {
      height: fullHeight,
      content_height: contentHeight,
      truncated: contentHeight + 16 > MAX_FULL_CAPTURE_HEIGHT,
    },
    browser: runContext.browser,
    tool: runContext.tool,
    repositories: runContext.repositories,
    source: sideConfig.provenance,
    presentation_asset_version: runContext.presentation_asset_version,
    captured_at: new Date().toISOString(),
    console_errors: consoleErrors.slice(0, 10),
    metrics,
  };
  writeFileSync(path.join(outputDir, 'captures', `${base}.json`), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  return metadata;
}
