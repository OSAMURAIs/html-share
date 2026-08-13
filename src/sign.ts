import { readFileSync } from 'node:fs';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

export interface SignOptions {
  url: string;
  keyPairId: string;
  privateKeyPath: string;
  days: number;
}

export function signUrl({ url, keyPairId, privateKeyPath, days }: SignOptions): string {
  if (!Number.isInteger(days) || days < 1) throw new Error('days must be a positive integer');
  return getSignedUrl({
    url,
    keyPairId,
    privateKey: readFileSync(privateKeyPath, 'utf8'),
    dateLessThan: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
  });
}
