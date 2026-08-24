import { pathToFileURL } from 'node:url';

const FIELDS = new Set([
  'timestamp', 'browser', 'browserVersion', 'viewport', 'deviceProfile', 'mode', 'scenario',
  'ttfb', 'domContentLoaded', 'load', 'listReady', 'pageReady', 'fcp', 'lcp', 'cls',
  'requestCount', 'transferBytes', 'manifestDuration', 'preferencesApiDuration', 'reviewsApiDuration',
  'documentUrl', 'resourceUrl', 'bfcache', 'pageshow',
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

function sanitizeValue(value, key = '') {
  if (Array.isArray(value)) return undefined;
  if (typeof value === 'string') {
    if (/url/i.test(key)) return safeUrl(value);
    return value.length <= 256 ? value : value.slice(0, 256);
  }
  if (value && typeof value === 'object') {
    const allowedChildren = key === 'bfcache' ? new Set(['persisted', 'restored'])
      : key === 'pageshow' ? new Set(['persisted', 'navigationType']) : FIELDS;
    return Object.fromEntries(Object.entries(value).flatMap(([childKey, childValue]) => {
      if (!allowedChildren.has(childKey)) return [];
      const sanitized = sanitizeValue(childValue, childKey);
      return sanitized === undefined ? [] : [[childKey, sanitized]];
    }));
  }
  return value;
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
