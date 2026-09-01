// Produces the two servable trees the harness captures from.
//
// prototype : the ACTUAL Prototype v5 implementation, served as-is.
// current   : the authoritative current presentation, built locally through the
//             supported local build path (html-share build + HTML_SHARE_PREVIEW_LOCAL).
//             Content comes from the hub's sanitized deterministic fixture preview,
//             so the tree is reproducible and never reads live source.
//
// No production URL, AWS call, or publish step is involved.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const DESTINATIONS = Object.freeze([
  { destination_id: 'home', domain: 'home', route: 'home', prototype: 'index.html', generated: 'home.html', slug: 'home' },
  { destination_id: 'research.overview', domain: 'research', route: 'research/overview', prototype: 'research/index.html', generated: 'research/research-pulse.html', slug: 'research-pulse' },
  { destination_id: 'research.feed', domain: 'research', route: 'research/feed', prototype: 'research/feed.html', generated: 'research/digest-queue.html', slug: 'digest-queue' },
  { destination_id: 'research.papers', domain: 'research', route: 'research/papers', prototype: 'research/papers.html', generated: 'research/paper-queue.html', slug: 'paper-queue' },
  { destination_id: 'research.knowledge-review', domain: 'research', route: 'research/knowledge-review', prototype: 'research/knowledge-review.html', generated: 'research/knowledge-review.html', slug: 'knowledge-review' },
  { destination_id: 'personal.current', domain: 'personal', route: 'personal/current', prototype: 'personal/index.html', generated: 'personal/personal-pulse.html', slug: 'personal-pulse' },
  { destination_id: 'personal.plans', domain: 'personal', route: 'personal/plans', prototype: 'personal/plans.html', generated: 'personal/active-plans.html', slug: 'active-plans' },
  { destination_id: 'personal.library', domain: 'personal', route: 'personal/library', prototype: 'personal/library.html', generated: 'personal/library-focus.html', slug: 'library-focus' },
  { destination_id: 'personal.travel', domain: 'personal', route: 'personal/travel', prototype: 'personal/travel.html', generated: 'personal/trips.html', slug: 'trips' },
  { destination_id: 'investment.dashboard', domain: 'investment', route: 'investment/dashboard', prototype: 'investment/dashboard.html', generated: 'investment/investment-dashboard.html', slug: 'investment-dashboard' },
  { destination_id: 'investment.pulse', domain: 'investment', route: 'investment/pulse', prototype: 'investment/pulse.html', generated: 'investment/investment-pulse.html', slug: 'investment-pulse' },
  { destination_id: 'investment.positions', domain: 'investment', route: 'investment/positions', prototype: 'investment/positions.html', generated: 'investment/investment-positions.html', slug: 'investment-positions' },
  { destination_id: 'investment.decisions', domain: 'investment', route: 'investment/decisions', prototype: 'investment/decisions.html', generated: 'investment/investment-decisions.html', slug: 'investment-decisions' },
  { destination_id: 'investment.journal', domain: 'investment', route: 'investment/journal', prototype: 'investment/journal.html', generated: 'investment/investment-journal.html', slug: 'investment-journal' },
  { destination_id: 'operational.live-work', domain: 'operational', route: 'operational/live-work', prototype: 'live-work.html', generated: 'live-work/live-work.html', slug: 'live-work' },
]);

export const VIEWPORTS = Object.freeze([
  { name: 'desktop', width: 1280, height: 900, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
]);

const PROTOTYPE_CANDIDATES = [
  process.env.HTML_SHARE_VISUAL_PROTOTYPE_ROOT,
  path.resolve('reference/html-share-ui-prototype-v5/html-share-ui-prototype-v5'),
  path.resolve('../html-share/reference/html-share-ui-prototype-v5/html-share-ui-prototype-v5'),
  'C:/Users/starf/Documents/html-share/reference/html-share-ui-prototype-v5/html-share-ui-prototype-v5',
].filter(Boolean);

const HUB_CANDIDATES = [
  process.env.HTML_SHARE_VISUAL_HUB_ROOT,
  path.resolve('../html-share-hub-v0'),
  path.resolve('../html-share-hub'),
].filter(Boolean);

export function resolvePrototypeRoot() {
  const found = PROTOTYPE_CANDIDATES.find((candidate) => existsSync(path.join(candidate, 'index.html')));
  if (!found) {
    throw new Error(`Prototype v5 root not found. Set HTML_SHARE_VISUAL_PROTOTYPE_ROOT. Tried:\n${PROTOTYPE_CANDIDATES.join('\n')}`);
  }
  return found;
}

export function resolveHubRoot() {
  const found = HUB_CANDIDATES.find((candidate) => existsSync(path.join(candidate, 'src/html_share_hub/v5_preview.py')));
  if (!found) throw new Error(`html-share-hub root not found. Set HTML_SHARE_VISUAL_HUB_ROOT. Tried:\n${HUB_CANDIDATES.join('\n')}`);
  return found;
}

function gitCommit(root) {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export function prototypeSide({ prototypeRoot }) {
  const root = prototypeRoot ?? resolvePrototypeRoot();
  for (const destination of DESTINATIONS) {
    const file = path.join(root, destination.prototype);
    if (!existsSync(file)) throw new Error(`Prototype page missing for ${destination.destination_id}: ${file}`);
  }
  return {
    side: 'prototype',
    root,
    routes: [['', root, false]],
    urlFor: (destination) => `/${destination.prototype}`,
    provenance: {
      source_mode: 'prototype_v5_actual_implementation',
      prototype_root: root,
      prototype_commit: gitCommit(root),
      note: 'Served verbatim from the Prototype v5 implementation, including its own fixture JS.',
    },
  };
}

const HARNESS_CONFIG = (generatedRoot, presentationVersion = '1') => [
  '# Generated by scripts/visual/build-sides.mjs for the V0 visual acceptance harness.',
  '# Local build only. No AWS resource is contacted by `html-share build`.',
  'ownerEmail: visual-harness@html-share.invalid',
  '',
  'aws:',
  '  region: ap-northeast-1',
  '  consoleDomain: visual-harness-console.invalid',
  '  contentDomain: visual-harness-content.invalid',
  '  certificateArn: arn:aws:acm:us-east-1:000000000000:certificate/00000000-0000-4000-8000-000000000000',
  '  cognitoDomainPrefix: visual-harness',
  '  publicKeyPath: keys/public.pem',
  '  privateKeyPath: keys/private.pem',
  '  privateKeyParameterName: /visual-harness/cloudfront/private-key',
  '',
  'content:',
  '  roots:',
  `    - ${JSON.stringify(generatedRoot)}`,
  '  pages:',
  ...DESTINATIONS.flatMap((destination) => [
    `    - path: ${JSON.stringify(path.join(generatedRoot, destination.generated))}`,
    `      title: ${destination.destination_id}`,
    `      slug: ${destination.slug}`,
    '      repository: visual-harness',
    `      stream: ${destination.domain}`,
    `      streamLabel: ${destination.domain}`,
    '      share_policy: owner_only',
  ]),
  '  ownerLinkDays: 30',
  '  maximumShareDays: 30',
  '  maximumAssetBytes: 10485760',
  '',
  'presentation:',
  `  profile: ${JSON.stringify(presentationVersion)}`,
  '',
].join('\n');

export function currentSide({
  repoRoot, hubRoot, workDir,
  python = process.env.HTML_SHARE_VISUAL_PYTHON ?? 'python',
  presentationVersion = process.env.HTML_SHARE_VISUAL_PRESENTATION_VERSION ?? '1',
}) {
  const hub = hubRoot ?? resolveHubRoot();
  const staging = path.join(workDir, 'staging');
  const absent = path.join(workDir, 'no-live-source');
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  // Sanitized fixture mode reads no live Research / registry source at all.
  execFileSync(python, [
    '-m', 'html_share_hub.v5_preview',
    '--mode', 'sanitized',
    '--staging', staging,
    '--research-root', absent,
    '--registry-root', absent,
    '--presentation-version', presentationVersion,
  ], { cwd: hub, env: { ...process.env, PYTHONPATH: path.join(hub, 'src') }, stdio: 'pipe', encoding: 'utf8' });

  const generatedRoot = path.join(staging, 'generated');
  for (const destination of DESTINATIONS) {
    const file = path.join(generatedRoot, destination.generated);
    if (!existsSync(file)) throw new Error(`Sanitized preview is missing ${destination.destination_id}: ${file}`);
  }

  const configFile = path.join(workDir, 'visual-harness.config.yaml');
  writeFileSync(configFile, HARNESS_CONFIG(generatedRoot, presentationVersion), 'utf8');
  rmSync(path.join(workDir, '.html-share', 'build'), { recursive: true, force: true });

  const cli = path.join(repoRoot, 'dist/src/cli.js');
  if (!existsSync(cli)) throw new Error(`Build the CLI first (npm run build). Missing: ${cli}`);
  execFileSync(process.execPath, [cli, 'build', '--config', configFile], {
    cwd: repoRoot,
    env: { ...process.env, HTML_SHARE_PREVIEW_LOCAL: '1' },
    stdio: 'pipe',
    encoding: 'utf8',
  });

  const buildRoot = path.join(workDir, '.html-share', 'build');
  const consoleRoot = path.join(buildRoot, 'console');
  const contentRoot = path.join(buildRoot, 'content');
  const previewMode = JSON.parse(readFileSync(path.join(staging, 'preview-mode.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(path.join(consoleRoot, 'app/manifest.v2.json'), 'utf8'));

  return {
    side: 'current',
    root: buildRoot,
    // Mirrors scripts/preview.mjs routing exactly.
    routes: [['/content', contentRoot, true], ['/assets', contentRoot, false], ['', consoleRoot, false]],
    urlFor: (destination) => `/app/index.html#/${destination.route}`,
    provenance: {
      source_mode: 'sanitized_deterministic_fixture_build',
      hub_root: hub,
      hub_commit: gitCommit(hub),
      build_root: buildRoot,
      preview_mode: previewMode,
      presentation: manifest.presentation,
      note: 'Presentation code is the authoritative current implementation, unmodified. '
        + 'Page CONTENT is sanitized hub fixture data, so this baseline proves presentation, NOT live-source completeness.',
    },
  };
}
