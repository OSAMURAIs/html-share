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
