import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildOnly } from '../src/publish.js';
import { buildSite } from '../src/bundle.js';
import type { HtmlShareConfig } from '../src/config.js';

test('managed v5 foundation has tokens, progressive enhancement, and no external runtime', () => {
  const css = readFileSync(path.resolve(import.meta.dirname, '..', 'web/assets/v5/1/presentation.css'), 'utf8');
  const js = readFileSync(path.resolve(import.meta.dirname, '..', 'web/assets/v5/1/presentation.js'), 'utf8');
  for (const token of ['--v5-color-navy', '--v5-font-body', '--v5-space-4', '--v5-radius-md', '--v5-content-workspace', '--v5-table-min-width', '--v5-breakpoint-mobile', '--v5-motion-standard', '--v5-surface-research', '--v5-surface-current', '--v5-surface-operational', '--v5-surface-investment']) assert.match(css, new RegExp(token));
  assert.match(css, /--v5-font-body: 16px/);
  assert.match(css, /--v5-content-reading: 62ch/);
  assert.match(css, /\.home-stats \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.v5-grid, \.grid \{ display: grid/);
  assert.match(css, /\.v5-data-table-wide \{ min-width: 96rem/);
  assert.match(css, /\.v5-data-table-sticky-first th:first-child/);
  assert.match(css, /\.v5-cards, \.cards, \.v5-metadata-row/);
  assert.match(css, /@media \(max-width: 42rem\)/);
  assert.match(js, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /https?:\/\//);
  assert.doesNotMatch(js, /https?:\/\//);
});

test('explicit local preview writes same-origin content hrefs into both manifests', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-v5-r1-'));
  const source = '<!doctype html><html><head><title>Overview</title><meta name="html-share:destination-id" content="research.overview"><meta name="html-share:domain" content="research"><meta name="html-share:artifact-class" content="canonical_static_page"><meta name="html-share:content-id" content="sha256:' + 'a'.repeat(64) + '"><meta name="html-share:presentation-contract" content="html-share-v5"><meta name="html-share:presentation-version" content="1"><link rel="stylesheet" href="/assets/v5/1/presentation.css"><script defer src="/assets/v5/1/presentation.js"></script></head><body><main><h1>Meaningful static content</h1><p>Available before JavaScript.</p></main></body></html>';
  writeFileSync(path.join(root, 'research-pulse.html'), source);
  const previous = process.env.HTML_SHARE_PREVIEW_LOCAL;
  process.env.HTML_SHARE_PREVIEW_LOCAL = '1';
  try {
    const config: HtmlShareConfig = {
      ownerEmail: 'owner@example.com',
      aws: { region: 'ap-northeast-1', consoleDomain: 'console.example.com', contentDomain: 'content.example.com', certificateArn: 'arn:aws:acm:us-east-1:111122223333:certificate/00000000-0000-4000-8000-000000000000', cognitoDomainPrefix: 'test', publicKeyPath: 'public.pem', privateKeyPath: 'private.pem', privateKeyParameterName: 'test-key' },
      content: { roots: [root], pages: [{ path: 'research-pulse.html', slug: 'research-pulse', sharePolicy: 'owner_only' }], ownerLinkDays: 30, maximumShareDays: 30, maximumAssetBytes: 1024, allowedInternalCidrs: [] },
      configFile: path.join(root, 'preview.yaml'), baseDir: root,
    };
    const result = buildOnly(config);
    const v1 = JSON.parse(readFileSync(path.join(result.buildRoot, 'console/app/manifest.json'), 'utf8'));
    const v2 = JSON.parse(readFileSync(path.join(result.buildRoot, 'console/app/manifest.v2.json'), 'utf8'));
    assert.equal(v1.pages[0].href, '/content/pages/research-pulse/index.html');
    assert.equal(v2.pages[0].href, '/content/pages/research-pulse/index.html');
    const html = readFileSync(path.join(result.buildRoot, 'content/pages/research-pulse/index.html'), 'utf8');
    assert.match(html, /Meaningful static content/);
    assert.match(html, /const consoleOrigin = "http:\/\/127\.0\.0\.1:4311"/);
    assert.doesNotMatch(html, /https:\/\/cdn\./);
    assert.doesNotMatch(html, /CARD_MAX_COLUMNS/);
  } finally {
    if (previous === undefined) delete process.env.HTML_SHARE_PREVIEW_LOCAL;
    else process.env.HTML_SHARE_PREVIEW_LOCAL = previous;
  }
});

test('preview origin override accepts only the supported loopback origin', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-v5-origin-'));
  const source = '<!doctype html><html><head><title>Overview</title><meta name="html-share:destination-id" content="research.overview"><meta name="html-share:domain" content="research"><meta name="html-share:artifact-class" content="canonical_static_page"><meta name="html-share:content-id" content="sha256:' + 'b'.repeat(64) + '"><meta name="html-share:presentation-contract" content="html-share-v5"><meta name="html-share:presentation-version" content="1"><link rel="stylesheet" href="/assets/v5/1/presentation.css"><script defer src="/assets/v5/1/presentation.js"></script></head><body><main><h1>Overview</h1></main></body></html>';
  writeFileSync(path.join(root, 'research-pulse.html'), source);
  const config: HtmlShareConfig = {
    ownerEmail: 'owner@example.com',
    aws: { region: 'ap-northeast-1', consoleDomain: 'console.example.com', contentDomain: 'content.example.com', certificateArn: 'arn:aws:acm:us-east-1:111122223333:certificate/00000000-0000-4000-8000-000000000000', cognitoDomainPrefix: 'test', publicKeyPath: 'public.pem', privateKeyPath: 'private.pem', privateKeyParameterName: 'test-key' },
    content: { roots: [root], pages: [{ path: 'research-pulse.html', slug: 'research-pulse', sharePolicy: 'owner_only' }], ownerLinkDays: 30, maximumShareDays: 30, maximumAssetBytes: 1024, allowedInternalCidrs: [] },
    configFile: path.join(root, 'preview.yaml'), baseDir: root,
  };
  assert.doesNotThrow(() => buildSite(config, path.join(root, 'loopback-build'), { consoleOrigin: 'http://127.0.0.1:4311' }));
  assert.throws(() => buildSite(config, path.join(root, 'remote-build'), { consoleOrigin: 'https://evil.example' }), /supported local loopback origin/);
  assert.throws(() => buildSite(config, path.join(root, 'localhost-build'), { consoleOrigin: 'http://localhost:4311' }), /supported local loopback origin/);
});
