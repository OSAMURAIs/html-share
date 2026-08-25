import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteObjectsInBatches, isManagedPublishKey, staleManagedPublishKeys } from '../src/publish.js';

class RecordingDeleteS3 {
  requests: Array<Array<{ Key: string; VersionId?: string }>> = [];
  responseErrors: Array<{ Key: string; Code: string }> = [];

  async send(command: any): Promise<any> {
    assert.equal(command.constructor.name, 'DeleteObjectsCommand');
    const objects = command.input.Delete.Objects as Array<{ Key: string; VersionId?: string }>;
    this.requests.push(objects);
    return { Deleted: objects, Errors: this.responseErrors.splice(0) };
  }
}

const identifiers = (count: number) => Array.from({ length: count }, (_, index) => ({ Key: `pages/page-${index}.html`, VersionId: `version-${index}` }));

test('publisher only considers canonical keys managed and preserves unrelated objects', () => {
  assert.equal(isManagedPublishKey('content', 'pages/old.html'), true);
  assert.equal(isManagedPublishKey('content', 'operator-notes.txt'), false);
  assert.equal(isManagedPublishKey('console', 'app/index.html'), true);
  assert.equal(isManagedPublishKey('console', 'operator-notes.txt'), false);
  assert.deepEqual(
    staleManagedPublishKeys('content', ['pages/old.html', 'operator-notes.txt'], ['pages/new.html']),
    ['pages/old.html'],
  );
});

test('publisher stale-key plan does not remove desired keys', () => {
  assert.deepEqual(
    staleManagedPublishKeys('console', ['app/index.html', 'app/old.js', 'icons/icon-192.png'], ['app/index.html', 'icons/icon-192.png']),
    ['app/old.js'],
  );
});

test('S3 deletion sends exactly 1000 identifiers in one request', async () => {
  const fake = new RecordingDeleteS3();
  await deleteObjectsInBatches(fake as any, 'content', identifiers(1000));
  assert.deepEqual(fake.requests.map((request) => request.length), [1000]);
});

test('S3 deletion splits 1001 identifiers into two requests', async () => {
  const fake = new RecordingDeleteS3();
  await deleteObjectsInBatches(fake as any, 'content', identifiers(1001));
  assert.deepEqual(fake.requests.map((request) => request.length), [1000, 1]);
});

test('S3 deletion keeps every request within the limit for a larger operation', async () => {
  const fake = new RecordingDeleteS3();
  await deleteObjectsInBatches(fake as any, 'content', identifiers(2501));
  assert.deepEqual(fake.requests.map((request) => request.length), [1000, 1000, 501]);
  assert.equal(fake.requests.every((request) => request.length <= 1000), true);
});

test('S3 deletion rejects per-object errors from a resolved response', async () => {
  const fake = new RecordingDeleteS3();
  fake.responseErrors.push({ Key: 'pages/blocked.html', Code: 'AccessDenied' });
  await assert.rejects(
    deleteObjectsInBatches(fake as any, 'content', [{ Key: 'pages/blocked.html' }]),
    /1 object error\(s\).*pages\/blocked\.html \[AccessDenied\]/,
  );
});

test('S3 deletion reports completed chunks before a later chunk fails', async () => {
  const requests: number[] = [];
  const completed: string[] = [];
  const fake = {
    async send(command: any): Promise<any> {
      const objects = command.input.Delete.Objects as Array<{ Key: string; VersionId?: string }>;
      requests.push(objects.length);
      if (requests.length === 2) return { Deleted: [], Errors: [{ Key: objects[0].Key, Code: 'InternalError' }] };
      return { Deleted: objects };
    },
  };

  await assert.rejects(
    deleteObjectsInBatches(fake as any, 'content', identifiers(1001), (deleted) => {
      completed.push(...deleted.flatMap((item) => item.Key ? [item.Key] : []));
    }),
    /pages\/page-1000\.html \[InternalError\]/,
  );
  assert.deepEqual(requests, [1000, 1]);
  assert.equal(completed.length, 1000);
  assert.equal(completed.at(-1), 'pages/page-999.html');
});
