#!/usr/bin/env node
// Reproducibility check: compares two harness runs and reports whether the route
// set, viewport set, metric schema, comparison mapping and computed geometry are
// stable. Explicit timestamps are expected to differ and are excluded.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const VOLATILE = new Set(['captured_at', 'generated_at', 'executable', 'build_root', 'hub_root', 'prototype_root']);

function stripVolatile(value) {
  if (typeof value === 'string') {
    // The local server binds an ephemeral port, so the origin differs by design.
    // route_path carries the stable identity.
    return value.replace(/^http:\/\/127\.0\.0\.1:\d+/, 'http://127.0.0.1');
  }
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !VOLATILE.has(key))
      .map(([key, entry]) => [key, stripVolatile(entry)]));
  }
  return value;
}

function load(dir) {
  const captureDir = path.join(dir, 'captures');
  const files = readdirSync(captureDir).filter((file) => file.endsWith('.json')).sort();
  return {
    run: JSON.parse(readFileSync(path.join(dir, 'run.json'), 'utf8')),
    guardrails: JSON.parse(readFileSync(path.join(dir, 'acceptance/guardrails.json'), 'utf8')),
    comparisons: readdirSync(path.join(dir, 'comparisons')).sort(),
    captureFiles: files,
    pngFiles: readdirSync(captureDir).filter((file) => file.endsWith('.png')).sort(),
    captures: Object.fromEntries(files.map((file) => [file, JSON.parse(readFileSync(path.join(captureDir, file), 'utf8'))])),
  };
}

const [a, b] = [process.argv[2], process.argv[3]].map(load);
const differences = [];
const check = (label, left, right) => {
  const same = JSON.stringify(left) === JSON.stringify(right);
  if (!same) differences.push({ label, run1: left, run2: right });
  return same;
};

check('route set', a.run.captures.map((c) => c.destination_id).sort(), b.run.captures.map((c) => c.destination_id).sort());
check('viewport set', [...new Set(a.run.captures.map((c) => c.viewport))].sort(), [...new Set(b.run.captures.map((c) => c.viewport))].sort());
check('capture inventory order', a.run.captures, b.run.captures);
check('capture file names', a.captureFiles, b.captureFiles);
check('screenshot file names', a.pngFiles, b.pngFiles);
check('comparison sheet mapping', a.comparisons, b.comparisons);
check('metric schema', a.run.schema, b.run.schema);
check('contract self-validation', a.run.contract_self_validation, b.run.contract_self_validation);
check('acceptance summary', a.run.acceptance_summary, b.run.acceptance_summary);

const unstableMetrics = [];
for (const file of a.captureFiles) {
  const left = stripVolatile(a.captures[file]);
  const right = stripVolatile(b.captures[file]);
  if (JSON.stringify(left) !== JSON.stringify(right)) unstableMetrics.push(file);
}
if (unstableMetrics.length) differences.push({ label: 'computed metrics', unstable: unstableMetrics });

const deterministic = differences.length === 0;
console.log(JSON.stringify({
  run1: process.argv[2],
  run2: process.argv[3],
  routes: a.run.captures.length / 2 / 2,
  raw_captures: a.run.actual.raw_captures,
  comparison_sheets: a.run.actual.comparison_sheets,
  metrics_files_compared: a.captureFiles.length,
  deterministic,
  differences,
}, null, 2));
process.exit(deterministic ? 0 : 1);
