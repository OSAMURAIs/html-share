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
const externalUrl = (windowObject.HtmlShareNavigation as {
  externalUrl: (event: unknown, frame: unknown, currentPage: unknown) => string | null;
}).externalUrl;

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

test('returns destination_id when the normalized manifest has one', () => {
  const pages = [
    { ...currentPage, destination_id: 'research.overview' },
    { ...manifestPages[1], destination_id: 'research.knowledge-review' },
  ];
  assert.equal(navigationSlug(validEvent, frame, pages[0], pages), 'research.knowledge-review');
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

test('accepts validated external HTTP(S) navigation from the active iframe', () => {
  const event = { source: contentWindow, origin: 'null', data: { type: 'html-share:external', url: 'https://www.notion.so/example', token: 'current-page-token' } };
  assert.equal(externalUrl(event, frame, currentPage), 'https://www.notion.so/example');
  assert.equal(externalUrl({ ...event, data: { ...event.data, url: 'http://example.com/path' } }, frame, currentPage), 'http://example.com/path');
});

test('rejects unsafe, malformed, wrong-source, and wrong-token external navigation', () => {
  const valid = { source: contentWindow, origin: 'null', data: { type: 'html-share:external', url: 'https://example.com', token: 'current-page-token' } };
  for (const url of ['javascript:alert(1)', 'data:text/html,payload', 'file:///tmp/private', 'blob:https://example.com/id', 'not a url']) {
    assert.equal(externalUrl({ ...valid, data: { ...valid.data, url } }, frame, currentPage), null);
  }
  assert.equal(externalUrl({ ...valid, source: {} }, frame, currentPage), null);
  assert.equal(externalUrl({ ...valid, data: { ...valid.data, token: 'wrong-token' } }, frame, currentPage), null);
  assert.equal(externalUrl({ ...valid, data: { ...valid.data, extra: true } }, frame, currentPage), null);
});
