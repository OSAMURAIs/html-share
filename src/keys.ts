import { generateKeyPairSync } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { HtmlShareConfig } from './config.js';
import { resolveFromConfig } from './config.js';

export function initializeKeys(config: HtmlShareConfig, overwrite = false): { privateKeyPath: string; publicKeyPath: string } {
  const privateKeyPath = resolveFromConfig(config, config.aws.privateKeyPath);
  const publicKeyPath = resolveFromConfig(config, config.aws.publicKeyPath);
  if (!overwrite && (existsSync(privateKeyPath) || existsSync(publicKeyPath))) {
    throw new Error('Key files already exist. Use --overwrite only when intentionally rotating keys.');
  }
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  mkdirSync(path.dirname(privateKeyPath), { recursive: true, mode: 0o700 });
  mkdirSync(path.dirname(publicKeyPath), { recursive: true, mode: 0o700 });
  writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
  writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });
  chmodSync(privateKeyPath, 0o600);
  return { privateKeyPath, publicKeyPath };
}

export async function storePrivateKey(config: HtmlShareConfig, overwrite = false): Promise<void> {
  const privateKeyPath = resolveFromConfig(config, config.aws.privateKeyPath);
  if (!existsSync(privateKeyPath)) throw new Error('Private key not found. Run `html-share keys init` first.');
  const client = new SSMClient({ region: config.aws.region });
  await client.send(new PutParameterCommand({
    Name: config.aws.privateKeyParameterName,
    Type: 'SecureString',
    Value: readFileSync(privateKeyPath, 'utf8'),
    Overwrite: overwrite,
    Description: 'HTML Share CloudFront signing private key',
  }));
}
