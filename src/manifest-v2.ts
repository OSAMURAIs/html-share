import type { BuildManifest, BuiltPage } from './bundle.js';
import {
  LEGACY_ALIASES,
  V5_MANIFEST_VERSION,
  V5_PRESENTATION,
  destinationById,
  type PresentationProfile,
  resolveDestination,
  validateManifestV2,
  type ManifestV2,
  type ManifestV2Page,
} from './v5-contract.js';

function pageV2(page: BuiltPage, href: string | null, profile: PresentationProfile): ManifestV2Page | null {
  const definition = page.v5
    ? destinationById(page.v5.destination_id)
    : resolveDestination(page.slug);
  if (!definition) return null;
  const aliases = Object.entries(LEGACY_ALIASES)
    .filter(([, destinationId]) => destinationId === definition.destination_id)
    .map(([alias]) => alias);
  const contentId = page.v5?.content_id ?? (page.contentHash ? `sha256:${page.contentHash}` : null);
  if (!contentId) throw new Error(`Manifest v2 content identity is missing: ${page.slug}`);
  return {
    destination_id: definition.destination_id,
    canonical_route: definition.canonical_route,
    legacy_aliases: aliases,
    domain: definition.domain,
    artifact_class: definition.artifact_class,
    labels: { primary: page.title || definition.label, navigation: definition.navigation_label },
    updated_at: page.updatedAt,
    content_id: contentId,
    access: { audience: 'owner', share_policy: page.share_policy },
    search: { title: page.title || definition.label, terms: [...definition.search_terms] },
    navigation: { section: definition.domain, order: definition.navigation_order },
    presentation: profile,
    object_key: page.objectKey,
    href,
  };
}

export function buildManifestV2(
  manifest: BuildManifest,
  hrefForPage: (page: BuiltPage) => string | null = () => null,
  profile: PresentationProfile = V5_PRESENTATION,
): ManifestV2 {
  const result: ManifestV2 = {
    schema_version: V5_MANIFEST_VERSION,
    generated_at: manifest.generatedAt,
    presentation: profile,
    pages: manifest.pages.map((page) => pageV2(page, hrefForPage(page), profile)).filter((page): page is ManifestV2Page => page !== null),
  };
  validateManifestV2(result, profile);
  return result;
}
