import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.html-share/build/console');
const port = Number(process.env.HTML_SHARE_PREVIEW_PORT ?? 4311);
const sampleReview = process.env.HTML_SHARE_PREVIEW_SAMPLE_REVIEW === '1';
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  if (pathname === '/api/owner/reviews') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify({
      items: sampleReview ? [{
        id: 'preview-review-1',
        title: 'HTML共有くん OSS公開準備',
        question: 'GitHubへの公開とREADME画像の追加を進めてよいですか？',
        context: '実UIへの統一と、公開不可情報のダミー化が完了しています。',
        recommendation: '公開前テストと秘密情報スキャンを通過済みです。',
        status: 'waiting',
        updatedAt: new Date().toISOString(),
      }] : [],
    }));
    return;
  }
  if (pathname === '/api/owner/pairings' && request.method === 'POST') {
    response.writeHead(201, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end('{"code":"DEMO-2026"}');
    return;
  }
  const candidate = path.resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
  if (!(candidate === root || candidate.startsWith(`${root}${path.sep}`)) || !existsSync(candidate) || !statSync(candidate).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': types[path.extname(candidate).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  response.end(readFileSync(candidate));
}).listen(port, '127.0.0.1', () => {
  console.log(`HTML共有くん preview: http://127.0.0.1:${port}`);
});
