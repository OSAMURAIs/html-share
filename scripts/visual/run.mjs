#!/usr/bin/env node
// V0 visual acceptance harness — one-command entrypoint.
//
//   npm run visual
//
// Captures every destination on both sides at both viewports, extracts computed
// geometry, evaluates the route geometry contract, and writes a review gallery.
// Purely local: no production URL, no AWS call, no publish step.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChrome } from './cdp.mjs';
import { startServer } from './server.mjs';
import { DESTINATIONS, VIEWPORTS, currentSide, prototypeSide } from './build-sides.mjs';
import { captureDestination } from './capture.mjs';
import { writeComparisonSheets } from './compare.mjs';
import { evaluateContract, validateProductionTargetIntegrity, validatePrototypeObservation } from './check.mjs';

export const RUN_SCHEMA = 'html-share.visual.run/1';
export const TOOL_VERSION = 'html-share-visual-harness/1.0.0';
const SIDES = Object.freeze(['prototype', 'current']);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function gitCommit(root) {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export async function run({
  outputDir = path.join(repoRoot, '.html-share/visual/latest'),
  workDir = path.join(repoRoot, '.html-share/visual/work'),
  only = null,
} = {}) {
  const destinations = only ? DESTINATIONS.filter((d) => only.includes(d.destination_id)) : DESTINATIONS;
  rmSync(outputDir, { recursive: true, force: true });
  for (const sub of ['captures', 'comparisons', 'acceptance']) mkdirSync(path.join(outputDir, sub), { recursive: true });

  const contract = JSON.parse(readFileSync(path.join(repoRoot, 'visual/route-geometry.contract.json'), 'utf8'));
  const sideConfigs = {
    prototype: prototypeSide({}),
    current: currentSide({ repoRoot, workDir }),
  };

  const browser = await launchChrome();
  const runContext = {
    browser: {
      product: browser.version.Browser,
      user_agent: browser.version['User-Agent'],
      protocol_version: browser.version['Protocol-Version'],
      executable: browser.executable,
      headless: 'new',
      zoom: '100%',
      device_scale_factor: 1,
    },
    tool: { name: TOOL_VERSION, node: process.version, platform: process.platform },
    repositories: {
      'html-share': gitCommit(repoRoot),
      'html-share-hub': sideConfigs.current.provenance.hub_commit,
    },
    presentation_asset_version: sideConfigs.current.provenance.presentation,
  };

  const servers = {};
  const captures = [];
  try {
    for (const side of SIDES) {
      servers[side] = await startServer(sideConfigs[side].routes);
      const page = await browser.newPage();
      await page.send('Page.enable');
      await page.send('Runtime.enable');
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
      try {
        for (const destination of destinations) {
          for (const viewport of VIEWPORTS) {
            process.stdout.write(`  ${side.padEnd(9)} ${destination.destination_id.padEnd(28)} ${viewport.name}\n`);
            captures.push(await captureDestination({
              page,
              browser,
              side,
              sideConfig: sideConfigs[side],
              destination,
              viewport,
              origin: servers[side].origin,
              outputDir,
              runContext,
            }));
          }
        }
      } finally {
        await browser.closePage(page);
      }
    }
  } finally {
    await browser.close();
    for (const server of Object.values(servers)) await server.close();
  }

  // Candidates are graded against the production target: Prototype v5 plus the
  // explicit production deltas the final handoff requires.
  const acceptance = evaluateContract({ contract, captures, destinations, mode: 'production_target' });

  // Two separate concerns, checked separately on every run.
  //  1. Did the harness measure the Prototype correctly?
  //  2. Is the production target genuinely stricter than the Prototype, so that a
  //     candidate cannot pass by copying a recorded Prototype defect?
  const prototypeObservation = validatePrototypeObservation({ contract, captures, destinations });
  const productionTargetIntegrity = validateProductionTargetIntegrity({ contract, captures, destinations });

  writeFileSync(path.join(outputDir, 'acceptance/guardrails.json'), `${JSON.stringify(acceptance, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(outputDir, 'acceptance/prototype-observation.json'),
    `${JSON.stringify({ prototypeObservation, productionTargetIntegrity }, null, 2)}\n`, 'utf8');
  writeComparisonSheets({ outputDir, captures, destinations, acceptance, runContext });

  const runRecord = {
    schema: RUN_SCHEMA,
    generated_at: new Date().toISOString(),
    context: runContext,
    sides: Object.fromEntries(SIDES.map((side) => [side, sideConfigs[side].provenance])),
    expected: {
      destinations: destinations.length,
      viewports: VIEWPORTS.length,
      sides: SIDES.length,
      raw_captures: destinations.length * VIEWPORTS.length * SIDES.length,
      comparison_sheets: destinations.length,
    },
    actual: {
      raw_captures: captures.length,
      comparison_sheets: destinations.length,
    },
    captures: captures.map((capture) => ({
      destination_id: capture.destination_id,
      side: capture.side,
      viewport: capture.viewport.name,
      files: capture.files,
    })),
    prototype_observation: prototypeObservation,
    production_target_integrity: productionTargetIntegrity,
    acceptance_summary: acceptance.summary,
  };
  writeFileSync(path.join(outputDir, 'run.json'), `${JSON.stringify(runRecord, null, 2)}\n`, 'utf8');
  return runRecord;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const only = argValue('--only', null);
  run({
    outputDir: path.resolve(argValue('--out', path.join(repoRoot, '.html-share/visual/latest'))),
    only: only ? only.split(',').map((value) => value.trim()) : null,
  }).then((record) => {
    console.log(`\n${record.actual.raw_captures}/${record.expected.raw_captures} raw captures, `
      + `${record.actual.comparison_sheets} comparison sheets`);
    console.log(JSON.stringify(record.acceptance_summary, null, 2));
    let ok = true;
    if (!record.prototype_observation.valid) {
      console.error('\nPROTOTYPE OBSERVATION FAILED — the harness did not measure the Prototype as the contract describes:');
      console.error(JSON.stringify(record.prototype_observation, null, 2));
      ok = false;
    } else {
      console.log(`prototype observation: OK (${record.prototype_observation.prototype_defects_reproduced.length} recorded Prototype defects reproduced)`);
    }
    if (!record.production_target_integrity.valid) {
      console.error('\nPRODUCTION TARGET INTEGRITY FAILED — a candidate could pass by copying a Prototype defect:');
      console.error(JSON.stringify(record.production_target_integrity, null, 2));
      ok = false;
    } else {
      console.log(`production target integrity: OK (${record.production_target_integrity.defects_rejected_by_the_production_target.length} Prototype defects rejected by the target)`);
    }
    if (!ok) process.exit(1);
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
