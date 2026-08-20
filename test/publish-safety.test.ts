import assert from 'node:assert/strict';
import test from 'node:test';
import { isManagedPublishKey, staleManagedPublishKeys } from '../src/publish.js';

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
