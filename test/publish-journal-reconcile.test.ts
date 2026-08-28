import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { GetBucketVersioningCommand, ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import test from 'node:test';
import { reconcileSupersededPublish, recoverPublish, verifyProduction } from '../src/publish.js';

// A transaction that died between `verifying` and `committed`, and a later transaction that
// committed over every object it had uploaded. `recoverPublish` cannot resolve the first record:
// it deletes that transaction's versions and then requires the current versions to equal its
// baseline, which the later commit already replaced. Leaving it unresolved keeps the strict
// verifier failing even though production is correct.

const CONTENT = 'content-bucket';
const CONSOLE = 'console-bucket';
const config = (baseDir: string) => ({ baseDir, aws: { region: 'ap-northeast-1' } } as any);

type Obj = { Key: string; VersionId: string; IsLatest?: boolean };

/** Read-only fake: any mutating command is a test failure, which is the S3-safety proof. */
class ReadOnlyS3 {
  readonly calls: string[] = [];
  constructor(private readonly objects: Record<string, Obj[]>, private readonly versioning = true) {}
  async send(command: any): Promise<any> {
    const name = command.constructor.name;
    this.calls.push(name);
    if (command instanceof GetBucketVersioningCommand) return { Status: this.versioning ? 'Enabled' : 'Suspended' };
    if (command instanceof ListObjectVersionsCommand) {
      return { Versions: this.objects[command.input.Bucket] ?? [], DeleteMarkers: [] };
    }
    throw new Error(`unexpected command ${name}`);
  }
  get mutated(): boolean {
    return this.calls.some((name) => !['GetBucketVersioningCommand', 'ListObjectVersionsCommand'].includes(name));
  }
}

function buckets(contentVersion: string, consoleVersion: string) {
  return [
    {
      bucket: CONTENT, kind: 'content', desiredKeys: ['pages/a.html'], managedKeys: ['pages/a.html'],
      baseline: [{ key: 'pages/a.html', versionId: 'base-content', deleteMarker: false }],
      uploaded: [{ key: 'pages/a.html', versionId: contentVersion }], cleanup: [],
    },
    {
      bucket: CONSOLE, kind: 'console', desiredKeys: ['index.html'], managedKeys: ['index.html'],
      baseline: [{ key: 'index.html', versionId: 'base-console', deleteMarker: false }],
      uploaded: [{ key: 'index.html', versionId: consoleVersion }], cleanup: [],
    },
  ];
}

function write(baseDir: string, id: string, startedAt: string, state: string, contentVersion: string, consoleVersion: string) {
  const dir = path.join(baseDir, '.html-share', 'publish-transactions');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({
    version: 1, transactionId: id, startedAt, state, buckets: buckets(contentVersion, consoleVersion),
  }, null, 2));
}

function record(baseDir: string, id: string) {
  return JSON.parse(readFileSync(path.join(baseDir, '.html-share', 'publish-transactions', `${id}.json`), 'utf8'));
}

/** The exact production shape: `stranded` verifying, `winner` committed after it. */
function strandedThenCommitted() {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'html-share-reconcile-'));
  write(baseDir, 'stranded', '2026-08-28T13:40:26.717Z', 'verifying', 'stranded-content', 'stranded-console');
  write(baseDir, 'winner', '2026-08-28T14:12:57.083Z', 'committed', 'winner-content', 'winner-console');
  return baseDir;
}

function currentIsWinner(): Record<string, Obj[]> {
  return {
    [CONTENT]: [
      { Key: 'pages/a.html', VersionId: 'winner-content', IsLatest: true },
      { Key: 'pages/a.html', VersionId: 'stranded-content' },
    ],
    [CONSOLE]: [
      { Key: 'index.html', VersionId: 'winner-console', IsLatest: true },
      { Key: 'index.html', VersionId: 'stranded-console' },
    ],
  };
}

test('a superseded incomplete transaction is terminalized without any S3 mutation', async () => {
  const baseDir = strandedThenCommitted();
  const fake = new ReadOnlyS3(currentIsWinner());

  // the strict verifier rejects production while the record is unresolved
  await assert.rejects(
    () => verifyProduction(config(baseDir), fake as any),
    /an incomplete publication transaction is unresolved/,
  );

  const result = await reconcileSupersededPublish(config(baseDir), 'stranded', fake as any);
  assert.equal(result.reconciled, 'stranded');
  assert.equal(result.supersededBy, 'winner');
  assert.equal(result.stateBefore, 'verifying');
  assert.equal(result.state, 'superseded');
  assert.deepEqual(result.predicates.map((item) => item.id), [
    'incomplete-target', 'later-committed-checkpoint', 'fully-superseded',
    'production-matches-checkpoint', 'journal-stable',
  ]);

  // no S3 content was deleted, restored or overwritten
  assert.equal(fake.mutated, false);

  // the terminal state is recorded with an audit trail, and history is preserved
  const after = record(baseDir, 'stranded');
  assert.equal(after.state, 'superseded');
  assert.equal(after.reconciliation.reason, 'superseded-by-later-committed-transaction');
  assert.equal(after.reconciliation.supersededBy, 'winner');
  assert.equal(after.reconciliation.stateBefore, 'verifying');
  assert.ok(after.reconciliation.reconciledAt);
  assert.deepEqual(after.buckets, buckets('stranded-content', 'stranded-console'));
  assert.deepEqual(record(baseDir, 'winner'), {
    version: 1, transactionId: 'winner', startedAt: '2026-08-28T14:12:57.083Z', state: 'committed',
    buckets: buckets('winner-content', 'winner-console'),
  });
  assert.equal(readdirSync(path.join(baseDir, '.html-share', 'publish-transactions')).length, 2);

  // and the strict verifier now passes against the surviving committed checkpoint
  const verified = await verifyProduction(config(baseDir), fake as any);
  assert.equal(verified.ok, true);
  assert.equal(verified.transactionId, 'winner');
});

test('reconciliation without an explicit transaction id selects the only incomplete record', async () => {
  const baseDir = strandedThenCommitted();
  const fake = new ReadOnlyS3(currentIsWinner());
  const result = await reconcileSupersededPublish(config(baseDir), undefined, fake as any);
  assert.equal(result.reconciled, 'stranded');
  assert.equal(fake.mutated, false);
});

test('a superseded record is terminal for rollback recovery too', async () => {
  const baseDir = strandedThenCommitted();
  const fake = new ReadOnlyS3(currentIsWinner());
  await reconcileSupersededPublish(config(baseDir), 'stranded', fake as any);
  // recoverPublish must treat it as decided and never attempt a rollback
  assert.deepEqual(await recoverPublish(config(baseDir), 'stranded', fake as any), { recovered: 'stranded' });
  assert.equal(fake.mutated, false);
  assert.equal(record(baseDir, 'stranded').state, 'superseded');
  // auto-selection now finds nothing active rather than picking the settled record
  await assert.rejects(
    () => recoverPublish(config(baseDir), undefined, fake as any),
    /No active publish transaction to recover/,
  );
});

// ---- every unsafe case must fail closed ----

test('refuses while the incomplete transaction still owns a current version', async () => {
  const baseDir = strandedThenCommitted();
  const objects = currentIsWinner();
  objects[CONTENT] = [
    { Key: 'pages/a.html', VersionId: 'stranded-content', IsLatest: true },
    { Key: 'pages/a.html', VersionId: 'winner-content' },
  ];
  const fake = new ReadOnlyS3(objects);
  await assert.rejects(
    () => reconcileSupersededPublish(config(baseDir), 'stranded', fake as any),
    /still owns current content versions: pages\/a\.html/,
  );
  assert.equal(record(baseDir, 'stranded').state, 'verifying');
  assert.equal(fake.mutated, false);
});

test('refuses while a cleanup delete marker of the incomplete transaction is current', async () => {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'html-share-reconcile-'));
  const dir = path.join(baseDir, '.html-share', 'publish-transactions');
  mkdirSync(dir, { recursive: true });
  const stranded = {
    version: 1, transactionId: 'stranded', startedAt: '2026-08-28T13:40:26.717Z', state: 'cleaning',
    buckets: buckets('stranded-content', 'stranded-console'),
  };
  stranded.buckets[0].cleanup = [{ key: 'pages/removed.html', versionId: 'marker-1' }];
  writeFileSync(path.join(dir, 'stranded.json'), JSON.stringify(stranded, null, 2));
  write(baseDir, 'winner', '2026-08-28T14:12:57.083Z', 'committed', 'winner-content', 'winner-console');

  const objects = currentIsWinner();
  objects[CONTENT] = [
    ...objects[CONTENT],
    { Key: 'pages/removed.html', VersionId: 'marker-1', IsLatest: true },
  ];
  const fake = new ReadOnlyS3(objects);
  await assert.rejects(
    () => reconcileSupersededPublish(config(baseDir), 'stranded', fake as any),
    /still owns current content versions: pages\/removed\.html/,
  );
  assert.equal(record(baseDir, 'stranded').state, 'cleaning');
});

test('refuses when no committed transaction started after the incomplete one', async () => {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'html-share-reconcile-'));
  write(baseDir, 'earlier', '2026-08-28T10:00:00.000Z', 'committed', 'earlier-content', 'earlier-console');
  write(baseDir, 'stranded', '2026-08-28T13:40:26.717Z', 'verifying', 'stranded-content', 'stranded-console');
  const fake = new ReadOnlyS3({
    [CONTENT]: [{ Key: 'pages/a.html', VersionId: 'earlier-content', IsLatest: true }],
    [CONSOLE]: [{ Key: 'index.html', VersionId: 'earlier-console', IsLatest: true }],
  });
  await assert.rejects(
    () => reconcileSupersededPublish(config(baseDir), 'stranded', fake as any),
    /is not superseded: no committed transaction started after/,
  );
  assert.equal(record(baseDir, 'stranded').state, 'verifying');
  assert.equal(fake.mutated, false);
});

test('refuses when there is no committed transaction at all', async () => {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'html-share-reconcile-'));
  write(baseDir, 'stranded', '2026-08-28T13:40:26.717Z', 'verifying', 'stranded-content', 'stranded-console');
  const fake = new ReadOnlyS3(currentIsWinner());
  await assert.rejects(
    () => reconcileSupersededPublish(config(baseDir), 'stranded', fake as any),
    /no committed publication transaction exists/,
  );
  assert.equal(record(baseDir, 'stranded').state, 'verifying');
});

test('refuses when current production differs from the later committed checkpoint', async () => {
  const baseDir = strandedThenCommitted();
  const fake = new ReadOnlyS3({
    // neither the stranded nor the committed versions are current: something else published
    [CONTENT]: [{ Key: 'pages/a.html', VersionId: 'third-party', IsLatest: true }],
    [CONSOLE]: [{ Key: 'index.html', VersionId: 'winner-console', IsLatest: true }],
  });
  await assert.rejects(
    () => reconcileSupersededPublish(config(baseDir), 'stranded', fake as any),
    /production does not match committed checkpoint winner/,
  );
  assert.equal(record(baseDir, 'stranded').state, 'verifying');
  assert.equal(fake.mutated, false);
});

test('refuses when a desired key of the checkpoint is missing from production', async () => {
  const baseDir = strandedThenCommitted();
  const objects = currentIsWinner();
  objects[CONSOLE] = [];
  const fake = new ReadOnlyS3(objects);
  await assert.rejects(
    () => reconcileSupersededPublish(config(baseDir), 'stranded', fake as any),
    /production does not match committed checkpoint winner/,
  );
  assert.equal(record(baseDir, 'stranded').state, 'verifying');
});

test('refuses when another incomplete transaction exists', async () => {
  const baseDir = strandedThenCommitted();
  write(baseDir, 'inflight', '2026-08-28T14:30:00.000Z', 'uploading', 'inflight-content', 'inflight-console');
  const fake = new ReadOnlyS3(currentIsWinner());
  await assert.rejects(
    () => reconcileSupersededPublish(config(baseDir), 'stranded', fake as any),
    /multiple incomplete publication transactions exist/,
  );
  assert.equal(record(baseDir, 'stranded').state, 'verifying');
  assert.equal(record(baseDir, 'inflight').state, 'uploading');
  assert.equal(fake.mutated, false);
});

test('refuses a transaction id that is not the incomplete record', async () => {
  const baseDir = strandedThenCommitted();
  const fake = new ReadOnlyS3(currentIsWinner());
  await assert.rejects(
    () => reconcileSupersededPublish(config(baseDir), 'winner', fake as any),
    /winner is not the incomplete transaction; stranded is/,
  );
  assert.equal(record(baseDir, 'stranded').state, 'verifying');
});

test('refuses when nothing is incomplete', async () => {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'html-share-reconcile-'));
  write(baseDir, 'winner', '2026-08-28T14:12:57.083Z', 'committed', 'winner-content', 'winner-console');
  const fake = new ReadOnlyS3(currentIsWinner());
  await assert.rejects(
    () => reconcileSupersededPublish(config(baseDir), undefined, fake as any),
    /no incomplete publication transaction exists/,
  );
});

test('refuses when the journal changes while predicates are being proven', async () => {
  const baseDir = strandedThenCommitted();
  const objects = currentIsWinner();
  let listed = 0;
  const racing = {
    async send(command: any) {
      if (command instanceof GetBucketVersioningCommand) return { Status: 'Enabled' };
      if (command instanceof ListObjectVersionsCommand) {
        listed += 1;
        // a publication starts after the supersession checks and before the journal write
        if (listed === 3) write(baseDir, 'racer', '2026-08-28T15:00:00.000Z', 'prepared', 'racer-content', 'racer-console');
        return { Versions: objects[command.input.Bucket] ?? [], DeleteMarkers: [] };
      }
      throw new Error(`unexpected command ${command.constructor.name}`);
    },
  };
  await assert.rejects(
    () => reconcileSupersededPublish(config(baseDir), 'stranded', racing as any),
    /the publication journal changed during reconciliation/,
  );
  assert.equal(record(baseDir, 'stranded').state, 'verifying');
});

test('the strict verifier still rejects a genuinely unresolved transaction', async () => {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'html-share-reconcile-'));
  write(baseDir, 'winner', '2026-08-28T14:12:57.083Z', 'committed', 'winner-content', 'winner-console');
  write(baseDir, 'live', '2026-08-28T15:00:00.000Z', 'uploading', 'live-content', 'live-console');
  const fake = new ReadOnlyS3(currentIsWinner());
  await assert.rejects(
    () => verifyProduction(config(baseDir), fake as any),
    /an incomplete publication transaction is unresolved/,
  );
});
