import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { signUrl } from '../src/sign.js';

test('creates a time-limited CloudFront signed URL', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'html-share-sign-'));
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const key = path.join(directory, 'private.pem');
  writeFileSync(key, privateKey, { mode: 0o600 });
  const signed = new URL(signUrl({
    url: 'https://content.example.com/pages/demo/index.html',
    keyPairId: 'KEXAMPLE',
    privateKeyPath: key,
    days: 7,
  }));
  assert.equal(signed.searchParams.get('Key-Pair-Id'), 'KEXAMPLE');
  assert.ok(signed.searchParams.has('Expires'));
  assert.ok(signed.searchParams.has('Signature'));
});
