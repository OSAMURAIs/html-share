import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildOnly, toConsoleManifestPage, type PublicManifestPage } from '../src/publish.js';
import type { BuiltPage } from '../src/bundle.js';
import type { HtmlShareConfig } from '../src/config.js';

function builtPage(source: string): BuiltPage {
  return {
    slug: 'demo',
    navigationToken: 'A'.repeat(24),
    title: 'Demo',
    source,
    updatedAt: '2026-08-20T00:00:00.000Z',
    date: '2026-08-20T00:00:00.000Z',
    repository: 'examples',
    stream: 'examples',
    streamLabel: 'Examples',
    share_policy: 'owner_only',
    objectKey: 'pages/demo/index.html',
  };
}

test('public projection keeps internal provenance private and preserves browser fields', () => {
  for (const source of ['C:\\Users\\example\\Documents\\private\\page.html', '/home/example/private/page.html']) {
    const internal = builtPage(source);
    const publicPage: PublicManifestPage = toConsoleManifestPage(internal, 'https://console.example/app/index.html#/demo');
    assert.equal(internal.source, source);
    assert.equal('source' in publicPage, false);
    assert.equal(JSON.stringify(publicPage).includes(source), false);
    assert.equal(publicPage.href, 'https://console.example/app/index.html#/demo');
    assert.equal(publicPage.navigationToken, internal.navigationToken);
    assert.equal(publicPage.objectKey, internal.objectKey);
    assert.equal(publicPage.share_policy, 'owner_only');
  }
});

test('build-only console manifest uses the same safe projection and keeps href null', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-public-manifest-'));
  writeFileSync(path.join(root, 'page.html'), '<!doctype html><html><body><h1>Demo</h1></body></html>');
  const config = {
    ownerEmail: 'owner@example.com',
    aws: {
      region: 'ap-northeast-1', consoleDomain: 'console.example.com', contentDomain: 'content.example.com',
      certificateArn: 'arn:aws:acm:us-east-1:111122223333:certificate/00000000-0000-4000-8000-000000000000',
      cognitoDomainPrefix: 'test', publicKeyPath: 'public.pem', privateKeyPath: 'private.pem', privateKeyParameterName: 'test-key',
    },
    content: {
      roots: [root], pages: [{ path: 'page.html', slug: 'demo', repository: 'examples', stream: 'examples', streamLabel: 'Examples', sharePolicy: 'owner_only' as const }],
      ownerLinkDays: 30, maximumShareDays: 30, maximumAssetBytes: 1024, allowedInternalCidrs: [],
    },
    configFile: path.join(root, 'html-share.config.yaml'), baseDir: root,
  } satisfies HtmlShareConfig;

  const result = buildOnly(config);
  assert.equal(typeof result.manifest.pages[0].source, 'string');
  const publicManifest = JSON.parse(readFileSync(path.join(result.buildRoot, 'console', 'app', 'manifest.json'), 'utf8')) as { pages: PublicManifestPage[] };
  assert.equal(publicManifest.pages.length, 1);
  assert.equal('source' in publicManifest.pages[0], false);
  assert.equal(publicManifest.pages[0].href, null);
  assert.equal(publicManifest.pages[0].objectKey, 'pages/demo/index.html');
  assert.doesNotMatch(readFileSync(path.join(result.buildRoot, 'console', 'app', 'manifest.json'), 'utf8'), /C:\\Users\\|\/home\/|\/Users\//);
});
