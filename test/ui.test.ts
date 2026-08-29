import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

test('ships the full dashboard UI and inbox wording', () => {
  const dashboard = readFileSync(path.join(root, 'web', 'app', 'index.html'), 'utf8');
  const review = readFileSync(path.join(root, 'web', 'review', 'index.html'), 'utf8');
  const list = readFileSync(path.join(root, 'web', 'page-list.js'), 'utf8');
  const shell = readFileSync(path.join(root, 'web', 'mobile-page-shell.js'), 'utf8');

  assert.match(dashboard, /HTML共有くん/);
  assert.match(dashboard, /インボックス/);
  assert.match(dashboard, /未読に戻す/);
  assert.match(dashboard, /groupByStream/);
  assert.match(dashboard, /削除済み/);
  assert.match(dashboard, /api\/owner\/shares/);
  assert.match(list, /function markUnread/);
  assert.match(list, /v: null/);
  assert.match(shell, /class="action star-action"/);
  assert.match(shell, /class="action unread-action"/);
  assert.match(review, /Claudeへの依頼/);
  assert.match(review, /\/inbox/);
  assert.match(review, /PCへ渡す依頼はありません/);
  assert.match(review, /id="compose-target" type="text"/);
  assert.doesNotMatch(review, /<select[^>]*id="compose-target"/);
  assert.match(review, /id="target-list"/);
  assert.match(review, /function renderTargetOptions/);
  assert.match(review, /JSON\.stringify\(\{ question: text, target \}\)/);
  assert.match(review, /targetField\.value = '';/);
  assert.match(dashboard, /id="review-dot"/);
  assert.match(dashboard, /function refreshInboxDot/);
  assert.match(dashboard, /\/api\/owner\/reviews/);
  assert.match(dashboard, /HtmlShareNavigation\.navigationSlug/);
  assert.match(dashboard, /HtmlShareNavigation\.externalUrl/);
  assert.match(dashboard, /HtmlShareManifest\.load/);
  assert.match(dashboard, /HtmlShareBrowserState\.migrate/);
  assert.match(dashboard, /HtmlShareLiveWork\.read/);
  assert.match(dashboard, /data-domain="research"/);
  assert.match(dashboard, /data-operational="true"/);
  assert.match(dashboard, /page-native-share/);
  assert.match(dashboard, /Signed content is cross-origin and CSP-sandboxed/);
  assert.match(dashboard, /function pageRoute\(page\)/);
  assert.match(dashboard, /location\.hash = pageRoute\(page\);/);
  assert.match(dashboard, /navigator\.share\(data\)/);
  assert.match(dashboard, /error\?\.name === 'AbortError'/);
  assert.match(dashboard, /navigator\.clipboard\.writeText\(url\)/);
  assert.match(dashboard, /addEventListener\('pageshow', \(event\) => \{ if \(event\.persisted\)/);
  assert.match(dashboard, /addEventListener\('visibilitychange'/);
  assert.match(dashboard, /Date\.now\(\) - lastRefreshAt < 30000/);
  assert.match(dashboard, /prefers-reduced-motion/);
  assert.doesNotMatch(dashboard, /const isNarrow/);
  assert.doesNotMatch(dashboard, /location\.href = new URL\(page\.href/);
});

test('R5 uses canonical Home as the primary surface and keeps the legacy browser as a utility', () => {
  const dashboard = readFileSync(path.join(root, 'web', 'app', 'index.html'), 'utf8');
  assert.match(dashboard, /data-destination-id="home">Home/);
  assert.match(dashboard, /data-domain="research">Research/);
  assert.match(dashboard, /data-domain="personal">暮らし/);
  assert.match(dashboard, /data-domain="investment">Investment/);
  assert.match(dashboard, /<nav class="operational-nav" id="operational-nav" aria-label="運用アクセス">[\s\S]*data-operational="true">Live Work/);
  assert.match(dashboard, /id="browser-toggle"/);
  assert.match(dashboard, /const destinationId = resolved \|\| .*'home'/);
  assert.match(dashboard, /current\.destination_id !== 'home'/);
  assert.match(dashboard, /DOMAIN_NAV_LABELS/);
  assert.match(dashboard, /searchToggle\.focus\(\)/);
  assert.match(dashboard, /@media \(min-width: 46\.01rem\)/);
  assert.match(dashboard, /@media \(max-width: 46rem\)/);
  assert.match(dashboard, /prefers-reduced-motion/);
});

test('the mobile compact-nav shell reconstruction activates only under a confirmed candidate profile 2 manifest', () => {
  // The browser shell (web/app/index.html) is never versioned by presentation
  // profile — it is the same file for every route regardless of which
  // content profile is active. A shell CSS change that applies unconditionally
  // would reach every user the moment this branch merges, not only once a
  // controlled profile-2 activation happens. The three-row mobile nav stack
  // is exactly the shape production shipped before V1; the compact one-row
  // reconstruction must stay behind an explicit, manifest-confirmed signal.
  const dashboard = readFileSync(path.join(root, 'web', 'app', 'index.html'), 'utf8');
  assert.match(
    dashboard,
    /@media \(max-width: 700px\) \{ \.global-nav \{ order: 3; flex-basis: 100%; \} \.operational-nav \{ order: 4; flex-basis: 100%;/,
    'the exact prior three-row rule must be present, unconditional, and unchanged — this is what profile 1 renders',
  );
  assert.match(
    dashboard,
    /html\[data-html-share-shell-profile="2"\] \.topbar-inner \{ flex-wrap: wrap;/,
    'the compact one-row reconstruction must be scoped behind the shell-profile attribute selector',
  );
  // The attribute is set only from a manifest actually resolved by the boot
  // script — never a default, never ambient, never true before that load
  // completes — and is removed outright when the loaded manifest carries no
  // presentation version (the v1 legacy-manifest fallback path).
  assert.match(dashboard, /const shellProfile = loaded\.manifest\?\.presentation\?\.version;/);
  assert.match(dashboard, /if \(shellProfile\) document\.documentElement\.dataset\.htmlShareShellProfile = shellProfile;/);
  assert.match(dashboard, /else delete document\.documentElement\.dataset\.htmlShareShellProfile;/);
});

test('content frame is swapped, not re-navigated in place, so one destination change stays one history entry', () => {
  // Reassigning `frame.src`/`frame.removeAttribute('src')` on the same persistent
  // <iframe> makes the browser record the subframe's own navigation in the joint
  // session history, on top of the shell's own `location.hash` push — one click
  // then produces two entries and Back appears to do nothing the first time.
  // Recreating the element makes every content navigation look like that fresh
  // frame's first load, which browsers never add to joint session history.
  const dashboard = readFileSync(path.join(root, 'web', 'app', 'index.html'), 'utf8');
  assert.match(dashboard, /let frame = \$\('frame'\);/);
  assert.match(dashboard, /function swapFrame\(\{ hidden, url \}\)/);
  assert.match(dashboard, /frame\.replaceWith\(fresh\);/);
  assert.match(dashboard, /if \(loadedDestinationId !== current\.destination_id\) \{\s*\n\s*swapFrame\(\{ hidden: false, url: current\.href \}\);/);
  assert.match(dashboard, /if \(loadedDestinationId !== null\) swapFrame\(\{ hidden: true, url: null \}\);/);
  // The old direct-reassignment shape must not come back: it is the exact
  // pattern that created the extra, unwanted history entry.
  assert.doesNotMatch(dashboard, /frame\.src = current\.href;/);
  assert.doesNotMatch(dashboard, /frame\.removeAttribute\('src'\);/);
});

test('folds overflowing tables on the viewing origin without network access', () => {
  const tables = readFileSync(path.join(root, 'web', 'mobile-tables.js'), 'utf8');
  const handler = readFileSync(path.join(root, 'functions', 'review-handler.ts'), 'utf8');
  assert.match(tables, /data-mb-tables="off"/);
  assert.doesNotMatch(tables, /\bfetch\s*\(/);
  assert.doesNotMatch(tables, /XMLHttpRequest/);
  assert.match(handler, /target: clean\(body\.target, 'target', 60\)/);
  assert.doesNotMatch(handler, /target: clean\(body\.target[\s\S]{0,80}device/);
});

test('does not ship the discarded simplified dashboard files', () => {
  for (const file of ['app.css', 'app.js', 'review.html', 'review.js']) {
    assert.throws(() => readFileSync(path.join(root, 'web', 'app', file), 'utf8'));
  }
});
