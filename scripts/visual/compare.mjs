// Generates the per-route comparison sheets and the review gallery.
// Output is a generated artifact under .html-share/ and is not committed.
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const escape = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = `
:root { color-scheme: light; --line:#d8dde5; --ink:#15171c; --mut:#5d6470; --bad:#b4232a; --ok:#1d6b3f; --warn:#8a5a00; }
* { box-sizing: border-box; }
body { margin:0; padding:28px; font:15px/1.6 system-ui,"Segoe UI",sans-serif; color:var(--ink); background:#f4f6f9; }
h1 { font-size:22px; margin:0 0 4px; }
h2 { font-size:16px; margin:32px 0 10px; padding-bottom:6px; border-bottom:1px solid var(--line); }
.meta { color:var(--mut); font-size:13px; margin:0 0 20px; }
.grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
figure { margin:0; background:#fff; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
figcaption { padding:8px 12px; font-size:13px; font-weight:600; background:#eef1f6; border-bottom:1px solid var(--line); }
figcaption .side { color:var(--mut); font-weight:400; }
figure img { display:block; width:100%; height:auto; background:#fff; }
.scroll { max-height:720px; overflow-y:auto; }
table { border-collapse:collapse; width:100%; background:#fff; font-size:13px; }
th,td { border:1px solid var(--line); padding:6px 9px; text-align:left; vertical-align:top; }
th { background:#eef1f6; }
td.PASS { color:var(--ok); font-weight:600; }
td.FAIL { color:var(--bad); font-weight:600; }
td.SKIP { color:var(--mut); }
pre { margin:0; font:12px/1.5 ui-monospace,Consolas,monospace; white-space:pre-wrap; word-break:break-word; color:var(--mut); }
.verdict { background:#fff; border:2px solid var(--line); border-radius:8px; padding:14px 16px; margin:22px 0; }
.verdict b { display:block; margin-bottom:6px; }
.verdict ul { margin:6px 0 0; padding-left:20px; color:var(--mut); font-size:13px; }
nav a { display:block; padding:6px 0; }
`;

const REVIEW_QUESTION = 'Would a user seeing both identify the current candidate as the production version of Prototype v5?';
const VERDICTS = ['CLOSE', 'PARTIAL', 'MATERIAL GAP', 'FUNDAMENTALLY DIFFERENT'];

function figure(label, side, file) {
  return `<figure><figcaption>${escape(label)} <span class="side">— ${escape(side)}</span></figcaption>`
    + `<div class="scroll"><img src="../${escape(file)}" alt="${escape(`${label} ${side}`)}"></div></figure>`;
}

function checksTable(route) {
  const rows = route.checks.map((check) => `<tr>`
    + `<td class="${check.status}">${check.status}</td>`
    + `<td>${escape(check.severity ?? '')}</td>`
    + `<td>${escape(check.title)}</td>`
    + `<td><pre>${escape(JSON.stringify(check.detail))}</pre></td>`
    + `</tr>`).join('\n');
  return `<table><thead><tr><th>Status</th><th>Severity</th><th>Check</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function writeComparisonSheets({ outputDir, captures, destinations, acceptance, runContext }) {
  const index = new Map();
  for (const capture of captures) index.set(`${capture.destination_id}|${capture.side}|${capture.viewport.name}`, capture);

  for (const destination of destinations) {
    const id = destination.destination_id;
    const route = acceptance.routes[id];
    const get = (side, viewport) => index.get(`${id}|${side}|${viewport}`);
    const pair = (viewport, key) => {
      const prototype = get('prototype', viewport);
      const current = get('current', viewport);
      const label = `${viewport === 'desktop' ? 'Desktop 1280×900' : 'Mobile 390×844'}`;
      return [
        prototype ? figure(label, 'Prototype v5 (authority)', prototype.files[key]) : '<figure><figcaption>missing</figcaption></figure>',
        current ? figure(label, 'Current candidate', current.files[key]) : '<figure><figcaption>missing</figcaption></figure>',
      ].join('\n');
    };

    const html = `<!doctype html><meta charset="utf-8">
<title>${escape(id)} — visual comparison</title>
<style>${STYLE}</style>
<h1>${escape(id)} — ${escape(route?.label ?? '')}</h1>
<p class="meta">Domain grammar: ${escape(route?.domain_grammar ?? 'n/a')}<br>
Chrome ${escape(runContext.browser.product)} · zoom ${escape(runContext.browser.zoom)} · dsf ${runContext.browser.device_scale_factor}<br>
html-share ${escape(String(runContext.repositories['html-share']).slice(0, 12))} ·
html-share-hub ${escape(String(runContext.repositories['html-share-hub']).slice(0, 12))}</p>

<div class="verdict">
  <b>Context-free review question</b>
  ${escape(REVIEW_QUESTION)}
  <ul><li>Allowed verdicts: ${VERDICTS.join(' · ')}</li>
  <li>The left column is the design authority. The right column is the candidate.</li>
  <li>Page text differs by design: the candidate renders sanitized fixture content. Judge presentation, not wording.</li></ul>
</div>

<h2>Required captures — first fold at the specified viewport</h2>
<div class="grid">
${pair('desktop', 'fold')}
${pair('mobile', 'fold')}
</div>

<h2>Supplementary captures — full page length</h2>
<div class="grid">
${pair('desktop', 'full')}
${pair('mobile', 'full')}
</div>

<h2>Geometry guardrails — ${escape(route?.guardrail_status ?? 'n/a')}
 (${route?.counts.fail ?? 0} failing / ${route?.checks.length ?? 0} checks)</h2>
${route ? checksTable(route) : '<p>No contract entry.</p>'}
`;
    writeFileSync(path.join(outputDir, 'comparisons', `${id}.html`), html, 'utf8');
  }

  const rows = destinations.map((destination) => {
    const route = acceptance.routes[destination.destination_id];
    return `<tr><td><a href="${escape(destination.destination_id)}.html">${escape(destination.destination_id)}</a></td>`
      + `<td class="${route?.guardrail_status ?? 'SKIP'}">${escape(route?.guardrail_status ?? 'n/a')}</td>`
      + `<td>${route?.counts.critical ?? 0}</td><td>${route?.counts.major ?? 0}</td><td>${route?.counts.minor ?? 0}</td>`
      + `<td>${route?.checks.length ?? 0}</td></tr>`;
  }).join('\n');

  writeFileSync(path.join(outputDir, 'comparisons', 'index.html'), `<!doctype html><meta charset="utf-8">
<title>V0 visual acceptance gallery</title><style>${STYLE}</style>
<h1>V0 visual acceptance gallery</h1>
<p class="meta">${destinations.length} destinations × 2 viewports × 2 sides.
Chrome ${escape(runContext.browser.product)}.</p>
<table><thead><tr><th>Destination</th><th>Guardrails</th><th>Critical</th><th>Major</th><th>Minor</th><th>Checks</th></tr></thead>
<tbody>${rows}</tbody></table>`, 'utf8');

  const packet = [
    '# V0 context-free visual review packet',
    '',
    `Question for every route: **${REVIEW_QUESTION}**`,
    '',
    `Allowed verdicts: ${VERDICTS.join(' | ')}`,
    '',
    'The left column of each sheet is Prototype v5 (the design authority).',
    'The right column is the current candidate. Page wording differs by design —',
    'the candidate renders sanitized fixture content. Judge presentation only.',
    '',
    '| Destination | Comparison sheet |',
    '| --- | --- |',
    ...destinations.map((destination) => `| ${destination.destination_id} | comparisons/${destination.destination_id}.html |`),
    '',
  ].join('\n');
  writeFileSync(path.join(outputDir, 'acceptance', 'review-packet.md'), packet, 'utf8');
}
