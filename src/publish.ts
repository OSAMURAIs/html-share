import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildManifest, BuiltPage } from './bundle.js';
import { buildSite } from './bundle.js';
import type { HtmlShareConfig, StackOutputs } from './config.js';
import { loadOutputs, resolveFromConfig } from './config.js';
import { signUrl } from './sign.js';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function files(root: string, current = root): string[] {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(current, entry.name);
    return entry.isDirectory() ? files(root, full) : [path.relative(root, full)];
  });
}

function copyConsole(buildRoot: string, manifest: object): void {
  const consoleRoot = path.join(buildRoot, 'console');
  mkdirSync(consoleRoot, { recursive: true });
  for (const relative of files(path.join(PACKAGE_ROOT, 'web'))) {
    const source = path.join(PACKAGE_ROOT, 'web', relative);
    const target = path.join(consoleRoot, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(source));
  }
  mkdirSync(path.join(consoleRoot, 'app'), { recursive: true });
  writeFileSync(path.join(consoleRoot, 'app', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function emptyBucket(client: S3Client, bucket: string): Promise<void> {
  let continuationToken: string | undefined;
  do {
    const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }));
    const objects = (listed.Contents ?? []).flatMap((item) => item.Key ? [{ Key: item.Key }] : []);
    if (objects.length) await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }));
    continuationToken = listed.NextContinuationToken;
  } while (continuationToken);
}

async function uploadTree(client: S3Client, bucket: string, root: string): Promise<void> {
  await emptyBucket(client, bucket);
  for (const relative of files(root)) {
    const file = path.join(root, relative);
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: relative.split(path.sep).join('/'),
      Body: readFileSync(file),
      ContentType: TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      CacheControl: 'no-store, max-age=0',
    }));
  }
}

function ownerManifest(manifest: BuildManifest, outputs: StackOutputs, config: HtmlShareConfig): object {
  const privateKeyPath = resolveFromConfig(config, config.aws.privateKeyPath);
  return {
    generatedAt: manifest.generatedAt,
    pages: manifest.pages.map((page: BuiltPage) => ({
      slug: page.slug,
      title: page.title,
      updatedAt: page.updatedAt,
      href: signUrl({
        url: `${outputs.ContentUrl}/${page.objectKey}`,
        keyPairId: outputs.CloudFrontPublicKeyId,
        privateKeyPath,
        days: config.content.ownerLinkDays,
      }),
    })),
  };
}

export function buildOnly(config: HtmlShareConfig): { buildRoot: string; manifest: BuildManifest } {
  const buildRoot = path.resolve(config.baseDir, '.html-share', 'build');
  const manifest = buildSite(config, buildRoot);
  copyConsole(buildRoot, { generatedAt: manifest.generatedAt, pages: manifest.pages.map((page) => ({ ...page, href: null })) });
  return { buildRoot, manifest };
}

export async function publish(config: HtmlShareConfig): Promise<{ consoleUrl: string; pages: number }> {
  const outputsFile = path.resolve(config.baseDir, '.html-share', 'outputs.json');
  const outputs = loadOutputs(outputsFile);
  const { buildRoot, manifest } = buildOnly(config);
  copyConsole(buildRoot, ownerManifest(manifest, outputs, config));
  const client = new S3Client({ region: config.aws.region });
  await uploadTree(client, outputs.ContentBucketName, path.join(buildRoot, 'content'));
  await uploadTree(client, outputs.ConsoleBucketName, path.join(buildRoot, 'console'));
  return { consoleUrl: `${outputs.ConsoleUrl}/app/index.html`, pages: manifest.pages.length };
}

export function share(config: HtmlShareConfig, query: string, days: number): string {
  if (days > config.content.maximumShareDays) {
    throw new Error(`Share duration exceeds the configured maximum of ${config.content.maximumShareDays} days`);
  }
  const buildRoot = path.resolve(config.baseDir, '.html-share', 'build');
  const manifest = JSON.parse(readFileSync(path.join(buildRoot, 'manifest.json'), 'utf8')) as BuildManifest;
  const outputs = loadOutputs(path.resolve(config.baseDir, '.html-share', 'outputs.json'));
  const matches = manifest.pages.filter((page) => page.slug === query || page.slug.includes(query) || page.title.includes(query));
  if (matches.length !== 1) throw new Error(matches.length ? `Multiple pages match ${query}: ${matches.map((p) => p.slug).join(', ')}` : `Page not found: ${query}`);
  return signUrl({
    url: `${outputs.ContentUrl}/${matches[0].objectKey}`,
    keyPairId: outputs.CloudFrontPublicKeyId,
    privateKeyPath: resolveFromConfig(config, config.aws.privateKeyPath),
    days,
  });
}
