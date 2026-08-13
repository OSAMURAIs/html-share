import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { addPageToConfig, loadConfig } from '../src/config.js';

function fixture(): { root: string; config: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-config-'));
  mkdirSync(path.join(root, 'pages'));
  writeFileSync(path.join(root, 'pages', 'demo.html'), '<h1>Demo</h1>');
  const config = path.join(root, 'html-share.config.yaml');
  writeFileSync(config, `ownerEmail: owner@example.com
aws:
  region: ap-northeast-1
  consoleDomain: console.example.com
  contentDomain: content.example.com
  certificateArn: arn:aws:acm:us-east-1:111122223333:certificate/00000000-0000-4000-8000-000000000000
  cognitoDomainPrefix: html-share-test
  publicKeyPath: .html-share/keys/public.pem
  privateKeyPath: .html-share/keys/private.pem
  privateKeyParameterName: /html-share/test/private-key
content:
  roots: [pages]
  pages:
    - path: pages/demo.html
  ownerLinkDays: 7
  maximumShareDays: 30
  maximumAssetBytes: 1024
`);
  return { root, config };
}

test('loads a valid config and resolves its base directory', () => {
  const { root, config } = fixture();
  const loaded = loadConfig(config);
  assert.equal(loaded.baseDir, root);
  assert.equal(loaded.content.pages[0].path, 'pages/demo.html');
});

test('adds a page only once', () => {
  const { config } = fixture();
  assert.equal(addPageToConfig(config, 'pages/second.html', 'Second'), true);
  assert.equal(addPageToConfig(config, 'pages/second.html', 'Second'), false);
  assert.equal((readFileSync(config, 'utf8').match(/pages\/second\.html/g) ?? []).length, 1);
});

test('requires separate console and content origins', () => {
  const { config } = fixture();
  const source = readFileSync(config, 'utf8').replace('content.example.com', 'console.example.com');
  writeFileSync(config, source);
  assert.throws(() => loadConfig(config), /must be different security origins/);
});
