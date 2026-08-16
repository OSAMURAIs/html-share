import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(path.resolve(import.meta.dirname, '..', 'web', 'app', 'navigation.js'), 'utf8');
const windowObject: Record<string, unknown> = {};
vm.runInNewContext(source, {
  location: { href: 'https://share.example.com/app/index.html#/research-pulse' },
  URL,
  window: windowObject,
});
const navigationSlug = (windowObject.HtmlShareNavigation as {
  navigationSlug: (event: unknown, frame: unknown, currentPage: unknown, manifestPages: unknown[]) => string | null;
}).navigationSlug;

const contentWindow = {};
const frame = { contentWindow };
const currentPage = { slug: 'research-pulse', navigationToken: 'current-page-token', href: 'https://content.example.com/pages/research-pulse/index.html?Policy=signed' };
const manifestPages = [currentPage, { slug: 'knowledge-review', navigationToken: 'target-page-token', href: 'https://content.example.com/pages/knowledge-review/index.html?Policy=signed' }];
const validEvent = {
  source: contentWindow,
  origin: 'https://content.example.com',
  data: { type: 'html-share:navigate', slug: 'knowledge-review', token: 'current-page-token' },
};

test('accepts a known slug from the active content iframe', () => {
  assert.equal(navigationSlug(validEvent, frame, currentPage, manifestPages), 'knowledge-review');
});

test('accepts the opaque origin produced by the existing content CSP sandbox', () => {
  assert.equal(navigationSlug({ ...validEvent, origin: 'null' }, frame, currentPage, manifestPages), 'knowledge-review');
});

test('rejects a wrong origin or window source', () => {
  assert.equal(navigationSlug({ ...validEvent, origin: 'https://evil.example' }, frame, currentPage, manifestPages), null);
  assert.equal(navigationSlug({ ...validEvent, source: {} }, frame, currentPage, manifestPages), null);
});

test('rejects unknown slugs, URL payloads, and malformed payloads', () => {
  assert.equal(navigationSlug({ ...validEvent, data: { type: 'html-share:navigate', slug: 'unknown', token: 'current-page-token' } }, frame, currentPage, manifestPages), null);
  assert.equal(navigationSlug({ ...validEvent, data: { type: 'html-share:navigate', slug: 'knowledge-review', token: 'current-page-token', url: 'javascript:alert(1)' } }, frame, currentPage, manifestPages), null);
  assert.equal(navigationSlug({ ...validEvent, data: { type: 'html-share:navigate', slug: 7, token: 'current-page-token' } }, frame, currentPage, manifestPages), null);
  assert.equal(navigationSlug({ ...validEvent, data: { type: 'html-share:navigate', slug: 'knowledge-review', token: 'wrong-token' } }, frame, currentPage, manifestPages), null);
  assert.equal(navigationSlug({ ...validEvent, data: null }, frame, currentPage, manifestPages), null);
});
