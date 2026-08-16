import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { pair } from '../src/review-client.js';
import type { HtmlShareConfig } from '../src/config.js';

const config = {
  aws: { consoleDomain: 'share.osamurais.com' },
} as HtmlShareConfig;

test('pairing sends the AWS OAC content hash header', async () => {
  const originalFetch = globalThis.fetch;
  let captured: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    captured = init;
    return new Response(JSON.stringify({ error: 'diagnostic' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await assert.rejects(() => pair(config, 'AAAA-AAA', 'test'));
  } finally {
    globalThis.fetch = originalFetch;
  }

  const body = JSON.stringify({ code: 'AAAA-AAA', deviceName: 'test' });
  const headers = captured?.headers as Record<string, string>;
  assert.equal(headers['x-amz-content-sha256'], createHash('sha256').update(body).digest('hex'));
  assert.equal(headers['x-content-sha256'], undefined);
});
