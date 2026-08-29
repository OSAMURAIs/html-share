// The production-safety gate for the V1 visual reconstruction.
//
// V1 introduces a *candidate* presentation profile (v2) while production keeps
// serving v1. These tests exist to prove one property:
//
//   Merging candidate presentation code cannot, on its own, change what
//   production publishes.
//
// Activation must be a deliberate, reviewed configuration change. If any test
// here fails, the candidate profile has leaked into the production default and
// the change must not be merged.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse, stringify } from 'yaml';
import { buildOnly, cacheControlFor } from '../src/publish.js';
import { loadConfig } from '../src/config.js';
import {
  DEFAULT_PRESENTATION_VERSION,
  PRESENTATION_PROFILES,
  readGeneratedV5Metadata,
  resolvePresentationProfile,
  V5_PRESENTATION,
  validateManifestV2,
} from '../src/v5-contract.js';
import type { HtmlShareConfig } from '../src/config.js';

const repoRoot = path.resolve(import.meta.dirname, '..');

function config(root: string, presentationVersion?: string): HtmlShareConfig {
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
    presentationVersion: presentationVersion as string,
    configFile: path.join(root, 'html-share.config.yaml'), baseDir: root,
  };
}

/** A research page declaring `version`, linking that profile's required assets. */
function page(version: string): string {
  const profile = resolvePresentationProfile(version);
  const links = [...profile.assets, profile.domain_assets.research]
    .filter((asset): asset is string => Boolean(asset))
    .map((asset) => asset.endsWith('.js')
      ? `<script defer src="${asset}"></script>`
      : `<link rel="stylesheet" href="${asset}">`)
    .join('');
  const contentId = 'sha256:' + 'a'.repeat(64);
  return `<!doctype html><html><head><title>Overview</title>
<meta name="html-share:destination-id" content="research.overview">
<meta name="html-share:domain" content="research">
<meta name="html-share:artifact-class" content="canonical_static_page">
<meta name="html-share:content-id" content="${contentId}">
<meta name="html-share:presentation-contract" content="html-share-v5">
<meta name="html-share:presentation-version" content="${version}">
${links}
</head><body><main><h1>Meaningful static overview</h1></main></body></html>`;
}

function buildWith(version: string | undefined, pageVersion: string) {
  const root = mkdtempSync(path.join(tmpdir(), `html-share-profile-${pageVersion}-`));
  writeFileSync(path.join(root, 'research-pulse.html'), page(pageVersion));
  return { root, run: () => buildOnly(config(root, version)) };
}

test('the production default is profile 1, and both profiles are immutably namespaced', () => {
  assert.equal(DEFAULT_PRESENTATION_VERSION, '1');
  assert.equal(resolvePresentationProfile().version, '1');
  assert.equal(resolvePresentationProfile(undefined).version, '1');
  assert.equal(resolvePresentationProfile(null).version, '1');
  assert.equal(V5_PRESENTATION.version, '1');

  // v1 is the shipped production surface and must never be edited in place.
  assert.deepEqual([...PRESENTATION_PROFILES['1'].assets], ['/assets/v5/1/presentation.css', '/assets/v5/1/presentation.js']);
  assert.deepEqual([...PRESENTATION_PROFILES['1'].staged_assets], [...PRESENTATION_PROFILES['1'].assets]);
  assert.deepEqual(PRESENTATION_PROFILES['1'].domain_assets, {});

  // v2 owns a disjoint namespace, so publishing it can never overwrite v1.
  for (const asset of PRESENTATION_PROFILES['2'].staged_assets) {
    assert.match(asset, /^[/]assets[/]v5[/]2[/]/);
  }
  assert.equal(PRESENTATION_PROFILES['2'].staged_assets.some((a) => a.startsWith('/assets/v5/1/')), false);
  assert.throws(() => resolvePresentationProfile('3'), /Unknown presentation profile/);
});

test('configuration selects the profile explicitly, and absence means production v1', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-profile-config-'));
  writeFileSync(path.join(root, 'page.html'), '<main>x</main>');
  const base = {
    ownerEmail: 'owner@example.com',
    aws: {
      region: 'ap-northeast-1', consoleDomain: 'console.example.com', contentDomain: 'content.example.com',
      certificateArn: 'arn:aws:acm:us-east-1:111122223333:certificate/00000000-0000-4000-8000-000000000000',
      cognitoDomainPrefix: 'test', publicKeyPath: 'public.pem', privateKeyPath: 'private.pem', privateKeyParameterName: 'k',
    },
    content: { roots: ['.'], pages: ['page.html'] },
  };
  const file = path.join(root, 'html-share.config.yaml');
  const write = (extra: Record<string, unknown>) => writeFileSync(file, stringify({ ...base, ...extra }));

  write({});
  assert.equal(loadConfig(file).presentationVersion, '1');

  write({ presentation: { profile: '2' } });
  assert.equal(loadConfig(file).presentationVersion, '2');

  write({ presentation: { profile: '9' } });
  assert.throws(() => loadConfig(file), /presentation[.]profile must be one of/);

  write({ presentation: { profile: '1' } });
  assert.equal(loadConfig(file).presentationVersion, '1');

  write({ presentation: { profile: null } });
  assert.equal(loadConfig(file).presentationVersion, '1');

  write({ presentation: {} });
  assert.equal(loadConfig(file).presentationVersion, '1');
});

test('a malformed presentation section is a hard configuration error, never a silent v1', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-profile-malformed-'));
  writeFileSync(path.join(root, 'page.html'), '<main>x</main>');
  const base = {
    ownerEmail: 'owner@example.com',
    aws: {
      region: 'ap-northeast-1', consoleDomain: 'console.example.com', contentDomain: 'content.example.com',
      certificateArn: 'arn:aws:acm:us-east-1:111122223333:certificate/00000000-0000-4000-8000-000000000000',
      cognitoDomainPrefix: 'test', publicKeyPath: 'public.pem', privateKeyPath: 'private.pem', privateKeyParameterName: 'k',
    },
    content: { roots: ['.'], pages: ['page.html'] },
  };
  const file = path.join(root, 'html-share.config.yaml');
  const write = (extra: Record<string, unknown>) => writeFileSync(file, stringify({ ...base, ...extra }));

  // A `presentation:` value that isn't a mapping (a typo, not an absent
  // section) must fail loudly rather than resolve to v1 by accident.
  write({ presentation: 'v2' });
  assert.throws(() => loadConfig(file), /presentation must be a mapping/);

  write({ presentation: ['2'] });
  assert.throws(() => loadConfig(file), /presentation must be a mapping/);

  // A profile value of the wrong type must fail the same way, not coerce.
  write({ presentation: { profile: true } });
  assert.throws(() => loadConfig(file), /presentation[.]profile must be one of/);

  write({ presentation: { profile: {} } });
  assert.throws(() => loadConfig(file), /presentation[.]profile must be one of/);

  write({ presentation: { profile: '' } });
  assert.throws(() => loadConfig(file), /presentation[.]profile must be one of/);
});

test('the example production configuration does not activate the candidate profile', () => {
  const example = parse(readFileSync(path.join(repoRoot, 'html-share.config.example.yaml'), 'utf8')) as Record<string, unknown>;
  assert.equal((example.presentation as Record<string, unknown> | undefined)?.profile, undefined);
});

test('a default build publishes v1 only and stages no candidate asset', () => {
  const result = buildWith(undefined, '1').run();
  assert.equal(result.manifestV2.presentation.version, '1');
  assert.equal(result.manifestV2.pages[0].presentation.version, '1');
  const content = path.join(result.buildRoot, 'content');
  for (const asset of PRESENTATION_PROFILES['1'].staged_assets) {
    assert.equal(readFileSync(path.join(content, asset), 'utf8').length > 0, true);
  }
  // The decisive assertion: candidate assets exist in the repository, but a
  // default build never copies them into the content root, so a production
  // publish cannot upload them.
  assert.equal(existsSync(path.join(content, 'assets', 'v5', '2')), false);
  const published = readFileSync(path.join(content, 'pages', 'research-pulse', 'index.html'), 'utf8');
  assert.equal(published.includes('/assets/v5/2/'), false);
  assert.equal(published.includes('/assets/v5/1/presentation.css'), true);
});

test('the candidate profile is reachable only by explicit selection', () => {
  const result = buildWith('2', '2').run();
  assert.equal(result.manifestV2.presentation.version, '2');
  const content = path.join(result.buildRoot, 'content');
  for (const asset of PRESENTATION_PROFILES['2'].staged_assets) {
    assert.equal(readFileSync(path.join(content, asset), 'utf8').length > 0, true);
  }
  assert.equal(existsSync(path.join(content, 'assets', 'v5', '1')), false);
});

test('the v5 contract rejects a page declaring a different profile', () => {
  // The explicit contract check, isolated from the build pipeline.
  const v1 = PRESENTATION_PROFILES['1'];
  const v2 = PRESENTATION_PROFILES['2'];
  assert.equal(readGeneratedV5Metadata(page('1'), v1)?.presentation_version, '1');
  assert.equal(readGeneratedV5Metadata(page('2'), v2)?.presentation_version, '2');
  assert.throws(() => readGeneratedV5Metadata(page('2'), v1), /invalid v5 generated metadata/);
  assert.throws(() => readGeneratedV5Metadata(page('1'), v2), /invalid v5 generated metadata/);
});

test('a build refuses content from the profile it is not publishing, by an explicit named check', () => {
  // The primary rejection is a deliberate presentation-profile-mismatch error,
  // raised before any asset handling runs — not an incidental "local asset not
  // found" once the inliner later trips over a foreign asset reference.
  assert.throws(() => buildWith(undefined, '2').run(), /presentation profile mismatch/);
  assert.throws(() => buildWith(undefined, '2').run(), /declares presentation-version "2".*publishing profile "1"/);
  // And the reverse, so a candidate build cannot silently republish v1 content.
  assert.throws(() => buildWith('2', '1').run(), /presentation profile mismatch/);
  assert.throws(() => buildWith('2', '1').run(), /declares presentation-version "1".*publishing profile "2"/);
});

test('the asset inliner independently rejects a foreign-profile asset as defense in depth', () => {
  // Even a page whose declared presentation-version matches the build (so the
  // explicit check above passes) must not be able to smuggle in a link to
  // another profile's asset — it is not in the selected profile's exemption
  // list, so the inliner treats it as a missing local file and fails closed.
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-profile-foreign-asset-'));
  const foreignAsset = PRESENTATION_PROFILES['1'].assets[0];
  writeFileSync(path.join(root, 'research-pulse.html'),
    page('2').replace('</head>', `<link rel="stylesheet" href="${foreignAsset}"></head>`));
  assert.throws(() => buildOnly(config(root, '2')), new RegExp(`Local asset not found: ${foreignAsset.replace(/\//g, '.')}`));
});

test('a page may not reference another domain sheet from its own profile', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-profile-cross-'));
  const foreign = PRESENTATION_PROFILES['2'].domain_assets.investment as string;
  writeFileSync(path.join(root, 'research-pulse.html'),
    page('2').replace('</head>', `<link rel="stylesheet" href="${foreign}"></head>`));
  assert.throws(() => buildOnly(config(root, '2')), /outside its domain/);
});

test('manifest validation is profile-scoped in both directions', () => {
  const candidate = buildWith('2', '2').run().manifestV2;
  validateManifestV2(candidate, PRESENTATION_PROFILES['2']);
  // Default validation is production validation: a v2 manifest must not pass.
  assert.throws(() => validateManifestV2(candidate), /presentation contract is unsupported/);
  assert.throws(() => validateManifestV2(candidate, PRESENTATION_PROFILES['1']), /presentation contract is unsupported/);
});

test('every versioned asset namespace is served immutable', () => {
  assert.match(cacheControlFor('content', 'assets/v5/1/presentation.css'), /immutable/);
  assert.match(cacheControlFor('content', 'assets/v5/2/tokens.css'), /immutable/);
  assert.match(cacheControlFor('content', 'assets/v5/2/domains/home.css'), /immutable/);
  // Mutable owner surfaces are unchanged.
  assert.match(cacheControlFor('content', 'pages/home/index.html'), /no-store/);
  assert.match(cacheControlFor('content', 'manifest.v2.json'), /no-store/);
});
