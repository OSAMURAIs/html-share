import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { recoverPublish } from '../src/publish.js';

class RecoveryS3 {
  current = new Map([['pages/old.html', { Key: 'pages/old.html', VersionId: 'new-version', IsLatest: true }]]);
  deleted: string[] = [];
  async send(command: any): Promise<any> {
    const name = command.constructor.name;
    if (name === 'GetBucketVersioningCommand') return { Status: 'Enabled' };
    if (name === 'ListObjectVersionsCommand') return {
      Versions: [...this.current.values()], DeleteMarkers: [],
    };
    if (name === 'DeleteObjectsCommand') {
      for (const object of command.input.Delete.Objects) {
        this.deleted.push(`${object.Key}:${object.VersionId}`);
        if (object.VersionId === 'new-version') this.current.set(object.Key, { Key: object.Key, VersionId: 'base-version', IsLatest: true });
      }
      return { Deleted: command.input.Delete.Objects };
    }
    throw new Error(`Unexpected command ${name}`);
  }
}

class ChunkedRecoveryS3 {
  current = new Map(identifiers(1001).map((item) => [item.Key, { Key: item.Key, VersionId: item.VersionId, IsLatest: true }]));
  requestSizes: number[] = [];
  failSecondChunk = true;

  async send(command: any): Promise<any> {
    const name = command.constructor.name;
    if (name === 'GetBucketVersioningCommand') return { Status: 'Enabled' };
    if (name === 'ListObjectVersionsCommand') return { Versions: [...this.current.values()], DeleteMarkers: [] };
    if (name === 'DeleteObjectsCommand') {
      const objects = command.input.Delete.Objects as Array<{ Key: string; VersionId: string }>;
      this.requestSizes.push(objects.length);
      if (this.failSecondChunk && this.requestSizes.length === 2) {
        this.failSecondChunk = false;
        return { Deleted: [], Errors: [{ Key: objects[0].Key, Code: 'InternalError' }] };
      }
      for (const object of objects) {
        if (this.current.get(object.Key)?.VersionId === object.VersionId) this.current.delete(object.Key);
      }
      return { Deleted: objects };
    }
    throw new Error(`Unexpected command ${name}`);
  }
}

function identifiers(count: number): Array<{ Key: string; VersionId: string }> {
  return Array.from({ length: count }, (_, index) => ({ Key: `pages/page-${index}.html`, VersionId: `version-${index}` }));
}

test('restart recovery restores the baseline and is idempotent', async () => {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'html-share-recovery-'));
  const journalDir = path.join(baseDir, '.html-share', 'publish-transactions');
  mkdirSync(journalDir, { recursive: true });
  const journal = {
    version: 1, transactionId: 'drill', startedAt: new Date().toISOString(), state: 'uploading',
    buckets: [{
      bucket: 'content', kind: 'content', desiredKeys: ['pages/old.html'], managedKeys: ['pages/old.html'],
      baseline: [{ key: 'pages/old.html', versionId: 'base-version', deleteMarker: false }],
      uploaded: [{ key: 'pages/old.html', versionId: 'new-version' }], cleanup: [],
    }],
  };
  const journalPath = path.join(journalDir, 'drill.json');
  writeFileSync(journalPath, JSON.stringify(journal));
  const fake = new RecoveryS3();
  const config = { baseDir, aws: { region: 'test' } } as any;

  assert.deepEqual(await recoverPublish(config, 'drill', fake as any), { recovered: 'drill' });
  assert.deepEqual(fake.deleted, ['pages/old.html:new-version']);
  assert.equal(JSON.parse(readFileSync(journalPath, 'utf8')).state, 'rolled_back');
  assert.deepEqual(await recoverPublish(config, 'drill', fake as any), { recovered: 'drill' });
  assert.deepEqual(fake.deleted, ['pages/old.html:new-version']);
});

test('recovery remains restart-safe after a later deletion chunk fails', async () => {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'html-share-chunked-recovery-'));
  const journalDir = path.join(baseDir, '.html-share', 'publish-transactions');
  mkdirSync(journalDir, { recursive: true });
  const refs = identifiers(1001).map(({ Key, VersionId }) => ({ key: Key, versionId: VersionId }));
  const journal = {
    version: 1, transactionId: 'chunked-drill', startedAt: new Date().toISOString(), state: 'uploading',
    buckets: [{
      bucket: 'content', kind: 'content', desiredKeys: refs.map((item) => item.key), managedKeys: [],
      baseline: [], uploaded: refs, cleanup: [],
    }],
  };
  const journalPath = path.join(journalDir, 'chunked-drill.json');
  writeFileSync(journalPath, JSON.stringify(journal));
  const fake = new ChunkedRecoveryS3();
  const config = { baseDir, aws: { region: 'test' } } as any;

  await assert.rejects(
    recoverPublish(config, 'chunked-drill', fake as any),
    /Recovery incomplete.*pages\/page-1000\.html \[InternalError\]/,
  );
  assert.deepEqual(fake.requestSizes, [1000, 1]);
  assert.equal(fake.current.size, 1);
  assert.equal(JSON.parse(readFileSync(journalPath, 'utf8')).state, 'uploading');

  assert.deepEqual(await recoverPublish(config, 'chunked-drill', fake as any), { recovered: 'chunked-drill' });
  assert.deepEqual(fake.requestSizes, [1000, 1, 1000, 1]);
  assert.equal(fake.current.size, 0);
  assert.equal(JSON.parse(readFileSync(journalPath, 'utf8')).state, 'rolled_back');
});
