import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { GetBucketVersioningCommand, ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import test from 'node:test';
import { formatProductionVerification, verifyCurrent, verifyProduction } from '../src/publish.js';

type State = { versioning?: boolean; objects: Array<{ Key: string; VersionId: string; IsLatest?: boolean }>; };
const config = (baseDir: string) => ({ baseDir, aws: { region: 'ap-northeast-1' } } as any);

class ReadOnlyS3 {
  readonly calls: string[] = [];
  constructor(private readonly states: Record<string, State>) {}
  async send(command: any): Promise<any> {
    this.calls.push(command.constructor.name);
    if (command instanceof GetBucketVersioningCommand) return { Status: this.states[command.input.Bucket]?.versioning === false ? 'Suspended' : 'Enabled' };
    if (command instanceof ListObjectVersionsCommand) {
      const state = this.states[command.input.Bucket];
      return { Versions: state.objects, DeleteMarkers: [] };
    }
    throw new Error(`unexpected command ${command.constructor.name}`);
  }
}

function journal(baseDir: string, state: string = 'committed'): void {
  const dir = path.join(baseDir, '.html-share', 'publish-transactions');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'tx.json'), JSON.stringify({
    version: 1, transactionId: 'tx', startedAt: '2026-01-01T00:00:00.000Z', state,
    buckets: [
      { bucket: 'content-bucket', kind: 'content', desiredKeys: ['pages/a.html'], managedKeys: ['pages/a.html', 'pages/old.html'], baseline: [], uploaded: [{ key: 'pages/a.html', versionId: 'content-v1' }], cleanup: [] },
      { bucket: 'console-bucket', kind: 'console', desiredKeys: ['index.html'], managedKeys: ['index.html', 'app/old.js'], baseline: [], uploaded: [{ key: 'index.html', versionId: 'console-v1' }], cleanup: [] },
    ],
  }));
}

function healthyStates(): Record<string, State> {
  return {
    'content-bucket': { objects: [{ Key: 'pages/a.html', VersionId: 'content-v1', IsLatest: true }] },
    'console-bucket': { objects: [{ Key: 'index.html', VersionId: 'console-v1', IsLatest: true }] },
  };
}

test('verifies a committed transaction in both buckets', async () => {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'html-share-verifier-'));
  journal(baseDir);
  const s3 = new ReadOnlyS3(healthyStates());
  const result = await verifyProduction(config(baseDir), s3 as any);
  assert.equal(result.ok, true);
  assert.equal(result.checks.filter((check) => check.check === 'versioning').length, 2);
  assert.deepEqual(s3.calls, ['GetBucketVersioningCommand', 'ListObjectVersionsCommand', 'GetBucketVersioningCommand', 'ListObjectVersionsCommand']);
});

test('fails missing desired key and VersionId mismatch', async () => {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'html-share-verifier-'));
  journal(baseDir);
  const states = healthyStates();
  states['content-bucket'].objects = [{ Key: 'pages/a.html', VersionId: 'wrong', IsLatest: true }];
  states['console-bucket'].objects = [];
  const result = await verifyProduction(config(baseDir), new ReadOnlyS3(states) as any);
  assert.equal(result.ok, false);
  assert.equal(result.checks.filter((check) => !check.ok).length, 2);
});

test('rejects a committed desired key without an uploaded VersionId', async () => {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'html-share-verifier-'));
  journal(baseDir);
  const journalPath = path.join(baseDir, '.html-share', 'publish-transactions', 'tx.json');
  const source = JSON.parse(readFileSync(journalPath, 'utf8'));
  source.buckets[0].uploaded = [];
  writeFileSync(journalPath, JSON.stringify(source));
  const s3 = new ReadOnlyS3(healthyStates());
  await assert.rejects(verifyProduction(config(baseDir), s3 as any), /exactly one uploaded VersionId/);
  assert.deepEqual(s3.calls, []);
});

test('publish-time verification rejects an existing object without transaction VersionId', async () => {
  const s3 = new ReadOnlyS3(healthyStates());
  await assert.rejects(verifyCurrent(s3 as any, {
    bucket: 'content-bucket', kind: 'content', desiredKeys: ['pages/a.html'], managedKeys: ['pages/a.html'],
    baseline: [], uploaded: [], cleanup: [],
  }), /exactly one uploaded VersionId/);
  assert.deepEqual(s3.calls, []);
});

test('fails when a stale managed key remains current or versioning is disabled', async () => {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'html-share-verifier-'));
  journal(baseDir);
  const states = healthyStates();
  states['content-bucket'].objects.push({ Key: 'pages/old.html', VersionId: 'old-v1', IsLatest: true });
  states['console-bucket'].versioning = false;
  const result = await verifyProduction(config(baseDir), new ReadOnlyS3(states) as any);
  assert.equal(result.ok, false);
  assert.ok(result.checks.some((check) => check.check === 'stale-object' && !check.ok));
  assert.ok(result.checks.some((check) => check.check === 'versioning' && !check.ok));
});

test('rejects malformed and non-committed journals without touching S3', async () => {
  for (const state of ['prepared', 'malformed']) {
    const baseDir = mkdtempSync(path.join(tmpdir(), 'html-share-verifier-'));
    if (state === 'malformed') {
      const dir = path.join(baseDir, '.html-share', 'publish-transactions');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'bad.json'), '{');
    } else journal(baseDir, state);
    const s3 = new ReadOnlyS3(healthyStates());
    await assert.rejects(verifyProduction(config(baseDir), s3 as any), /Production verification rejected/);
    assert.deepEqual(s3.calls, []);
  }
});

test('formats concise human-readable verification output', () => {
  assert.match(formatProductionVerification({ ok: false, transactionId: 'tx', checks: [
    { bucket: 'content-bucket', kind: 'content', check: 'desired-object', key: 'pages/a.html', ok: false, message: 'missing' },
  ] }), /^Production verification: FAIL\nTransaction: tx\nFAIL desired-object content\/pages\/a\.html: missing$/);
});
