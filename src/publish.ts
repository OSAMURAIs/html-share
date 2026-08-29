import {
  DeleteObjectsCommand,
  GetBucketVersioningCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildManifest, BuiltPage } from './bundle.js';
import { buildSite } from './bundle.js';
import { buildManifestV2 } from './manifest-v2.js';
import type { ManifestV2 } from './v5-contract.js';
import type { HtmlShareConfig, StackOutputs } from './config.js';
import { loadOutputs, resolveFromConfig } from './config.js';
import { signUrl } from './sign.js';

const PACKAGE_ROOT = (() => {
  const fromSource = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  return existsSync(path.join(fromSource, 'web')) ? fromSource : path.resolve(fromSource, '..');
})();
const JOURNAL_VERSION = 1;
const TRANSACTION_METADATA = 'html-share-transaction';
export const JOURNAL_STATES = ['prepared', 'uploading', 'cleaning', 'verifying', 'committed', 'rolled_back', 'superseded'] as const;
// A terminal record is one whose outcome is decided, so the strict verifier may ignore it.
// `committed` succeeded; `rolled_back` was undone in S3; `superseded` was abandoned without
// rollback after being *proven* to own no current production version. Every other state is
// genuinely unresolved and must keep failing the verifier.
export const JOURNAL_TERMINAL_STATES = ['committed', 'rolled_back', 'superseded'] as const;
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

export type VersionRef = { key: string; versionId: string };
type DeleteIdentifier = { Key: string; VersionId?: string };
type DeletedIdentifier = { Key?: string; VersionId?: string; DeleteMarkerVersionId?: string };
type BaselineObject = { key: string; versionId: string | null; deleteMarker: boolean };
export type BucketJournal = {
  bucket: string; kind: 'content' | 'console'; desiredKeys: string[]; managedKeys: string[];
  baseline: BaselineObject[]; uploaded: VersionRef[]; cleanup: VersionRef[];
};
export type JournalState = (typeof JOURNAL_STATES)[number];
// Audit trail for a transaction terminalized without S3 rollback. History is never deleted:
// the original record keeps its buckets, baseline and uploaded refs, and gains the proof that
// justified abandoning it.
export type JournalReconciliation = {
  reconciledAt: string;
  reason: 'superseded-by-later-committed-transaction';
  supersededBy: string;
  stateBefore: JournalState;
  predicates: { id: string; description: string }[];
};
export type PublicationJournal = {
  version: number; transactionId: string; startedAt: string;
  state: JournalState;
  buckets: BucketJournal[];
  reconciliation?: JournalReconciliation;
};

type Journal = PublicationJournal;

export function isTerminalJournalState(state: string): boolean {
  return (JOURNAL_TERMINAL_STATES as readonly string[]).includes(state);
}

export type ProductionCheck = {
  bucket: string;
  kind: 'content' | 'console';
  check: 'versioning' | 'desired-object' | 'stale-object';
  key?: string;
  expectedVersionId?: string;
  actualVersionId?: string | null;
  ok: boolean;
  message: string;
};

export type ProductionVerificationResult = {
  ok: boolean;
  transactionId?: string;
  checks: ProductionCheck[];
};

function files(root: string, current = root): string[] {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(current, entry.name);
    return entry.isDirectory() ? files(root, full) : [path.relative(root, full)];
  });
}

function copyConsole(buildRoot: string, manifest: object, manifestV2: ManifestV2): void {
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
  writeFileSync(path.join(consoleRoot, 'app', 'manifest.v2.json'), `${JSON.stringify(manifestV2, null, 2)}\n`);
  writeFileSync(path.join(consoleRoot, 'app.webmanifest'), `${JSON.stringify({
    name: 'HTML共有くん', short_name: '共有くん', lang: 'ja', start_url: '/app/index.html', scope: '/', display: 'standalone',
    background_color: '#f6f7f9', theme_color: '#172a46',
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
  if (kind === 'content') return key.startsWith('pages/') || key.startsWith('assets/v5/');
  return key === 'index.html' || key === 'app.webmanifest' || ['app/', 'assets/v5/', 'auth/', 'icons/', 'review/'].some((prefix) => key.startsWith(prefix));
}

export function staleManagedPublishKeys(kind: 'content' | 'console', baselineKeys: string[], desiredKeys: string[]): string[] {
  const desired = new Set(desiredKeys);
  return baselineKeys.filter((key) => isManagedPublishKey(kind, key) && !desired.has(key)).sort();
}

async function requireVersioning(client: S3Client, bucket: string): Promise<void> {
  const status = await client.send(new GetBucketVersioningCommand({ Bucket: bucket }));
  if (status.Status !== 'Enabled') throw new Error(`Rollback safety requires S3 Versioning Enabled for ${bucket}`);
}

function journalError(message: string): Error {
  return new Error(`Production verification rejected publication journal: ${message}`);
}

function validateJournal(journal: unknown): asserts journal is Journal {
  if (!journal || typeof journal !== 'object') throw journalError('journal is not an object');
  const candidate = journal as Partial<Journal>;
  if (candidate.version !== JOURNAL_VERSION || typeof candidate.transactionId !== 'string' || !candidate.transactionId
    || typeof candidate.startedAt !== 'string' || !Array.isArray(candidate.buckets)
    || !(JOURNAL_STATES as readonly string[]).includes(candidate.state ?? '')) {
    throw journalError('journal structure is invalid');
  }
  if (candidate.buckets.length !== 2 || new Set(candidate.buckets.map((bucket) => bucket.kind)).size !== 2
    || !candidate.buckets.every((bucket) => bucket && (bucket.kind === 'content' || bucket.kind === 'console')
      && typeof bucket.bucket === 'string' && Array.isArray(bucket.desiredKeys) && Array.isArray(bucket.managedKeys)
      && Array.isArray(bucket.uploaded) && Array.isArray(bucket.cleanup))) {
    throw journalError('journal must contain valid content and console buckets');
  }
  for (const bucket of candidate.buckets) {
    for (const ref of [...bucket.uploaded, ...bucket.cleanup]) {
      if (!ref || typeof ref.key !== 'string' || typeof ref.versionId !== 'string' || !ref.versionId || ref.versionId === 'null') {
        throw journalError('journal contains an invalid VersionId reference');
      }
    }
    if (candidate.state === 'committed') requiredUploadedVersions(bucket);
  }
}

function requiredUploadedVersions(bucket: BucketJournal): Map<string, string> {
  const versions = new Map<string, string>();
  for (const key of bucket.desiredKeys) {
    const refs = bucket.uploaded.filter((ref) => ref.key === key && typeof ref.versionId === 'string'
      && ref.versionId.length > 0 && ref.versionId !== 'null');
    if (refs.length !== 1) {
      throw journalError(`${bucket.kind} desired key ${key} must have exactly one uploaded VersionId`);
    }
    versions.set(key, refs[0].versionId);
  }
  return versions;
}

function readAllJournals(config: HtmlShareConfig): Journal[] {
  if (!existsSync(journalDir(config))) throw journalError('publication journal directory is missing');
  const entries = readdirSync(journalDir(config), { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
  if (!entries.length) throw journalError('publication journal is empty');
  return entries.map((entry) => {
    let parsed: unknown;
    try { parsed = JSON.parse(readFileSync(path.join(journalDir(config), entry.name), 'utf8')); }
    catch { throw journalError(`journal file ${entry.name} is malformed`); }
    validateJournal(parsed);
    return parsed;
  }).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

function readCommittedJournal(config: HtmlShareConfig): Journal {
  const journals = readAllJournals(config);
  const unresolved = journals.filter((journal) => !isTerminalJournalState(journal.state));
  if (unresolved.length) throw journalError('an incomplete publication transaction is unresolved');
  const committed = journals.filter((journal) => journal.state === 'committed');
  if (!committed.length) throw journalError('no committed publication transaction exists');
  return committed.at(-1)!;
}

function desiredKeys(root: string): string[] {
  return files(root).map((relative) => relative.split(path.sep).join('/')).sort();
}

export function cacheControlFor(kind: 'content' | 'console', key: string): string {
  if (kind === 'content' && key.startsWith('assets/v5/1/')) return 'public, max-age=31536000, immutable';
  // Shell, manifests, canonical HTML, and the operational document are
  // mutable owner content. Explicit reload/resume must be able to observe it.
  return 'no-store, max-age=0';
}

const DELETE_OBJECTS_LIMIT = 1000;

export async function deleteObjectsInBatches(
  client: S3Client,
  bucket: string,
  objects: DeleteIdentifier[],
  onDeleted?: (deleted: DeletedIdentifier[]) => void | Promise<void>,
): Promise<void> {
  for (let offset = 0; offset < objects.length; offset += DELETE_OBJECTS_LIMIT) {
    const chunk = objects.slice(offset, offset + DELETE_OBJECTS_LIMIT);
    const result = await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk } }));
    await onDeleted?.(result.Deleted ?? []);
    const errors = result.Errors ?? [];
    if (errors.length) {
      const details = errors.slice(0, 5).map((item) => `${item.Key ?? '(unknown key)'} [${item.Code ?? 'Unknown'}]`).join(', ');
      const remaining = errors.length > 5 ? `, and ${errors.length - 5} more` : '';
      throw new Error(`S3 DeleteObjects reported ${errors.length} object error(s) for ${bucket}: ${details}${remaining}`);
    }
  }
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
      CacheControl: cacheControlFor(bucket.kind, key), Metadata: { [TRANSACTION_METADATA]: transactionId },
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
  await deleteObjectsInBatches(client, bucket.bucket, stale.map((Key) => ({ Key })), (deleted) => {
    for (const item of deleted) {
      const versionId = item.DeleteMarkerVersionId ?? item.VersionId;
      if (item.Key && versionId && versionId !== 'null') bucket.cleanup.push({ key: item.Key, versionId });
    }
    saveJournal(config, journal);
  });
}

export async function verifyCurrent(client: S3Client, bucket: BucketJournal): Promise<void> {
  const expectedVersions = requiredUploadedVersions(bucket);
  const current = new Map(currentObjects(await listVersions(client, bucket.bucket)).map((item) => [item.key, item]));
  for (const key of bucket.desiredKeys) {
    const item = current.get(key);
    if (!item || item.deleteMarker) throw new Error(`Published key is not current: ${bucket.bucket}/${key}`);
    if (item.versionId !== expectedVersions.get(key)) {
      throw new Error(`Published key version mismatch: ${bucket.bucket}/${key}`);
    }
  }
  for (const key of bucket.managedKeys) if (!bucket.desiredKeys.includes(key) && current.has(key) && !current.get(key)!.deleteMarker) {
    throw new Error(`Stale managed key remains current: ${bucket.bucket}/${key}`);
  }
}

export async function verifyProduction(
  config: HtmlShareConfig,
  providedClient?: S3Client,
): Promise<ProductionVerificationResult> {
  const journal = readCommittedJournal(config);
  const client = providedClient ?? new S3Client({ region: config.aws.region });
  const checks: ProductionCheck[] = [];
  for (const bucket of journal.buckets) {
    const expectedVersions = requiredUploadedVersions(bucket);
    try {
      await requireVersioning(client, bucket.bucket);
      checks.push({ bucket: bucket.bucket, kind: bucket.kind, check: 'versioning', ok: true, message: 'S3 Versioning is enabled' });
    } catch (error) {
      checks.push({ bucket: bucket.bucket, kind: bucket.kind, check: 'versioning', ok: false, message: error instanceof Error ? error.message : String(error) });
      continue;
    }
    const current = new Map(currentObjects(await listVersions(client, bucket.bucket)).map((item) => [item.key, item]));
    for (const key of bucket.desiredKeys) {
      const item = current.get(key);
      const expected = expectedVersions.get(key)!;
      const ok = Boolean(item && !item.deleteMarker && item.versionId === expected);
      checks.push({
        bucket: bucket.bucket, kind: bucket.kind, check: 'desired-object', key, expectedVersionId: expected,
        actualVersionId: item?.versionId ?? null, ok,
        message: !item ? 'desired managed object is missing' : item.deleteMarker ? 'desired managed object is a delete marker'
          : item.versionId !== expected ? 'current VersionId does not match the committed VersionId' : 'desired object matches',
      });
    }
    for (const key of staleManagedPublishKeys(bucket.kind, bucket.managedKeys, bucket.desiredKeys)) {
      const item = current.get(key);
      const ok = !item || item.deleteMarker;
      checks.push({ bucket: bucket.bucket, kind: bucket.kind, check: 'stale-object', key, actualVersionId: item?.versionId ?? null, ok,
        message: ok ? 'stale managed object is not current' : 'stale managed object remains current' });
    }
  }
  return { ok: checks.every((check) => check.ok), transactionId: journal.transactionId, checks };
}

export function formatProductionVerification(result: ProductionVerificationResult): string {
  const lines = [`Production verification: ${result.ok ? 'PASS' : 'FAIL'}`];
  if (result.transactionId) lines.push(`Transaction: ${result.transactionId}`);
  for (const check of result.checks) {
    const location = check.key ? `${check.kind}/${check.key}` : check.kind;
    lines.push(`${check.ok ? 'PASS' : 'FAIL'} ${check.check} ${location}: ${check.message}`);
  }
  return lines.join('\n');
}

async function deleteRefs(client: S3Client, refs: VersionRef[], bucket: string): Promise<void> {
  await deleteObjectsInBatches(client, bucket, refs.map(({ key, versionId }) => ({ Key: key, VersionId: versionId })));
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

export async function recoverPublish(config: HtmlShareConfig, transactionId?: string, providedClient?: S3Client): Promise<{ recovered: string }> {
  const client = providedClient ?? new S3Client({ region: config.aws.region });
  const id = transactionId ?? (() => {
    const candidates = readdirSync(journalDir(config), { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
    const active = candidates.map((entry) => loadJournal(config, entry.name.slice(0, -5))).filter((journal) => !isTerminalJournalState(journal.state));
    if (active.length !== 1) throw new Error(active.length ? 'Recovery refused: multiple active publish transactions' : 'No active publish transaction to recover');
    return active[0].transactionId;
  })();
  const journal = loadJournal(config, id);
  if (isTerminalJournalState(journal.state)) return { recovered: id };
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

export type JournalReconciliationResult = {
  reconciled: string;
  supersededBy: string;
  stateBefore: JournalState;
  state: 'superseded';
  predicates: { id: string; description: string }[];
};

function reconciliationRefused(message: string): never {
  throw new Error(`Journal reconciliation refused: ${message}`);
}

/**
 * Terminalize one incomplete transaction that a later committed publication has superseded.
 *
 * This exists for exactly one situation: a publication process died between `verifying` and
 * `committed`, and a subsequent publication then committed over every object it had uploaded.
 * `recoverPublish` cannot resolve that record -- it would delete the stranded transaction's
 * versions and then require the *current* versions to equal that transaction's baseline, which
 * the later commit has already replaced, so it throws `Rollback baseline mismatch` after having
 * already deleted. Leaving the record unresolved instead keeps the strict verifier failing
 * forever even though production is correct.
 *
 * This operation performs no S3 mutation of any kind: it only lists object versions. It never
 * deletes, restores or overwrites content, and it never rewrites history -- the record keeps its
 * buckets, baseline and uploaded refs and gains an audit trail explaining why it was abandoned.
 *
 * It is not a "mark complete" escape hatch. It refuses unless every predicate below holds, and a
 * genuinely unresolved transaction -- one that still owns current production, or has no later
 * committed checkpoint, or is contemporaneous with another incomplete transaction -- keeps
 * failing the verifier.
 *
 * Callers on the trusted host must additionally hold the hub publish lock across this call, so
 * that a worker cannot begin a publication between the checks and the journal write. The
 * journal set is re-read immediately before the write as a second, narrower guard.
 */
export async function reconcileSupersededPublish(
  config: HtmlShareConfig,
  transactionId?: string,
  providedClient?: S3Client,
): Promise<JournalReconciliationResult> {
  const client = providedClient ?? new S3Client({ region: config.aws.region });
  const predicates: { id: string; description: string }[] = [];

  const journals = readAllJournals(config);
  const identities = journals.map((journal) => `${journal.transactionId}:${journal.state}`).sort().join('|');

  // P1 -- the target is incomplete, and it is the only incomplete transaction. A second
  // incomplete record could be a live publication, or could depend on this one, so refuse.
  const unresolved = journals.filter((journal) => !isTerminalJournalState(journal.state));
  if (!unresolved.length) reconciliationRefused('no incomplete publication transaction exists');
  if (unresolved.length > 1) {
    reconciliationRefused(`multiple incomplete publication transactions exist: ${unresolved.map((journal) => journal.transactionId).join(', ')}`);
  }
  const target = unresolved[0];
  if (transactionId && transactionId !== target.transactionId) {
    reconciliationRefused(`${transactionId} is not the incomplete transaction; ${target.transactionId} is`);
  }
  const stateBefore = target.state;
  predicates.push({ id: 'incomplete-target', description: `${target.transactionId} is the only incomplete transaction (state ${stateBefore})` });

  // P2 -- a committed transaction started after it, so the target is not the newest effective
  // production checkpoint.
  const committed = journals.filter((journal) => journal.state === 'committed');
  if (!committed.length) reconciliationRefused('no committed publication transaction exists');
  const checkpoint = committed.at(-1)!;
  if (checkpoint.startedAt <= target.startedAt) {
    reconciliationRefused(`${target.transactionId} is not superseded: no committed transaction started after ${target.startedAt}`);
  }
  predicates.push({ id: 'later-committed-checkpoint', description: `${checkpoint.transactionId} committed after the target (${checkpoint.startedAt})` });

  // P3 -- nothing the target uploaded or deleted is a current version any more, in either
  // bucket. This is what makes rollback both unnecessary and unsafe.
  for (const bucket of target.buckets) {
    const current = new Map(currentObjects(await listVersions(client, bucket.bucket)).map((item) => [item.key, item]));
    const owned = [...bucket.uploaded, ...bucket.cleanup].filter((ref) => current.get(ref.key)?.versionId === ref.versionId);
    if (owned.length) {
      reconciliationRefused(`${target.transactionId} still owns current ${bucket.kind} versions: ${owned.map((ref) => ref.key).join(', ')}`);
    }
  }
  predicates.push({ id: 'fully-superseded', description: 'no uploaded or cleanup version of the target is current in either bucket' });

  // P4 -- production matches the later committed checkpoint exactly. Runs last of the S3
  // checks so a publication landing mid-operation fails this closed rather than slipping past.
  for (const bucket of checkpoint.buckets) {
    try {
      await verifyCurrent(client, bucket);
    } catch (error) {
      reconciliationRefused(`production does not match committed checkpoint ${checkpoint.transactionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  predicates.push({ id: 'production-matches-checkpoint', description: `current production equals ${checkpoint.transactionId} in both buckets` });

  // P5 -- the journal has not changed while the predicates were being proven.
  const after = readAllJournals(config);
  if (after.map((journal) => `${journal.transactionId}:${journal.state}`).sort().join('|') !== identities) {
    reconciliationRefused('the publication journal changed during reconciliation; a publication is likely active');
  }
  predicates.push({ id: 'journal-stable', description: 'the journal set was unchanged across the whole operation' });

  const record = loadJournal(config, target.transactionId);
  record.state = 'superseded';
  record.reconciliation = {
    reconciledAt: new Date().toISOString(),
    reason: 'superseded-by-later-committed-transaction',
    supersededBy: checkpoint.transactionId,
    stateBefore,
    predicates,
  };
  validateJournal(record);
  saveJournal(config, record);
  return { reconciled: target.transactionId, supersededBy: checkpoint.transactionId, stateBefore, state: 'superseded', predicates };
}

export interface PublicManifestPage {
  slug: string;
  navigationToken: string;
  title: string;
  updatedAt: string;
  date: string;
  repository: string;
  stream: string;
  streamLabel: string;
  share_policy: 'owner_only' | 'shareable';
  objectKey: string;
  href: string | null;
}

export function toConsoleManifestPage(page: BuiltPage, href: string | null): PublicManifestPage {
  return {
    slug: page.slug,
    navigationToken: page.navigationToken,
    title: page.title,
    updatedAt: page.updatedAt,
    date: page.date,
    repository: page.repository,
    stream: page.stream,
    streamLabel: page.streamLabel,
    share_policy: page.share_policy,
    objectKey: page.objectKey,
    href,
  };
}

function ownerManifest(manifest: BuildManifest, outputs: StackOutputs, config: HtmlShareConfig): object {
  const privateKeyPath = resolveFromConfig(config, config.aws.privateKeyPath);
  return {
    generatedAt: manifest.generatedAt,
    pages: manifest.pages.map((page: BuiltPage) => toConsoleManifestPage(page, signUrl({
      url: `${outputs.ContentUrl}/${page.objectKey}`,
      keyPairId: outputs.CloudFrontPublicKeyId,
      privateKeyPath,
      days: config.content.ownerLinkDays,
    }))),
  };
}

export function buildOnly(config: HtmlShareConfig): { buildRoot: string; manifest: BuildManifest; manifestV2: ManifestV2 } {
  const buildRoot = path.resolve(config.baseDir, '.html-share', 'build');
  const manifest = buildSite(config, buildRoot);
  const localPreview = process.env.HTML_SHARE_PREVIEW_LOCAL === '1';
  const hrefForPage = (page: BuiltPage): string | null => localPreview ? `/content/${page.objectKey}` : null;
  const manifestV2 = buildManifestV2(manifest);
  const previewManifestV2 = localPreview ? buildManifestV2(manifest, hrefForPage) : manifestV2;
  copyConsole(buildRoot, { generatedAt: manifest.generatedAt, pages: manifest.pages.map((page) => toConsoleManifestPage(page, hrefForPage(page))) }, previewManifestV2);
  return { buildRoot, manifest, manifestV2 };
}

export async function publish(config: HtmlShareConfig): Promise<{ consoleUrl: string; pages: number; transactionId: string }> {
  const outputs = loadOutputs(path.resolve(config.baseDir, '.html-share', 'outputs.json'));
  const { buildRoot, manifest } = buildOnly(config);
  copyConsole(buildRoot, ownerManifest(manifest, outputs, config), buildManifestV2(manifest));
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
