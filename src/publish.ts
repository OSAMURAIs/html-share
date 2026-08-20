import {
  DeleteObjectsCommand,
  GetBucketVersioningCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildManifest, BuiltPage } from './bundle.js';
import { buildSite } from './bundle.js';
import type { HtmlShareConfig, StackOutputs } from './config.js';
import { loadOutputs, resolveFromConfig } from './config.js';
import { signUrl } from './sign.js';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JOURNAL_VERSION = 1;
const TRANSACTION_METADATA = 'html-share-transaction';
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

type VersionRef = { key: string; versionId: string };
type BaselineObject = { key: string; versionId: string | null; deleteMarker: boolean };
type BucketJournal = {
  bucket: string; kind: 'content' | 'console'; desiredKeys: string[]; managedKeys: string[];
  baseline: BaselineObject[]; uploaded: VersionRef[]; cleanup: VersionRef[];
};
type Journal = {
  version: number; transactionId: string; startedAt: string;
  state: 'prepared' | 'uploading' | 'cleaning' | 'verifying' | 'committed' | 'rolled_back';
  buckets: BucketJournal[];
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
  writeFileSync(path.join(consoleRoot, 'app.webmanifest'), `${JSON.stringify({
    name: 'HTML共有くん', short_name: '共有くん', lang: 'ja', start_url: '/app/index.html', scope: '/', display: 'standalone',
    background_color: '#f6f7f9', theme_color: '#0e0d6a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2)}\n`);
}

function journalDir(config: HtmlShareConfig): string {
  return path.resolve(config.baseDir, '.html-share', 'publish-transactions');
}

function saveJournal(config: HtmlShareConfig, journal: Journal): void {
  const dir = journalDir(config);
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${journal.transactionId}.json`);
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, target);
}

function loadJournal(config: HtmlShareConfig, transactionId: string): Journal {
  return JSON.parse(readFileSync(path.join(journalDir(config), `${transactionId}.json`), 'utf8')) as Journal;
}

function normalizeVersionId(versionId: string | undefined): string | null {
  return !versionId || versionId === 'null' ? null : versionId;
}

async function listVersions(client: S3Client, bucket: string): Promise<any[]> {
  const result: any[] = [];
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  do {
    const page = await client.send(new ListObjectVersionsCommand({ Bucket: bucket, KeyMarker: keyMarker, VersionIdMarker: versionIdMarker }));
    for (const item of page.Versions ?? []) result.push({ ...item, deleteMarker: false });
    for (const item of page.DeleteMarkers ?? []) result.push({ ...item, deleteMarker: true });
    keyMarker = page.NextKeyMarker;
    versionIdMarker = page.NextVersionIdMarker;
  } while (keyMarker || versionIdMarker);
  return result;
}

function currentObjects(all: any[]): BaselineObject[] {
  return all.filter((item) => item.IsLatest && item.Key).map((item) => ({
    key: item.Key as string, versionId: normalizeVersionId(item.VersionId), deleteMarker: Boolean(item.deleteMarker),
  }));
}

export function isManagedPublishKey(kind: 'content' | 'console', key: string): boolean {
  if (kind === 'content') return key.startsWith('pages/');
  return key === 'index.html' || key === 'app.webmanifest' || ['app/', 'auth/', 'icons/', 'review/'].some((prefix) => key.startsWith(prefix));
}

export function staleManagedPublishKeys(kind: 'content' | 'console', baselineKeys: string[], desiredKeys: string[]): string[] {
  const desired = new Set(desiredKeys);
  return baselineKeys.filter((key) => isManagedPublishKey(kind, key) && !desired.has(key)).sort();
}

async function requireVersioning(client: S3Client, bucket: string): Promise<void> {
  const status = await client.send(new GetBucketVersioningCommand({ Bucket: bucket }));
  if (status.Status !== 'Enabled') throw new Error(`Rollback safety requires S3 Versioning Enabled for ${bucket}`);
}

function desiredKeys(root: string): string[] {
  return files(root).map((relative) => relative.split(path.sep).join('/')).sort();
}

async function prepareBucket(client: S3Client, bucket: string, kind: BucketJournal['kind'], root: string): Promise<BucketJournal> {
  const baseline = currentObjects(await listVersions(client, bucket));
  const desired = desiredKeys(root);
  return {
    bucket, kind, desiredKeys: desired, managedKeys: baseline.filter((item) => isManagedPublishKey(kind, item.key)).map((item) => item.key).sort(),
    baseline, uploaded: [], cleanup: [],
  };
}

async function uploadTree(client: S3Client, bucket: BucketJournal, root: string, transactionId: string, config: HtmlShareConfig, journal: Journal): Promise<void> {
  journal.state = 'uploading'; saveJournal(config, journal);
  for (const relative of files(root)) {
    const file = path.join(root, relative);
    const key = relative.split(path.sep).join('/');
    const result = await client.send(new PutObjectCommand({
      Bucket: bucket.bucket, Key: key, Body: readFileSync(file), ContentType: TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      CacheControl: 'no-store, max-age=0', Metadata: { [TRANSACTION_METADATA]: transactionId },
    }));
    if (!result.VersionId || result.VersionId === 'null') throw new Error(`S3 did not return a version for ${bucket.bucket}/${key}`);
    bucket.uploaded.push({ key, versionId: result.VersionId });
    saveJournal(config, journal);
  }
}

async function removeStale(client: S3Client, bucket: BucketJournal, config: HtmlShareConfig, journal: Journal): Promise<void> {
  journal.state = 'cleaning'; saveJournal(config, journal);
  const stale = staleManagedPublishKeys(bucket.kind, bucket.managedKeys, bucket.desiredKeys);
  if (!stale.length) return;
  const result = await client.send(new DeleteObjectsCommand({ Bucket: bucket.bucket, Delete: { Objects: stale.map((Key) => ({ Key })) } }));
  for (const item of result.Deleted ?? []) {
    const versionId = item.DeleteMarkerVersionId ?? item.VersionId;
    if (item.Key && versionId && versionId !== 'null') bucket.cleanup.push({ key: item.Key, versionId });
  }
  saveJournal(config, journal);
}

async function verifyCurrent(client: S3Client, bucket: BucketJournal): Promise<void> {
  const current = new Map(currentObjects(await listVersions(client, bucket.bucket)).map((item) => [item.key, item]));
  for (const key of bucket.desiredKeys) {
    const item = current.get(key);
    if (!item || item.deleteMarker) throw new Error(`Published key is not current: ${bucket.bucket}/${key}`);
  }
  for (const key of bucket.managedKeys) if (!bucket.desiredKeys.includes(key) && current.has(key) && !current.get(key)!.deleteMarker) {
    throw new Error(`Stale managed key remains current: ${bucket.bucket}/${key}`);
  }
}

async function deleteRefs(client: S3Client, refs: VersionRef[], bucket: string): Promise<void> {
  if (!refs.length) return;
  await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: refs.map(({ key, versionId }) => ({ Key: key, VersionId: versionId })) } }));
}

async function transactionRefs(client: S3Client, bucket: BucketJournal, journal: Journal): Promise<VersionRef[]> {
  const refs = [...bucket.uploaded, ...bucket.cleanup];
  const known = new Set(refs.map((item) => `${item.key}\0${item.versionId}`));
  const all = await listVersions(client, bucket.bucket);
  for (const item of all.filter((item) => item.VersionId && item.VersionId !== 'null' && item.Key && !known.has(`${item.Key}\0${item.VersionId}`))) {
    if (item.deleteMarker) {
      const stale = !bucket.desiredKeys.includes(item.Key) && bucket.managedKeys.includes(item.Key);
      if (stale && item.IsLatest && item.LastModified && Date.parse(item.LastModified) >= Date.parse(journal.startedAt) - 1000) refs.push({ key: item.Key, versionId: item.VersionId });
      continue;
    }
    if (!bucket.desiredKeys.includes(item.Key)) continue;
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket.bucket, Key: item.Key, VersionId: item.VersionId }));
      if (head.Metadata?.[TRANSACTION_METADATA] === journal.transactionId) refs.push({ key: item.Key, versionId: item.VersionId });
    } catch { /* Delete markers and inaccessible versions are handled by the recorded journal. */ }
  }
  return refs;
}

async function verifyBaseline(client: S3Client, bucket: BucketJournal): Promise<void> {
  const current = new Map(currentObjects(await listVersions(client, bucket.bucket)).map((item) => [item.key, item]));
  const baseline = new Map(bucket.baseline.map((item) => [item.key, item]));
  const keys = new Set([...current.keys(), ...baseline.keys()]);
  for (const key of keys) {
    const actual = current.get(key); const expected = baseline.get(key);
    if (!actual || !expected || actual.deleteMarker !== expected.deleteMarker || actual.versionId !== expected.versionId) {
      throw new Error(`Rollback baseline mismatch for ${bucket.bucket}/${key}`);
    }
  }
}

export async function recoverPublish(config: HtmlShareConfig, transactionId?: string): Promise<{ recovered: string }> {
  const client = new S3Client({ region: config.aws.region });
  const id = transactionId ?? (() => {
    const candidates = readdirSync(journalDir(config), { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
    const active = candidates.map((entry) => loadJournal(config, entry.name.slice(0, -5))).filter((journal) => !['committed', 'rolled_back'].includes(journal.state));
    if (active.length !== 1) throw new Error(active.length ? 'Recovery refused: multiple active publish transactions' : 'No active publish transaction to recover');
    return active[0].transactionId;
  })();
  const journal = loadJournal(config, id);
  if (journal.state === 'committed' || journal.state === 'rolled_back') return { recovered: id };
  for (const bucket of journal.buckets) await requireVersioning(client, bucket.bucket);
  try {
    for (const bucket of journal.buckets) await deleteRefs(client, await transactionRefs(client, bucket, journal), bucket.bucket);
    for (const bucket of journal.buckets) await verifyBaseline(client, bucket);
    journal.state = 'rolled_back'; saveJournal(config, journal);
    return { recovered: id };
  } catch (error) {
    saveJournal(config, journal);
    throw new Error(`Recovery incomplete for ${id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function ownerManifest(manifest: BuildManifest, outputs: StackOutputs, config: HtmlShareConfig): object {
  const privateKeyPath = resolveFromConfig(config, config.aws.privateKeyPath);
  return { generatedAt: manifest.generatedAt, pages: manifest.pages.map((page: BuiltPage) => ({ ...page, href: signUrl({ url: `${outputs.ContentUrl}/${page.objectKey}`, keyPairId: outputs.CloudFrontPublicKeyId, privateKeyPath, days: config.content.ownerLinkDays }) })) };
}

export function buildOnly(config: HtmlShareConfig): { buildRoot: string; manifest: BuildManifest } {
  const buildRoot = path.resolve(config.baseDir, '.html-share', 'build');
  const manifest = buildSite(config, buildRoot);
  copyConsole(buildRoot, { generatedAt: manifest.generatedAt, pages: manifest.pages.map((page) => ({ ...page, href: null })) });
  return { buildRoot, manifest };
}

export async function publish(config: HtmlShareConfig): Promise<{ consoleUrl: string; pages: number; transactionId: string }> {
  const outputs = loadOutputs(path.resolve(config.baseDir, '.html-share', 'outputs.json'));
  const { buildRoot, manifest } = buildOnly(config);
  copyConsole(buildRoot, ownerManifest(manifest, outputs, config));
  const client = new S3Client({ region: config.aws.region });
  const buckets = [
    await prepareBucket(client, outputs.ContentBucketName, 'content', path.join(buildRoot, 'content')),
    await prepareBucket(client, outputs.ConsoleBucketName, 'console', path.join(buildRoot, 'console')),
  ];
  for (const bucket of buckets) await requireVersioning(client, bucket.bucket);
  const journal: Journal = { version: JOURNAL_VERSION, transactionId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, startedAt: new Date().toISOString(), state: 'prepared', buckets };
  saveJournal(config, journal);
  try {
    await uploadTree(client, buckets[0], path.join(buildRoot, 'content'), journal.transactionId, config, journal);
    await uploadTree(client, buckets[1], path.join(buildRoot, 'console'), journal.transactionId, config, journal);
    await removeStale(client, buckets[0], config, journal);
    await removeStale(client, buckets[1], config, journal);
    journal.state = 'verifying'; saveJournal(config, journal);
    for (const bucket of buckets) await verifyCurrent(client, bucket);
    journal.state = 'committed'; saveJournal(config, journal);
    return { consoleUrl: `${outputs.ConsoleUrl}/app/index.html`, pages: manifest.pages.length, transactionId: journal.transactionId };
  } catch (error) {
    try { await recoverPublish(config, journal.transactionId); } catch { /* Leave the journal active for explicit restart recovery. */ }
    throw error;
  }
}

export function share(config: HtmlShareConfig, query: string, days: number): string {
  if (days > config.content.maximumShareDays) throw new Error(`Share duration exceeds the configured maximum of ${config.content.maximumShareDays} days`);
  const buildRoot = path.resolve(config.baseDir, '.html-share', 'build');
  const manifest = JSON.parse(readFileSync(path.join(buildRoot, 'manifest.json'), 'utf8')) as BuildManifest;
  const outputs = loadOutputs(path.resolve(config.baseDir, '.html-share', 'outputs.json'));
  const matches = manifest.pages.filter((page) => page.slug === query || page.slug.includes(query) || page.title.includes(query));
  if (matches.length !== 1) throw new Error(matches.length ? `Multiple pages match ${query}: ${matches.map((p) => p.slug).join(', ')}` : `Page not found: ${query}`);
  return signUrl({ url: `${outputs.ContentUrl}/${matches[0].objectKey}`, keyPairId: outputs.CloudFrontPublicKeyId, privateKeyPath: resolveFromConfig(config, config.aws.privateKeyPath), days });
}
