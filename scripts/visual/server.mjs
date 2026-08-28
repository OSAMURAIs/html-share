// Deterministic local static server for the visual harness.
// Mirrors scripts/preview.mjs routing so the "current" side is served exactly
// the way the supported local preview serves it. No production URL is involved.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

// routes: ordered [prefix, rootDir, stripPrefix] tuples. '' matches everything.
export function startServer(routes) {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    if (pathname === '/api/owner/reviews') {
      response.writeHead(200, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' });
      response.end('{"items":[]}');
      return;
    }
    if (pathname.startsWith('/api/')) {
      response.writeHead(204, { 'cache-control': 'no-store' });
      response.end();
      return;
    }
    const route = routes.find(([prefix]) => prefix === '' || pathname === prefix || pathname.startsWith(`${prefix}/`));
    if (!route) return notFound(response);
    const [prefix, root, strip] = route;
    const relative = strip ? pathname.slice(prefix.length) || '/' : pathname;
    const candidate = path.resolve(root, `.${relative.endsWith('/') ? `${relative}index.html` : relative}`);
    if (!(candidate === root || candidate.startsWith(`${root}${path.sep}`))) return notFound(response);
    if (!existsSync(candidate) || !statSync(candidate).isFile()) return notFound(response);
    response.writeHead(200, {
      'content-type': TYPES[path.extname(candidate).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(readFileSync(candidate));
  });

  const notFound = (response) => {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  };

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ port, origin: `http://127.0.0.1:${port}`, close: () => new Promise((done) => server.close(done)) });
    });
  });
}
