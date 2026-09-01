import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildOnly } from '../src/publish.js';
import { cacheControlFor } from '../src/publish.js';
import { formatBaselineRecord, sanitizeBaselineRecord } from '../scripts/performance-baseline.mjs';
import type { HtmlShareConfig } from '../src/config.js';

const root = path.resolve(import.meta.dirname, '..');
const bytes = (file: string) => Buffer.byteLength(readFileSync(path.join(root, file)));

test('critical browser shell stays within the v1 raw-byte budgets', () => {
  const dashboard = bytes('web/app/index.html');
  const list = bytes('web/page-list.js');
  assert.ok(dashboard <= 80 * 1024, `web/app/index.html is ${dashboard} bytes`);
  assert.ok(list <= 32 * 1024, `web/page-list.js is ${list} bytes`);
  assert.ok(dashboard + list <= 120 * 1024, `critical shell is ${dashboard + list} bytes`);
});

test('generated app manifest preserves current PWA identity and navigation fields', () => {
  const pageRoot = mkdtempSync(path.join(tmpdir(), 'html-share-page-'));
  writeFileSync(path.join(pageRoot, 'page.html'), '<!doctype html><html><head><title>Private test page</title></head><body><img src="pixel.png"></body></html>');
  writeFileSync(path.join(pageRoot, 'pixel.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const config = {
    ownerEmail: 'owner@example.com',
    aws: {
      region: 'ap-northeast-1', consoleDomain: 'console.example.com', contentDomain: 'content.example.com',
      certificateArn: 'arn:aws:acm:us-east-1:111122223333:certificate/00000000-0000-4000-8000-000000000000',
      cognitoDomainPrefix: 'test', publicKeyPath: 'public.pem', privateKeyPath: 'private.pem', privateKeyParameterName: 'test-key',
    },
    content: {
      roots: [pageRoot], pages: [{ path: 'page.html', slug: 'demo' }], ownerLinkDays: 30, maximumShareDays: 30,
      maximumAssetBytes: 1024, allowedInternalCidrs: [],
    },
    configFile: path.join(pageRoot, 'html-share.config.yaml'), baseDir: pageRoot,
  } satisfies HtmlShareConfig;

  const result = buildOnly(config);
  const manifest = JSON.parse(readFileSync(path.join(result.buildRoot, 'console', 'app.webmanifest'), 'utf8')) as Record<string, any>;
  assert.equal(manifest.name, 'ORBIT');
  assert.equal(manifest.short_name, 'ORBIT');
  assert.equal(manifest.lang, 'ja');
  assert.equal(manifest.start_url, '/app/index.html');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.map((icon: any) => icon.src), ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png']);
});

test('canonical bundling and deployed content CSP remain network-self-contained', () => {
  const pageRoot = mkdtempSync(path.join(tmpdir(), 'html-share-page-'));
  writeFileSync(path.join(pageRoot, 'page.html'), '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><img src="pixel.png"><img src="https://tracker.example/pixel.png"><iframe src="https://example.com/embed"></iframe><a href="https://example.com">external</a></body></html>');
  writeFileSync(path.join(pageRoot, 'pixel.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(path.join(pageRoot, 'style.css'), 'body { color: #000; }');
  const config = {
    ownerEmail: 'owner@example.com',
    aws: {
      region: 'ap-northeast-1', consoleDomain: 'console.example.com', contentDomain: 'content.example.com',
      certificateArn: 'arn:aws:acm:us-east-1:111122223333:certificate/00000000-0000-4000-8000-000000000000',
      cognitoDomainPrefix: 'test', publicKeyPath: 'public.pem', privateKeyPath: 'private.pem', privateKeyParameterName: 'test-key',
    },
    content: {
      roots: [pageRoot], pages: [{ path: 'page.html', slug: 'demo' }], ownerLinkDays: 30, maximumShareDays: 30,
      maximumAssetBytes: 1024, allowedInternalCidrs: [],
    },
    configFile: path.join(pageRoot, 'html-share.config.yaml'), baseDir: pageRoot,
  } satisfies HtmlShareConfig;
  const result = buildOnly(config);
  const content = readFileSync(path.join(result.buildRoot, 'content', 'pages', 'demo', 'index.html'), 'utf8');
  const infra = readFileSync(path.join(root, 'infra', 'lib', 'html-share-stack.ts'), 'utf8');
  const contentCsp = infra.match(/const csp = content\s*\? `([^`]+)`/)?.[1];
  assert.match(content, /data:image\/png;base64,/);
  assert.match(content, /href="data:text\/css;base64,/);
  assert.match(content, /<script>/);
  assert.doesNotMatch(content, /<script\s+src=/i);
  assert.doesNotMatch(content, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
  assert.ok(contentCsp, 'content CSP is defined');
  assert.match(contentCsp, /default-src 'none'/);
  assert.match(contentCsp, /img-src 'self' data:/);
  assert.match(contentCsp, /media-src 'self' data:/);
  assert.match(contentCsp, /frame-src 'none'/);
  assert.match(contentCsp, /connect-src 'none'/);
});

test('cache contract and security policy invariants remain explicit', () => {
  const contract = readFileSync(path.join(root, 'docs', 'performance-contract.md'), 'utf8');
  const publish = readFileSync(path.join(root, 'src', 'publish.ts'), 'utf8');
  const infra = readFileSync(path.join(root, 'infra', 'lib', 'html-share-stack.ts'), 'utf8');
  assert.match(contract, /Owner APIs must not be reused as stale cached data/);
  assert.match(contract, /Mutable manifest and content must preserve explicit-refresh freshness/);
  assert.match(contract, /Future fingerprinted static assets may be cached aggressively/);
  assert.match(contract, /same-origin managed assets/);
  assert.match(contract, /JavaScript is progressive enhancement, never content reconstruction/);
  assert.match(contract, /deterministic managed paths/);
  const objectCacheControl = cacheControlFor('content', 'pages/demo/index.html');
  const responseCacheControl = infra.match(/header:\s*'Cache-Control',\s*value:\s*'([^']+)'/)?.[1];
  const contentBehavior = infra.match(/const contentDistribution[\s\S]*?defaultBehavior:\s*\{([\s\S]*?cachePolicy:[\s\S]*?compress:\s*true,[\s\S]*?)\n\s*\}/)?.[1];
  const sharedConsoleBehavior = infra.match(/const common = \{([\s\S]*?)\n\s*\};/)?.[1];
  const assertFreshnessDirective = (value: string | undefined, label: string) => {
    assert.ok(value, `${label} cache directive is defined`);
    assert.match(value, /(?:^|,)\s*(?:no-store|no-cache|max-age\s*=\s*0)\b/i, `${label} must prevent stale reuse`);
  };
  const assertFreshnessPolicy = (block: string | undefined, label: string) => {
    assert.ok(block, `${label} behavior is defined`);
    if (/cachePolicy:\s*cloudfront\.CachePolicy\.CACHING_DISABLED/.test(block)) return;
    const policyName = block.match(/cachePolicy:\s*([A-Za-z_$][\w$]*)/)?.[1];
    assert.ok(policyName, `${label} must use an explicit cache policy`);
    const policy = infra.match(new RegExp(`const ${policyName} = new cloudfront\\.CachePolicy\\([\\s\\S]*?\\n\\s*\\}\\);`))?.[0];
    assert.ok(policy, `${label} custom cache policy is defined`);
    assert.match(policy, /defaultTtl:\s*Duration\.seconds\(0\)/);
    assert.match(policy, /maxTtl:\s*Duration\.seconds\(0\)/);
  };
  assertFreshnessDirective(objectCacheControl, 'published mutable object');
  assert.equal(cacheControlFor('content', 'assets/v5/1/presentation.js'), 'public, max-age=31536000, immutable');
  assert.match(publish, /cacheControlFor\(bucket\.kind, key\)/);
  assert.match(infra, /assets\/v5\/1\/\*/);
  assertFreshnessDirective(responseCacheControl, 'CloudFront response');
  assertFreshnessPolicy(contentBehavior, 'mutable content');
  assertFreshnessPolicy(sharedConsoleBehavior, 'console and owner API');
  assert.match(infra, /'api\/owner\/\*':\s*\{\s*\.\.\.common/);
  assert.match(infra, /connect-src 'none'/);
  assert.match(infra, /script-src 'self' 'unsafe-inline' data:/);
  assert.match(infra, /style-src 'self' 'unsafe-inline' data:/);
  assert.match(infra, /sandbox allow-scripts/);
  assert.match(infra, /trustedKeyGroups: \[keyGroup\]/);
});

test('baseline sanitizer strips sensitive data and signed query strings', () => {
  const record = sanitizeBaselineRecord({
    timestamp: '2026-08-24T00:00:00.000Z', browser: 'Chrome', browserVersion: '140.0.0.0',
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1, privateTitle: 'Private title' },
    deviceProfile: 'desktop-normal-broadband', mode: 'cold', scenario: 'desktop-iframe',
    documentUrl: 'https://content.example.com/pages/demo/index.html?Policy=secret&Signature=secret',
    resourceUrl: 'https://content.example.com/app.js?X-Amz-Signature=secret',
    cookie: 'private-cookie', authorization: 'Bearer private-token',
    pageTitle: 'Private title', content: '<p>Private content</p>',
    pageReady: 1234, bfcache: { persisted: true, restored: true, cookie: 'private-cookie' },
    pageshow: { persisted: true, navigationType: 'back_forward', content: 'private content' },
  });
  assert.equal(record.documentUrl, 'https://content.example.com/pages/demo/index.html');
  assert.equal(record.resourceUrl, 'https://content.example.com/app.js');
  assert.deepEqual(record.viewport, { width: 1440, height: 900, deviceScaleFactor: 1 });
  assert.equal('cookie' in record, false);
  assert.equal('authorization' in record, false);
  assert.equal('pageTitle' in record, false);
  assert.equal('content' in record, false);
  assert.deepEqual(record.bfcache, { persisted: true, restored: true });
  assert.deepEqual(record.pageshow, { persisted: true, navigationType: 'back_forward' });
  assert.match(formatBaselineRecord(record), /"pageReady": 1234/);
  const mislabeled = sanitizeBaselineRecord({
    browser: 'Bearer private-token', browserVersion: 'secret', scenario: 'Private title',
    listReady: 'private content', requestCount: 1.5,
  });
  assert.deepEqual(mislabeled, {});
});
