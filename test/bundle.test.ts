import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildSite, bundleHtml, slugify } from '../src/bundle.js';
import type { HtmlShareConfig } from '../src/config.js';

test('bundles local assets and adds privacy metadata', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-bundle-'));
  writeFileSync(path.join(root, 'pixel.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(path.join(root, 'page.html'), '<!doctype html><html><head><title>Demo</title></head><body><img src="pixel.png"></body></html>');
  const bundled = bundleHtml(path.join(root, 'page.html'), [realpathSync(root)], 1024);
  assert.match(bundled, /data:image\/png;base64,/);
  assert.match(bundled, /name="robots" content="noindex/);
  assert.match(bundled, /name="referrer" content="no-referrer"/);
  assert.match(bundled, /table\[data-mb-view="card"\]/);
  assert.match(bundled, /data-mb-tables/);
});

test('rejects pages outside approved roots, including symlinks', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-root-'));
  const outside = mkdtempSync(path.join(tmpdir(), 'html-share-outside-'));
  const secret = path.join(outside, 'secret.html');
  writeFileSync(secret, '<p>outside</p>');
  const link = path.join(root, 'linked.html');
  symlinkSync(secret, link);
  assert.throws(() => bundleHtml(link, [realpathSync(root)], 1024), /outside content\.roots/);
});

test('creates stable ASCII slugs', () => {
  assert.equal(slugify('Release Notes 2026'), 'release-notes-2026');
  assert.match(slugify('共有結果'), /^page-[a-f0-9]{8}$/);
});

test('marks configured page links and injects postMessage navigation', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-pages-'));
  const buildRoot = path.join(root, 'build');
  const pages = ['research-pulse', 'knowledge-review', 'paper-queue', 'digest-queue'];
  for (const page of pages) {
    writeFileSync(path.join(root, `${page}.html`), `<!doctype html><html><body><nav><a target="_top" href="${page === 'research-pulse' ? 'knowledge-review' : 'research-pulse'}.html"><span>link</span></a><a href="https://example.com/x">external</a><a href="#section">anchor</a><a href="mailto:owner@example.com">mail</a><a href="tel:+81000000000">tel</a><a href="javascript:alert(1)">unsafe</a><a href="missing.html">missing</a></nav></body></html>`);
  }
  const config = {
    ownerEmail: 'owner@example.com',
    aws: {
      region: 'ap-northeast-1',
      consoleDomain: 'share.example.com',
      contentDomain: 'content.example.com',
      certificateArn: 'arn:aws:acm:us-east-1:111122223333:certificate/00000000-0000-4000-8000-000000000000',
      cognitoDomainPrefix: 'test',
      publicKeyPath: 'public.pem',
      privateKeyPath: 'private.pem',
      privateKeyParameterName: 'test-key',
    },
    content: {
      roots: [root],
      pages: pages.map((page) => ({ path: `${page}.html`, slug: page })),
      ownerLinkDays: 30,
      maximumShareDays: 30,
      maximumAssetBytes: 1024,
      allowedInternalCidrs: [],
    },
    configFile: path.join(root, 'html-share.config.yaml'),
    baseDir: root,
  } satisfies HtmlShareConfig;

  const manifest = buildSite(config, buildRoot);
  const pulse = readFileSync(path.join(buildRoot, 'content', 'pages', 'research-pulse', 'index.html'), 'utf8');
  const knowledge = readFileSync(path.join(buildRoot, 'content', 'pages', 'knowledge-review', 'index.html'), 'utf8');
  const pulseHref = pulse.match(/href="([^"]+)"/)?.[1];
  const knowledgeHref = knowledge.match(/href="([^"]+)"/)?.[1];
  assert.equal(new URL(pulseHref!, 'https://content.example.com/pages/research-pulse/index.html').origin, 'https://share.example.com');
  assert.equal(new URL(pulseHref!, 'https://content.example.com/pages/research-pulse/index.html').pathname, '/app/index.html');
  assert.equal(new URL(pulseHref!, 'https://content.example.com/pages/research-pulse/index.html').hash, '#/knowledge-review');
  assert.equal(new URL(knowledgeHref!, 'https://content.example.com/pages/knowledge-review/index.html').origin, 'https://share.example.com');
  assert.equal(new URL(knowledgeHref!, 'https://content.example.com/pages/knowledge-review/index.html').hash, '#/research-pulse');
  assert.match(pulse, /data-html-share-page="knowledge-review"/);
  assert.match(knowledge, /data-html-share-page="research-pulse"/);
  assert.doesNotMatch(pulse, /target="_top"/);
  assert.match(pulse, /data-html-share-nav="postmessage-v1"/);
  assert.match(pulse, /window\.parent\.postMessage\(\{ type: 'html-share:navigate', slug, token: navigationToken \}, consoleOrigin\)/);
  assert.match(pulse, /const consoleOrigin = "https:\/\/share\.example\.com"/);
  assert.match(pulse, new RegExp(`const navigationToken = "${manifest.pages[0].navigationToken}"`));
  assert.match(manifest.pages[0].navigationToken, /^[A-Za-z0-9_-]{24}$/);
  assert.match(pulse, /href="https:\/\/example\.com\/x"/);
  assert.match(pulse, /href="#section"/);
  assert.match(pulse, /href="mailto:owner@example\.com"/);
  assert.match(pulse, /href="tel:\+81000000000"/);
  assert.match(pulse, /href="javascript:alert\(1\)"/);
  assert.match(pulse, /href="missing\.html"/);
  assert.equal((pulse.match(/data-html-share-page=/g) ?? []).length, 1);

  const rebuilt = buildSite(config, buildRoot);
  assert.equal(rebuilt.pages[0].navigationToken, manifest.pages[0].navigationToken);
});
