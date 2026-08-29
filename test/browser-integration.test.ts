import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');

function loadBrowserModule(relative: string, extra: Record<string, unknown> = {}) {
  const windowObject: Record<string, unknown> = {};
  vm.runInNewContext(readFileSync(path.join(root, relative), 'utf8'), {
    URL,
    location: { href: 'https://share.example.com/app/index.html' },
    window: windowObject,
    ...extra,
  });
  return windowObject;
}

test('Manifest v2 is primary, v1 only enriches href/token, and aliases resolve to destination_id', () => {
  const manifest = loadBrowserModule('web/app/manifest.js');
  const api = manifest.HtmlShareManifest as any;
  const v2 = {
    schema_version: 2,
    generated_at: '2026-08-26T00:00:00.000Z',
    presentation: { contract: 'html-share-v5', version: '1', asset_base: '/assets/v5/1', assets: ['/assets/v5/1/presentation.css', '/assets/v5/1/presentation.js'] },
    pages: [{
      destination_id: 'research.overview', canonical_route: '/app/index.html#/research/overview',
      legacy_aliases: ['research-pulse'], labels: { primary: 'Overview', navigation: 'Overview' },
      updated_at: '2026-08-26T00:00:00.000Z', content_id: `sha256:${'a'.repeat(64)}`, object_key: 'pages/research-pulse/index.html',
      access: { audience: 'owner', share_policy: 'owner_only' }, search: { title: 'Overview', terms: [] },
      navigation: { section: 'research', order: 100 },
      presentation: { contract: 'html-share-v5', version: '1' }, href: null, domain: 'research', artifact_class: 'canonical_static_page',
    }],
  };
  const v1 = { generatedAt: 'old', pages: [{ slug: 'research-pulse', title: 'Old', href: 'https://content.example/signed', objectKey: 'pages/research-pulse/index.html', navigationToken: 'token' }] };
  const loaded = api.normalizeManifests(v2, v1);
  assert.equal(api.validV2(v2), true);
  assert.equal(api.validV2({ ...v2, pages: [{ ...v2.pages[0], content_id: 'not-a-content-id' }] }), false);
  assert.equal(loaded.source, 'v2');
  assert.equal(loaded.pages[0].destination_id, 'research.overview');
  assert.equal(loaded.pages[0].href, 'https://content.example/signed');
  assert.equal(loaded.pages[0].navigationToken, 'token');
  const fallback = api.normalizeManifests(null, v1);
  assert.equal(fallback.source, 'v1');
  assert.equal(fallback.pages[0].destination_id, 'research.overview');
});

test('validV2 accepts any internally-coherent presentation profile, not only "1"', () => {
  // Historical defect: validV2 hardcoded presentation.version === '1' and the
  // exact profile-1 asset list, so a candidate profile-2 manifest failed
  // validation wholesale — every route silently fell back to the legacy v1
  // manifest, and any destination absent from LEGACY_DESTINATIONS (e.g.
  // investment.dashboard, which has no legacy slug mapping) resolved to
  // nothing and the shell fell back to Home. Discovered when the V1 visual
  // harness could never navigate to investment.dashboard under profile 2.
  const manifest = loadBrowserModule('web/app/manifest.js');
  const api = manifest.HtmlShareManifest as any;
  const v2ProfileTwo = {
    schema_version: 2,
    generated_at: '2026-08-26T00:00:00.000Z',
    presentation: {
      contract: 'html-share-v5', version: '2', asset_base: '/assets/v5/2',
      assets: ['/assets/v5/2/tokens.css', '/assets/v5/2/primitives.css', '/assets/v5/2/shell.css', '/assets/v5/2/motion.css', '/assets/v5/2/presentation.js'],
    },
    pages: [{
      destination_id: 'investment.dashboard', canonical_route: '/app/index.html#/investment/dashboard',
      legacy_aliases: [], labels: { primary: 'Investment Dashboard', navigation: 'Investment Dashboard' },
      updated_at: '2026-08-26T00:00:00.000Z', content_id: `sha256:${'a'.repeat(64)}`, object_key: 'pages/investment-dashboard/index.html',
      access: { audience: 'owner', share_policy: 'owner_only' }, search: { title: 'Investment Dashboard', terms: [] },
      navigation: { section: 'investment', order: 300 },
      presentation: { contract: 'html-share-v5', version: '2' }, href: '/content/pages/investment-dashboard/index.html',
      domain: 'investment', artifact_class: 'canonical_static_page',
    }],
  };
  assert.equal(api.validV2(v2ProfileTwo), true, 'a candidate profile-2 manifest must validate, not only profile 1');
  const loaded = api.normalizeManifests(v2ProfileTwo, null);
  assert.equal(loaded.source, 'v2');
  assert.equal(loaded.pages[0].destination_id, 'investment.dashboard');
  assert.equal(loaded.pages[0].href, '/content/pages/investment-dashboard/index.html');

  // A page naming a DIFFERENT version than the manifest's own profile is
  // still rejected — this checks structural coherence, not merely "some
  // string is present".
  assert.equal(
    api.validV2({ ...v2ProfileTwo, pages: [{ ...v2ProfileTwo.pages[0], presentation: { contract: 'html-share-v5', version: '1' } }] }),
    false,
    'a page declaring a different profile than the manifest itself must still fail',
  );
  // An asset outside the declared asset_base is still rejected.
  assert.equal(
    api.validV2({ ...v2ProfileTwo, presentation: { ...v2ProfileTwo.presentation, assets: ['/assets/v5/1/presentation.css'] } }),
    false,
    'an asset outside the declared asset_base must still fail',
  );
});

test('destination-first browser state migration is explicit, idempotent, and failure-safe', () => {
  const browserState = loadBrowserModule('web/app/browser-state.js').HtmlShareBrowserState as any;
  const values = new Map<string, string>([
    ['mb_starred_pages', JSON.stringify(['research-pulse', 'pages/research-pulse/index.html'])],
    ['mb_hidden_pages', JSON.stringify(['knowledge-review'])],
    ['mb_read_marks', JSON.stringify({ 'research-pulse': '2026-08-25T00:00:00.000Z' })],
    ['mb_recent_pages', JSON.stringify(['research-pulse'])],
  ]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  const pages = [
    { destination_id: 'research.overview', slug: 'research-pulse', objectKey: 'pages/research-pulse/index.html', legacy_aliases: ['research-pulse'] },
    { destination_id: 'research.knowledge-review', slug: 'knowledge-review', objectKey: 'pages/knowledge-review/index.html', legacy_aliases: ['knowledge-review'] },
  ];
  const migrated = browserState.migrate(storage, pages);
  assert.equal(JSON.stringify(migrated.favorites), JSON.stringify(['research.overview']));
  assert.equal(JSON.stringify(migrated.hidden), JSON.stringify(['research.knowledge-review']));
  assert.equal(JSON.stringify(Object.keys(migrated.readMarks)), JSON.stringify(['research.overview']));
  assert.equal(JSON.stringify(migrated.recent), JSON.stringify(['research.overview']));
  assert.equal(JSON.stringify(browserState.migrate(storage, pages)), JSON.stringify(migrated));
  assert.ok(values.has('mb_starred_pages'), 'legacy state is retained for recovery');

  const failingValues = new Map(values);
  failingValues.delete(browserState.KEY);
  const failingStorage = {
    getItem: (key: string) => failingValues.get(key) ?? null,
    setItem: (key: string, value: string) => { if (key.endsWith('.pending')) throw new Error('quota'); failingValues.set(key, value); },
    removeItem: (key: string) => failingValues.delete(key),
  };
  assert.throws(() => browserState.migrate(failingStorage, pages), /quota/);
  assert.equal(failingValues.get('mb_starred_pages'), values.get('mb_starred_pages'));
  assert.equal(failingValues.has(`${browserState.KEY}.pending`), false);

  const writeValues = new Map<string, string>();
  const writeStorage = {
    getItem: (key: string) => writeValues.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (key === browserState.KEY) throw new Error('commit failed');
      writeValues.set(key, value);
    },
    removeItem: (key: string) => writeValues.delete(key),
  };
  assert.throws(() => browserState.write(writeStorage, browserState.emptyState()), /commit failed/);
  assert.equal(writeValues.has(`${browserState.KEY}.pending`), false);
});

test('bounded Live Work parser accepts only the v1 summary element and safe freshness states', () => {
  const api = loadBrowserModule('web/app/live-work.js').HtmlShareLiveWork as any;
  const valid = { schema_version: 1, freshness: 'current', source_updated_at: '2026-08-26T00:00:00Z', active_count: 1, active: [{ title: 'Task', repository: 'repo', agent: 'codex', status: 'testing', current: 'verify', next: 'report', updated_at: '2026-08-26T00:00:00Z' }] };
  const documentObject = { querySelector: (selector: string) => selector.includes('html-share-live-work-public-summary-v1') ? { textContent: JSON.stringify(valid) } : null };
  assert.equal(JSON.stringify(api.parse(documentObject)), JSON.stringify(valid));
  assert.equal(api.parse({ querySelector: () => ({ textContent: JSON.stringify({ ...valid, freshness: 'stale', active_count: 1, active: [] }) }) }), null);
  assert.equal(api.parse({ querySelector: () => ({ textContent: JSON.stringify({ ...valid, freshness: 'unknown', active_count: 0, active: [] }) }) }).freshness, 'unknown');
  const source = readFileSync(path.join(root, 'web/app/live-work.js'), 'utf8');
  assert.doesNotMatch(source, /registry|process/i);
});
