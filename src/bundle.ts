import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HtmlShareConfig, PageConfig } from './config.js';
import { resolveFromConfig, validatedRoots } from './config.js';

function packageRoot(): string {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (directory !== path.dirname(directory)) {
    if (existsSync(path.join(directory, 'package.json'))) return directory;
    directory = path.dirname(directory);
  }
  throw new Error('package.json not found');
}

const MIME: Record<string, string> = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

export interface BuiltPage {
  slug: string;
  navigationToken: string;
  title: string;
  source: string;
  updatedAt: string;
  date: string;
  repository: string;
  stream: string;
  streamLabel: string;
  share_policy: 'owner_only' | 'shareable';
  objectKey: string;
}

export interface BuildManifest {
  generatedAt: string;
  pages: BuiltPage[];
}

export function slugify(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || `page-${createHash('sha256').update(value).digest('hex').slice(0, 8)}`;
}

function inside(file: string, roots: string[]): boolean {
  return roots.some((root) => file === root || file.startsWith(`${root}${path.sep}`));
}

function extractTitle(html: string, fallback: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?? html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return title?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
}

function addMeta(html: string): string {
  const tags = [
    '<meta name="robots" content="noindex, nofollow, noarchive">',
    '<meta name="referrer" content="no-referrer">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  ].filter((tag) => !html.toLowerCase().includes(tag.split(' content=')[0].toLowerCase()));
  if (tags.length === 0) return html;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (head) => `${head}\n${tags.join('\n')}`);
  return `${tags.join('\n')}\n${html}`;
}

function dataUrl(file: string, maxBytes: number): string {
  const extension = path.extname(file).toLowerCase();
  const mime = MIME[extension];
  if (!mime) throw new Error(`Local asset type is not allowed: ${extension || '(none)'}`);
  const stat = statSync(file);
  if (!stat.isFile()) throw new Error(`Local asset is not a file: ${file}`);
  if (stat.size > maxBytes) throw new Error(`Local asset exceeds ${maxBytes} bytes: ${file}`);
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}

export function bundleHtml(sourceFile: string, roots: string[], maxAssetBytes: number): string {
  const source = realpathSync(sourceFile);
  if (!inside(source, roots)) throw new Error(`Page is outside content.roots: ${sourceFile}`);
  const sourceDirectory = path.dirname(source);
  let html = readFileSync(source, 'utf8');
  const reference = /\b(src|href)\s*=\s*(["'])([^"']+)\2/gi;
  html = html.replace(reference, (full, attribute: string, quote: string, raw: string) => {
    const value = raw.trim();
    if (!value || /^(?:https?:|data:|blob:|mailto:|tel:|javascript:|#|\/\/)/i.test(value)) return full;
    const pathname = decodeURIComponent(value.split(/[?#]/, 1)[0]);
    if (path.extname(pathname).toLowerCase() === '.html') return full;
    const candidate = path.resolve(sourceDirectory, pathname);
    if (!existsSync(candidate)) throw new Error(`Local asset not found: ${value} in ${sourceFile}`);
    const resolved = realpathSync(candidate);
    if (!inside(resolved, roots)) throw new Error(`Local asset escapes content.roots: ${value}`);
    return `${attribute}=${quote}${dataUrl(resolved, maxAssetBytes)}${quote}`;
  });
  return injectMobileTables(addMeta(html));
}

function injectMobileTables(html: string): string {
  // 閲覧面は script-src が 'unsafe-inline' data: だけなので、相対パスのJSは読めない。
  // 表の畳み込みはAPIを呼ばない（connect-src 'none' のまま）ので、中身をインラインで埋め込む。
  const source = readFileSync(path.join(packageRoot(), 'web', 'mobile-tables.js'), 'utf8').trim();
  const tag = `<script>${source}</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${tag}\n</body>`);
  return `${html}\n${tag}\n`;
}

interface PageLink {
  href: string;
  slug: string;
}

function isParentMediatedExternalHref(value: string, contentHref: string): boolean {
  try {
    const url = new URL(value, contentHref);
    const contentOrigin = new URL(contentHref).origin;
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== contentOrigin;
  } catch {
    return false;
  }
}

function rewritePageLinks(html: string, sourceFile: string, contentHref: string, pageLinks: Map<string, PageLink>): string {
  const sourceDirectory = path.dirname(sourceFile);
  return html.replace(/<a\b[^>]*>/gi, (anchor) => {
    const generatedAnchor = anchor.replace(/\s+data-html-share-external(?:\s*=\s*(?:["'][^"']*["']|[^\s>]+))?/gi, '');
    const match = generatedAnchor.match(/\bhref\s*=\s*(["'])([^"']+)\1/i);
    if (!match) return generatedAnchor;
    const [hrefAttribute, quote, raw] = match;
    const value = raw.trim();
    if (isParentMediatedExternalHref(value, contentHref)) {
      return generatedAnchor.replace(/>$/, ' data-html-share-external>');
    }
    if (!value || /^(?:https?:|data:|blob:|mailto:|tel:|javascript:|#|\/)/i.test(value)) return generatedAnchor;
    let pathname: string;
    try {
      pathname = decodeURIComponent(value.split(/[?#]/, 1)[0]);
    } catch {
      return generatedAnchor;
    }
    if (path.extname(pathname).toLowerCase() !== '.html') return generatedAnchor;
    const candidate = path.resolve(sourceDirectory, pathname);
    if (!existsSync(candidate)) return generatedAnchor;
    const target = pageLinks.get(realpathSync(candidate));
    if (!target) return generatedAnchor;
    return generatedAnchor
      .replace(hrefAttribute, `href=${quote}${target.href}${quote}`)
      .replace(/\s+target\s*=\s*(?:["']_top["']|_top)(?=\s|>)/gi, '')
      .replace(/\s+data-html-share-page\s*=\s*(?:["'][^"']*["']|[^\s>]+)/gi, '')
      .replace(/>$/, ` data-html-share-page="${target.slug}">`);
  });
}

function injectPageNavigation(html: string, consoleOrigin: string, navigationToken: string): string {
  const script = `<script data-html-share-nav="postmessage-v1">
(() => {
  const consoleOrigin = ${JSON.stringify(consoleOrigin)};
  const navigationToken = ${JSON.stringify(navigationToken)};
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const external = target.closest('a[data-html-share-external]');
    if (external && window.parent !== window) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const url = external.href;
      event.preventDefault();
      window.parent.postMessage({ type: 'html-share:external', url, token: navigationToken }, consoleOrigin);
      return;
    }
    const anchor = target.closest('a[data-html-share-page]');
    if (!anchor || window.parent === window) return;
    const slug = anchor.dataset.htmlSharePage;
    if (!slug) return;
    event.preventDefault();
    window.parent.postMessage({ type: 'html-share:navigate', slug, token: navigationToken }, consoleOrigin);
  });
})();
</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${script}\n</body>`);
  return `${html}\n${script}\n`;
}

function pagePath(config: HtmlShareConfig, page: PageConfig): string {
  const absolute = resolveFromConfig(config, page.path);
  if (!existsSync(absolute)) throw new Error(`Page not found: ${absolute}`);
  return absolute;
}

function defaultGroup(page: PageConfig): string {
  const parent = path.basename(path.dirname(page.path));
  return parent && parent !== '.' ? parent : 'pages';
}

export function buildSite(config: HtmlShareConfig, buildRoot: string): BuildManifest {
  const roots = validatedRoots(config);
  const contentRoot = path.join(buildRoot, 'content');
  const tokenFile = path.join(config.baseDir, '.html-share', 'navigation-tokens.json');
  let savedTokens: Record<string, string> = {};
  if (existsSync(tokenFile)) {
    try {
      const saved = JSON.parse(readFileSync(tokenFile, 'utf8')) as unknown;
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) savedTokens = saved as Record<string, string>;
    } catch { /* An invalid local cache is safely replaced below. */ }
  }
  const nextTokens: Record<string, string> = {};
  rmSync(buildRoot, { recursive: true, force: true });
  mkdirSync(contentRoot, { recursive: true });
  const used = new Set<string>();
  const planned = config.content.pages.map((page) => {
    const sourceReal = realpathSync(pagePath(config, page));
    const fallback = path.basename(sourceReal, path.extname(sourceReal));
    let slug = slugify(page.slug || fallback);
    if (used.has(slug)) slug = `${slug}-${createHash('sha256').update(sourceReal).digest('hex').slice(0, 6)}`;
    used.add(slug);
    const tokenKey = createHash('sha256').update(`${sourceReal}\0${slug}`).digest('hex');
    const savedToken = savedTokens[tokenKey];
    const navigationToken = typeof savedToken === 'string' && /^[A-Za-z0-9_-]{24}$/.test(savedToken)
      ? savedToken
      : randomBytes(18).toString('base64url');
    nextTokens[tokenKey] = navigationToken;
    return { page, sourceReal, fallback, slug, navigationToken };
  });
  mkdirSync(path.dirname(tokenFile), { recursive: true });
  writeFileSync(tokenFile, `${JSON.stringify(nextTokens, null, 2)}\n`, { mode: 0o600 });
  const consoleOrigin = `https://${config.aws.consoleDomain}`;
  const contentOrigin = `https://${config.aws.contentDomain}`;
  const pageLinks = new Map(planned.map(({ sourceReal, slug }) => [sourceReal, {
    href: `${consoleOrigin}/app/index.html#/${slug}`,
    slug,
  }]));
  const pages = planned.map(({ page, sourceReal, fallback, slug, navigationToken }) => {
    const html = injectPageNavigation(
      rewritePageLinks(bundleHtml(sourceReal, roots, config.content.maximumAssetBytes), sourceReal, `${contentOrigin}/pages/${slug}/index.html`, pageLinks),
      consoleOrigin,
      navigationToken,
    );
    const directory = path.join(contentRoot, 'pages', slug);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, 'index.html'), html);
    const updatedAt = statSync(sourceReal).mtime.toISOString();
    const repository = page.repository || defaultGroup(page);
    const stream = page.stream || repository;
    return {
      slug,
      navigationToken,
      title: page.title || extractTitle(html, fallback),
      source: page.path,
      updatedAt,
      date: updatedAt,
      repository,
      stream,
      streamLabel: page.streamLabel || stream,
      share_policy: page.sharePolicy || 'owner_only',
      objectKey: `pages/${slug}/index.html`,
    };
  });
  const manifest = { generatedAt: new Date().toISOString(), pages };
  writeFileSync(path.join(buildRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
