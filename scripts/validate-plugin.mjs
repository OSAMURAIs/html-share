import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const file = path.join(root, '.codex-plugin', 'plugin.json');
const plugin = JSON.parse(readFileSync(file, 'utf8'));
const failures = [];

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(plugin.name ?? '')) failures.push('name must use lowercase kebab-case');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(plugin.version ?? '')) failures.push('version must be semver');
for (const key of ['description', 'homepage', 'repository', 'license']) {
  if (typeof plugin[key] !== 'string' || !plugin[key].trim()) failures.push(`${key} is required`);
}
if (plugin.skills !== './skills/') failures.push('skills must be ./skills/');
if (plugin.interface?.displayName !== 'HTML共有くん') failures.push('interface.displayName must be HTML共有くん');
if (!Array.isArray(plugin.interface?.defaultPrompt) || !plugin.interface.defaultPrompt.some((value) => value.includes('$mobile'))) {
  failures.push('interface.defaultPrompt must demonstrate $mobile');
}
if (!Array.isArray(plugin.interface?.defaultPrompt) || !plugin.interface.defaultPrompt.some((value) => value.includes('$create-html'))) {
  failures.push('interface.defaultPrompt must demonstrate $create-html');
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log('plugin.json is valid');
