import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildOnly } from '../src/publish.js';
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
  assert.equal(manifest.name, 'HTML共有くん');
  assert.equal(manifest.short_name, '共有くん');
  assert.equal(manifest.lang, 'ja');
  assert.equal(manifest.start_url, '/app/index.html');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.map((icon: any) => icon.src), ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png']);
});

test('canonical bundling remains self-contained and adds no runtime fetch dependency', () => {
  const pageRoot = mkdtempSync(path.join(tmpdir(), 'html-share-page-'));
  writeFileSync(path.join(pageRoot, 'page.html'), '<!doctype html><html><body><img src="pixel.png"><a href="https://example.com">external</a></body></html>');
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
  const content = readFileSync(path.join(result.buildRoot, 'content', 'pages', 'demo', 'index.html'), 'utf8');
  assert.match(content, /data:image\/png;base64,/);
  assert.match(content, /<script>/);
  assert.doesNotMatch(content, /<script\s+src=/i);
  assert.doesNotMatch(content, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
});

test('cache and security policy invariants remain explicit', () => {
  const publish = readFileSync(path.join(root, 'src', 'publish.ts'), 'utf8');
  const infra = readFileSync(path.join(root, 'infra', 'lib', 'html-share-stack.ts'), 'utf8');
  assert.match(publish, /CacheControl: 'no-store, max-age=0'/);
  assert.match(infra, /CachePolicy\.CACHING_DISABLED/);
  assert.match(infra, /customHeadersBehavior:[\s\S]*Cache-Control', value: 'no-store, max-age=0'/);
  assert.match(infra, /connect-src 'none'/);
  assert.match(infra, /sandbox allow-scripts/);
  assert.match(infra, /trustedKeyGroups: \[keyGroup\]/);
});

test('baseline sanitizer strips sensitive data and signed query strings', () => {
  const record = sanitizeBaselineRecord({
    timestamp: '2026-08-24T00:00:00.000Z', scenario: 'desktop-iframe',
    documentUrl: 'https://content.example.com/pages/demo/index.html?Policy=secret&Signature=secret',
    resourceUrl: 'https://content.example.com/app.js?X-Amz-Signature=secret',
    cookie: 'private-cookie', authorization: 'Bearer private-token',
    pageTitle: 'Private title', content: '<p>Private content</p>',
    pageReady: 1234, bfcache: { persisted: true, restored: true, cookie: 'private-cookie' },
    pageshow: { persisted: true, navigationType: 'back_forward', content: 'private content' },
  });
  assert.equal(record.documentUrl, 'https://content.example.com/pages/demo/index.html');
  assert.equal(record.resourceUrl, 'https://content.example.com/app.js');
  assert.equal('cookie' in record, false);
  assert.equal('authorization' in record, false);
  assert.equal('pageTitle' in record, false);
  assert.equal('content' in record, false);
  assert.deepEqual(record.bfcache, { persisted: true, restored: true });
  assert.deepEqual(record.pageshow, { persisted: true, navigationType: 'back_forward' });
  assert.match(formatBaselineRecord(record), /"pageReady": 1234/);
});
