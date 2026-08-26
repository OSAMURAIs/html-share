export const V5_MANIFEST_VERSION = 2 as const;

export const V5_PRESENTATION = Object.freeze({
  contract: 'html-share-v5',
  version: '1',
  asset_base: '/assets/v5/1',
  assets: ['/assets/v5/1/presentation.css', '/assets/v5/1/presentation.js'] as const,
});

export const ARTIFACT_CLASSES = Object.freeze({
  canonical: 'canonical_static_page',
  operational: 'operational_artifact',
  alias: 'compatibility_alias',
  asset: 'shared_asset',
  shell: 'browser_shell',
} as const);

export type ArtifactClass = typeof ARTIFACT_CLASSES[keyof typeof ARTIFACT_CLASSES];
export type Domain = 'home' | 'research' | 'personal' | 'investment' | 'operational';

export interface DestinationDefinition {
  destination_id: string;
  domain: Domain;
  artifact_class: typeof ARTIFACT_CLASSES.canonical | typeof ARTIFACT_CLASSES.operational;
  canonical_route: string;
  label: string;
  navigation_label: string;
  navigation_order: number;
  search_terms: readonly string[];
}

const destination = (
  destination_id: string, domain: Domain, artifact_class: DestinationDefinition['artifact_class'],
  route: string, label: string, navigation_order: number, search_terms: readonly string[] = [],
): DestinationDefinition => Object.freeze({
  destination_id, domain, artifact_class,
  canonical_route: `/app/index.html#/${route}`,
  label, navigation_label: label, navigation_order, search_terms,
});

export const V5_DESTINATIONS: readonly DestinationDefinition[] = Object.freeze([
  destination('home', 'home', ARTIFACT_CLASSES.canonical, 'home', 'Home', 0),
  destination('research.overview', 'research', ARTIFACT_CLASSES.canonical, 'research/overview', 'Research Overview', 100),
  destination('research.feed', 'research', ARTIFACT_CLASSES.canonical, 'research/feed', 'Research Feed', 110),
  destination('research.papers', 'research', ARTIFACT_CLASSES.canonical, 'research/papers', 'Research Papers', 120),
  destination('research.knowledge-review', 'research', ARTIFACT_CLASSES.canonical, 'research/knowledge-review', 'Knowledge Review', 130),
  destination('personal.current', 'personal', ARTIFACT_CLASSES.canonical, 'personal/current', 'Personal Current', 200),
  destination('personal.plans', 'personal', ARTIFACT_CLASSES.canonical, 'personal/plans', 'Personal Plans', 210),
  destination('personal.library', 'personal', ARTIFACT_CLASSES.canonical, 'personal/library', 'Personal Library', 220),
  destination('personal.travel', 'personal', ARTIFACT_CLASSES.canonical, 'personal/travel', 'Personal Travel', 230),
  destination('investment.dashboard', 'investment', ARTIFACT_CLASSES.canonical, 'investment/dashboard', 'Investment Dashboard', 300),
  destination('investment.pulse', 'investment', ARTIFACT_CLASSES.canonical, 'investment/pulse', 'Investment Pulse', 310),
  destination('investment.positions', 'investment', ARTIFACT_CLASSES.canonical, 'investment/positions', 'Investment Positions', 320),
  destination('investment.decisions', 'investment', ARTIFACT_CLASSES.canonical, 'investment/decisions', 'Investment Decisions', 330),
  destination('investment.journal', 'investment', ARTIFACT_CLASSES.canonical, 'investment/journal', 'Investment Journal', 340),
  destination('operational.live-work', 'operational', ARTIFACT_CLASSES.operational, 'operational/live-work', 'Live Work', 900),
]);

export const LEGACY_ALIASES = Object.freeze({
  'research-pulse': 'research.overview',
  'digest-queue': 'research.feed',
  'paper-queue': 'research.papers',
  'knowledge-review': 'research.knowledge-review',
  'personal-pulse': 'personal.current',
  'active-plans': 'personal.plans',
  'library-focus': 'personal.library',
  trips: 'personal.travel',
  'investment-pulse': 'investment.pulse',
  positions: 'investment.positions',
  decisions: 'investment.decisions',
  journal: 'investment.journal',
} as const satisfies Record<string, string>);

// Current v1 slugs stay valid until the integration phase. They are inputs,
// never durable identity and never additional canonical destinations.
export const CURRENT_PRODUCTION_INPUTS = Object.freeze({
  ...LEGACY_ALIASES,
  'investment-positions': 'investment.positions',
  'investment-decisions': 'investment.decisions',
  'investment-journal': 'investment.journal',
  'live-work': 'operational.live-work',
} satisfies Record<string, string>);

const byId = new Map(V5_DESTINATIONS.map((item) => [item.destination_id, item]));
const byRoute = new Map(V5_DESTINATIONS.map((item) => [item.canonical_route, item]));

export function destinationById(destinationId: string): DestinationDefinition | null {
  return byId.get(destinationId) ?? null;
}

function routePath(value: string): string {
  try {
    const url = new URL(value, 'https://html-share.invalid');
    return `${url.pathname}${url.hash}`;
  } catch {
    return value;
  }
}

export function resolveDestination(value: string): DestinationDefinition | null {
  const raw = value.trim();
  const byIdentity = byId.get(raw);
  if (byIdentity) return byIdentity;
  const normalized = routePath(raw);
  const direct = byId.get(normalized) ?? byRoute.get(normalized);
  if (direct) return direct;
  const token = normalized.includes('#/') ? normalized.split('#/').at(-1)! : normalized.replace(/^\/+|\/$/g, '');
  const destinationId = CURRENT_PRODUCTION_INPUTS[token as keyof typeof CURRENT_PRODUCTION_INPUTS];
  return destinationId ? byId.get(destinationId) ?? null : null;
}

export interface ClassifiedArtifact {
  path: string;
  artifact_class: ArtifactClass;
  destination_id?: string;
  alias_for?: string;
}

const expectedCanonicalIds = new Set(V5_DESTINATIONS
  .filter((item) => item.artifact_class === ARTIFACT_CLASSES.canonical)
  .map((item) => item.destination_id));
const expectedOperationalIds = new Set(['operational.live-work']);

export function validateTargetV5Topology(artifacts: readonly ClassifiedArtifact[]): void {
  const paths = new Set<string>();
  const canonical = new Set<string>();
  const operational = new Set<string>();
  for (const artifact of artifacts) {
    if (!(Object.values(ARTIFACT_CLASSES) as string[]).includes(artifact.artifact_class)) {
      throw new Error(`unknown artifact_class: ${artifact.artifact_class}`);
    }
    if (paths.has(artifact.path)) throw new Error(`duplicate artifact path: ${artifact.path}`);
    paths.add(artifact.path);
    if (artifact.artifact_class === ARTIFACT_CLASSES.canonical) {
      if (!artifact.destination_id || canonical.has(artifact.destination_id)) throw new Error('duplicate/missing canonical destination_id');
      canonical.add(artifact.destination_id);
    } else if (artifact.artifact_class === ARTIFACT_CLASSES.operational) {
      if (!artifact.destination_id || operational.has(artifact.destination_id)) throw new Error('duplicate/missing operational destination_id');
      operational.add(artifact.destination_id);
    } else if (artifact.artifact_class === ARTIFACT_CLASSES.alias) {
      if (!artifact.alias_for || !byId.has(artifact.alias_for)) throw new Error('compatibility alias has invalid destination');
    } else if (artifact.destination_id) {
      throw new Error(`${artifact.artifact_class} must not carry destination_id`);
    }
  }
  const sameSet = (actual: Set<string>, expected: Set<string>) =>
    actual.size === expected.size && [...expected].every((id) => actual.has(id));
  if (!sameSet(canonical, expectedCanonicalIds)) throw new Error('target topology must contain exactly 14 canonical static destinations');
  if (!sameSet(operational, expectedOperationalIds)) throw new Error('target topology must contain exactly one operational destination');
}

export function targetV5ArtifactFixture(): ClassifiedArtifact[] {
  return [
    ...V5_DESTINATIONS.map((item) => ({
      path: item.canonical_route,
      artifact_class: item.artifact_class,
      destination_id: item.destination_id,
    })),
    ...Object.entries(LEGACY_ALIASES).map(([alias, alias_for]) => ({
      path: `/compat/${alias}`,
      artifact_class: ARTIFACT_CLASSES.alias,
      alias_for,
    })),
    ...V5_PRESENTATION.assets.map((asset) => ({ path: asset, artifact_class: ARTIFACT_CLASSES.asset })),
    { path: '/app/index.html', artifact_class: ARTIFACT_CLASSES.shell },
  ];
}

export interface GeneratedV5Metadata {
  destination_id: string;
  domain: Domain;
  artifact_class: DestinationDefinition['artifact_class'];
  content_id: string;
  presentation_contract: string;
  presentation_version: string;
}

function meta(html: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`<meta\\s+name=["']${escaped}["']\\s+content=["']([^"']+)["']`, 'i'))?.[1] ?? null;
}

export function readGeneratedV5Metadata(html: string): GeneratedV5Metadata | null {
  const destination_id = meta(html, 'html-share:destination-id');
  if (!destination_id) return null;
  const definition = destinationById(destination_id);
  const result = {
    destination_id,
    domain: meta(html, 'html-share:domain'),
    artifact_class: meta(html, 'html-share:artifact-class'),
    content_id: meta(html, 'html-share:content-id'),
    presentation_contract: meta(html, 'html-share:presentation-contract'),
    presentation_version: meta(html, 'html-share:presentation-version'),
  };
  if (!definition || result.domain !== definition.domain || result.artifact_class !== definition.artifact_class
    || !result.content_id?.match(/^sha256:[0-9a-f]{64}$/)
    || result.presentation_contract !== V5_PRESENTATION.contract || result.presentation_version !== V5_PRESENTATION.version) {
    throw new Error(`invalid v5 generated metadata for ${destination_id}`);
  }
  if (!/<(?:main|article)\b/i.test(html)) throw new Error('v5 content must contain semantic static main/article content');
  for (const asset of V5_PRESENTATION.assets) {
    if (!html.includes(asset)) throw new Error(`v5 content is missing managed presentation asset: ${asset}`);
  }
  if (/\b(?:src|href)=["'](?:https?:)?\/\//i.test(html.replace(/<a\b[^>]*>/gi, ''))) {
    throw new Error('v5 presentation dependencies must be same-origin managed assets');
  }
  return result as GeneratedV5Metadata;
}

export interface ManifestV2Page {
  destination_id: string;
  canonical_route: string;
  legacy_aliases: string[];
  domain: Domain;
  artifact_class: DestinationDefinition['artifact_class'];
  labels: { primary: string; navigation: string };
  updated_at: string;
  content_id: string;
  access: { audience: 'owner'; share_policy: 'owner_only' | 'shareable' };
  search: { title: string; terms: string[] };
  navigation: { section: Domain; order: number };
  presentation: typeof V5_PRESENTATION;
  object_key: string;
  href: string | null;
}

export interface ManifestV2 {
  schema_version: typeof V5_MANIFEST_VERSION;
  generated_at: string;
  presentation: typeof V5_PRESENTATION;
  pages: ManifestV2Page[];
}

export function validateManifestV2(manifest: ManifestV2): void {
  if (manifest.schema_version !== V5_MANIFEST_VERSION) throw new Error('Manifest v2 schema_version must be 2');
  if (manifest.presentation.contract !== V5_PRESENTATION.contract || manifest.presentation.version !== V5_PRESENTATION.version) {
    throw new Error('Manifest v2 presentation contract is unsupported');
  }
  const ids = new Set<string>();
  for (const page of manifest.pages) {
    const definition = destinationById(page.destination_id);
    if (!definition || ids.has(page.destination_id)) throw new Error('Manifest v2 destination_id is missing or duplicated');
    ids.add(page.destination_id);
    if (page.canonical_route !== definition.canonical_route || page.domain !== definition.domain || page.artifact_class !== definition.artifact_class) {
      throw new Error(`Manifest v2 destination contract mismatch: ${page.destination_id}`);
    }
    const expectedAliases = Object.entries(LEGACY_ALIASES)
      .filter(([, destinationId]) => destinationId === page.destination_id)
      .map(([alias]) => alias);
    if (JSON.stringify(page.legacy_aliases) !== JSON.stringify(expectedAliases)) throw new Error('Manifest v2 legacy aliases are invalid');
    if (!page.content_id.match(/^sha256:[0-9a-f]{64}$/) || page.access.audience !== 'owner'
      || !['owner_only', 'shareable'].includes(page.access.share_policy)
      || !page.labels?.primary || !page.labels.navigation || !page.search?.title
      || page.navigation?.section !== definition.domain || !Number.isInteger(page.navigation.order)
      || page.presentation?.contract !== V5_PRESENTATION.contract || page.presentation.version !== V5_PRESENTATION.version
      || !page.object_key || !page.object_key.startsWith('pages/')) {
      throw new Error('Manifest v2 required public fields are invalid');
    }
  }
}
