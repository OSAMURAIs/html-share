import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { buildOnly } from '../src/publish.js';
import {
  ARTIFACT_CLASSES,
  LEGACY_ALIASES,
  V5_DESTINATIONS,
  V5_PRESENTATION,
  resolveDestination,
  targetV5ArtifactFixture,
  validateManifestV2,
  validateTargetV5Topology,
} from '../src/v5-contract.js';
import type { HtmlShareConfig } from '../src/config.js';

test('v5 destination IDs, topology counts, routes, and aliases are stable and explicit', () => {
  assert.equal(new Set(V5_DESTINATIONS.map((item) => item.destination_id)).size, 15);
  assert.equal(V5_DESTINATIONS.filter((item) => item.artifact_class === ARTIFACT_CLASSES.canonical).length, 14);
  assert.equal(V5_DESTINATIONS.filter((item) => item.artifact_class === ARTIFACT_CLASSES.operational).length, 1);
  validateTargetV5Topology(targetV5ArtifactFixture());
  for (const item of V5_DESTINATIONS) {
    assert.equal(resolveDestination(item.canonical_route)?.destination_id, item.destination_id);
  }
  for (const [alias, destinationId] of Object.entries(LEGACY_ALIASES)) {
    assert.equal(resolveDestination(alias)?.destination_id, destinationId);
    assert.equal(resolveDestination(`/app/index.html#/${alias}`)?.destination_id, destinationId);
  }
  assert.equal(resolveDestination('home')?.destination_id, 'home');
  assert.equal(resolveDestination('investment.dashboard')?.destination_id, 'investment.dashboard');
  assert.equal(Object.values(LEGACY_ALIASES).includes('home'), false);
  assert.equal(Object.values(LEGACY_ALIASES).includes('investment.dashboard'), false);
  const overview = resolveDestination('research.overview')!;
  assert.notEqual(overview.destination_id, overview.canonical_route);
});

test('aliases/assets/shell cannot satisfy missing or duplicate canonical destinations', () => {
  const fixture = targetV5ArtifactFixture();
  const withoutHome = fixture.filter((item) => item.destination_id !== 'home');
  withoutHome.push({ path: '/compat/fake-home', artifact_class: ARTIFACT_CLASSES.alias, alias_for: 'home' });
  assert.throws(() => validateTargetV5Topology(withoutHome), /exactly 14 canonical/);
  const duplicate = [...fixture, { path: '/duplicate-home', artifact_class: ARTIFACT_CLASSES.canonical, destination_id: 'home' }];
  assert.throws(() => validateTargetV5Topology(duplicate), /duplicate\/missing canonical/);
});

function config(root: string): HtmlShareConfig {
  return {
    ownerEmail: 'owner@example.com',
    aws: {
      region: 'ap-northeast-1', consoleDomain: 'console.example.com', contentDomain: 'content.example.com',
      certificateArn: 'arn:aws:acm:us-east-1:111122223333:certificate/00000000-0000-4000-8000-000000000000',
      cognitoDomainPrefix: 'test', publicKeyPath: 'public.pem', privateKeyPath: 'private.pem', privateKeyParameterName: 'test-key',
    },
    content: {
      roots: [root], pages: [{ path: 'research-pulse.html', slug: 'research-pulse', sharePolicy: 'owner_only' }],
      ownerLinkDays: 30, maximumShareDays: 30, maximumAssetBytes: 1024, allowedInternalCidrs: [],
    },
    configFile: path.join(root, 'html-share.config.yaml'), baseDir: root,
  };
}

const v5Html = (assets = true) => `<!doctype html><html><head><title>Overview</title>
<meta name="html-share:destination-id" content="research.overview">
<meta name="html-share:domain" content="research">
<meta name="html-share:artifact-class" content="canonical_static_page">
<meta name="html-share:content-id" content="sha256:${'a'.repeat(64)}">
<meta name="html-share:presentation-contract" content="html-share-v5">
<meta name="html-share:presentation-version" content="1">
${assets ? `<link rel="stylesheet" href="${V5_PRESENTATION.assets[0]}"><script defer src="${V5_PRESENTATION.assets[1]}"></script>` : ''}
</head><body><main><h1>Meaningful static overview</h1></main></body></html>`;

test('Manifest v2 is allowlisted, versioned, and emitted alongside the unchanged v1 path', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-v5-'));
  writeFileSync(path.join(root, 'research-pulse.html'), v5Html());
  const result = buildOnly(config(root));
  validateManifestV2(result.manifestV2);
  assert.equal(result.manifestV2.pages[0].destination_id, 'research.overview');
  assert.equal(result.manifestV2.pages[0].canonical_route, '/app/index.html#/research/overview');
  assert.deepEqual(result.manifestV2.pages[0].legacy_aliases, ['research-pulse']);
  assert.equal(result.manifestV2.pages[0].content_id, `sha256:${'a'.repeat(64)}`);
  assert.equal('source' in result.manifestV2.pages[0], false);
  assert.equal(readFileSync(path.join(result.buildRoot, 'console', 'app', 'manifest.json'), 'utf8').includes('research-pulse'), true);
  assert.equal(readFileSync(path.join(result.buildRoot, 'console', 'app', 'manifest.v2.json'), 'utf8').includes('research.overview'), true);
  for (const asset of V5_PRESENTATION.assets) {
    assert.equal(readFileSync(path.join(result.buildRoot, 'content', asset), 'utf8').length > 0, true);
  }
  const wrongVersion = structuredClone(result.manifestV2) as any;
  wrongVersion.schema_version = 1;
  assert.throws(() => validateManifestV2(wrongVersion), /schema_version/);
  const duplicate = structuredClone(result.manifestV2);
  duplicate.pages.push(structuredClone(duplicate.pages[0]));
  assert.throws(() => validateManifestV2(duplicate), /missing or duplicated/);
});

test('invalid presentation handoff and JS-reconstructed empty content fail closed', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-v5-invalid-'));
  writeFileSync(path.join(root, 'research-pulse.html'), v5Html(false));
  assert.throws(() => buildOnly(config(root)), /missing managed presentation asset/);
  writeFileSync(path.join(root, 'research-pulse.html'), v5Html().replace('<main><h1>Meaningful static overview</h1></main>', '<div id="app"></div>'));
  assert.throws(() => buildOnly(config(root)), /semantic static main\/article content/);
  writeFileSync(path.join(root, 'research-pulse.html'), v5Html().replace('</head>', '<script src="https://cdn.example/v5.js"></script></head>'));
  assert.throws(() => buildOnly(config(root)), /same-origin managed assets/);
});

test('browser routing converges canonical routes and aliases on destination_id', () => {
  const source = readFileSync(path.resolve(import.meta.dirname, '..', 'web', 'app', 'destination-routing.js'), 'utf8');
  const windowObject: Record<string, unknown> = {};
  vm.runInNewContext(source, { location: { href: 'https://console.example.com/app/index.html' }, URL, window: windowObject });
  const resolve = (windowObject.HtmlShareDestinationRouting as { resolve: (value: string, manifest: unknown) => string | null }).resolve;
  const manifest = {
    schema_version: 2,
    pages: [{ destination_id: 'research.overview', canonical_route: '/app/index.html#/research/overview', legacy_aliases: ['research-pulse'] }],
  };
  assert.equal(resolve('/app/index.html#/research/overview', manifest), 'research.overview');
  assert.equal(resolve('/app/index.html#/research-pulse', manifest), 'research.overview');
  assert.equal(resolve('research.overview', manifest), 'research.overview');
  const pageList = readFileSync(path.resolve(import.meta.dirname, '..', 'web', 'page-list.js'), 'utf8');
  assert.match(pageList, /typeof page\?\.destination_id === 'string'/);
  assert.doesNotMatch(pageList, /page\.objectKey \?\? page\.source \?\? page\.slug/);
});
