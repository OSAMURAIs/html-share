import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const ignored = new Set(['.git', '.html-share', 'dist', 'node_modules']);
const textExtensions = new Set(['', '.css', '.html', '.js', '.json', '.md', '.mjs', '.ts', '.yaml', '.yml']);
const findings = [];
const rules = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['GitHub token', /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['company-specific name or domain', /\b(?:KDDI|KAG(?:-sandbox)?)\b|kddi-agdc\.com/i],
  ['private workstation path', /\/Users\/(?:mi-onda|minorun365)\b/],
  ['private service domain', /(?:^|[^a-z0-9.-])(?:html\.)?minoruonda\.com\b/i],
  ['non-example IPv4 CIDR', /\b(?!(?:192\.0\.2|198\.51\.100|203\.0\.113)\.)(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}\b/],
  ['non-example AWS account ID', /\b(?!(?:111122223333|000000000000)\b)\d{12}\b/],
];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(file);
      continue;
    }
    if (path.resolve(file) === path.resolve(import.meta.dirname, 'security-scan.mjs')) continue;
    if (!entry.isFile() || !textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    if (statSync(file).size > 2 * 1024 * 1024) continue;
    const source = readFileSync(file, 'utf8');
    for (const [label, pattern] of rules) {
      const match = source.match(pattern);
      if (match) findings.push(`${path.relative(root, file)}: ${label} (${match[0]})`);
    }
  }
}

walk(root);
if (findings.length) {
  console.error(findings.join('\n'));
  process.exit(1);
}
console.log('security scan passed');
