import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'skills/mobile');
const skill = readFileSync(path.join(root, 'SKILL.md'), 'utf8');
const match = skill.match(/^---\n([\s\S]*?)\n---\n/);
const failures = [];

if (!match) {
  failures.push('SKILL.md must start with YAML frontmatter');
} else {
  const keys = [...match[1].matchAll(/^([a-z_]+):/gm)].map((item) => item[1]);
  if (keys.join(',') !== 'name,description') failures.push('frontmatter must contain only name and description');
  if (!/^name: mobile$/m.test(match[1])) failures.push('skill name must be mobile');
  const description = match[1].match(/^description:\s*(.+)$/m)?.[1] ?? '';
  if (!description.includes('/mobile') || !description.includes('$mobile')) {
    failures.push('description must state the explicit /mobile and $mobile triggers');
  }
}
if (!skill.includes('html-share review watch')) failures.push('skill must include the review watcher');
if (!skill.includes('Do not include secrets')) failures.push('skill must include the secret-handling boundary');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log('mobile skill is valid');
