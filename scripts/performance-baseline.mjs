import { pathToFileURL } from 'node:url';

const FIELDS = new Set([
  'timestamp', 'browser', 'browserVersion', 'viewport', 'deviceProfile', 'mode', 'scenario',
  'ttfb', 'domContentLoaded', 'load', 'listReady', 'pageReady', 'fcp', 'lcp', 'cls',
  'requestCount', 'transferBytes', 'manifestDuration', 'preferencesApiDuration', 'reviewsApiDuration',
  'documentUrl', 'resourceUrl', 'bfcache', 'pageshow',
]);

const NUMERIC_FIELDS = new Set([
  'ttfb', 'domContentLoaded', 'load', 'listReady', 'pageReady', 'fcp', 'lcp', 'cls',
  'requestCount', 'transferBytes', 'manifestDuration', 'preferencesApiDuration', 'reviewsApiDuration',
]);
const BROWSERS = new Set(['Chrome', 'Chromium', 'Edge', 'Firefox', 'Safari']);
const DEVICE_PROFILES = new Set(['desktop', 'desktop-normal-broadband', 'mobile', 'mobile-fast-4g']);
const MODES = new Set(['cold', 'warm']);
const SCENARIOS = new Set([
  'desktop-dashboard', 'desktop-iframe', 'mobile-dashboard', 'mobile-iframe', 'top-level-bfcache',
]);

function safeUrl(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.origin === 'null' ? undefined : `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

function safeViewport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const width = Number(value.width);
  const height = Number(value.height);
  const scale = value.deviceScaleFactor === undefined ? undefined : Number(value.deviceScaleFactor);
  if (!Number.isInteger(width) || width < 1 || width > 10000) return undefined;
  if (!Number.isInteger(height) || height < 1 || height > 10000) return undefined;
  if (scale !== undefined && (!Number.isFinite(scale) || scale <= 0 || scale > 10)) return undefined;
  return { width, height, ...(scale === undefined ? {} : { deviceScaleFactor: scale }) };
}

function safeBooleanObject(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return Object.fromEntries(fields.flatMap((field) => (
    typeof value[field] === 'boolean' ? [[field, value[field]]] : []
  )));
}

function sanitizeValue(value, key) {
  if (key === 'documentUrl' || key === 'resourceUrl') return safeUrl(value);
  if (NUMERIC_FIELDS.has(key)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
    if ((key === 'requestCount' || key === 'transferBytes') && !Number.isInteger(value)) return undefined;
    return value;
  }
  if (key === 'timestamp' && typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
  }
  if (key === 'browser') return BROWSERS.has(value) ? value : undefined;
  if (key === 'browserVersion') return typeof value === 'string' && /^\d+(?:\.\d+){0,4}$/.test(value) ? value : undefined;
  if (key === 'deviceProfile') return DEVICE_PROFILES.has(value) ? value : undefined;
  if (key === 'mode') return MODES.has(value) ? value : undefined;
  if (key === 'scenario') return SCENARIOS.has(value) ? value : undefined;
  if (key === 'viewport') return safeViewport(value);
  if (key === 'bfcache') return safeBooleanObject(value, ['persisted', 'restored']);
  if (key === 'pageshow') {
    const clean = safeBooleanObject(value, ['persisted']);
    if (!clean) return undefined;
    if (['navigate', 'reload', 'back_forward', 'prerender'].includes(value.navigationType)) {
      clean.navigationType = value.navigationType;
    }
    return clean;
  }
  return undefined;
}

export function sanitizeBaselineRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('baseline record must be an object');
  const sanitized = Object.fromEntries(Object.entries(record).flatMap(([key, value]) => {
    if (!FIELDS.has(key)) return [];
    const clean = sanitizeValue(value, key);
    return clean === undefined ? [] : [[key, clean]];
  }));
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) throw new TypeError('baseline record must be an object');
  return sanitized;
}

export function formatBaselineRecord(record) {
  return `${JSON.stringify(sanitizeBaselineRecord(record), null, 2)}\n`;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => process.stdout.write(formatBaselineRecord(JSON.parse(input))));
}
