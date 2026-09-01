(() => {
  'use strict';

  const LEGACY_DESTINATIONS = Object.freeze({
    home: 'home',
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
    'investment-positions': 'investment.positions',
    'investment-decisions': 'investment.decisions',
    'investment-journal': 'investment.journal',
    'live-work': 'operational.live-work',
  });
  const KNOWN_DESTINATIONS = new Set([
    'home', 'research.overview', 'research.feed', 'research.papers', 'research.knowledge-review',
    'personal.current', 'personal.plans', 'personal.library', 'personal.travel',
    'investment.dashboard', 'investment.pulse', 'investment.positions', 'investment.decisions', 'investment.journal',
    'operational.live-work',
  ]);

  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const routeToken = (value) => {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value, location.href);
      return `${url.pathname}${url.hash}`;
    } catch {
      return value.trim();
    }
  };

  // Presentation profile validity is checked STRUCTURALLY, not against a
  // literal "1": the shell must recognize whichever profile the manifest
  // actually declares (production's v1, or a candidate like v2), not only
  // the profile that existed when this file was first written. A profile
  // that isn't internally coherent (assets outside its own declared
  // asset_base, a page naming a different version than the manifest's own)
  // is still rejected — this only stops assuming there is exactly one valid
  // version string.
  function validPresentation(presentation) {
    return isRecord(presentation) && presentation.contract === 'html-share-v5'
      && typeof presentation.version === 'string' && presentation.version.length > 0
      && presentation.asset_base === `/assets/v5/${presentation.version}`
      && Array.isArray(presentation.assets) && presentation.assets.length > 0
      && presentation.assets.every((asset) => typeof asset === 'string' && asset.startsWith(`${presentation.asset_base}/`));
  }

  function validV2(manifest) {
    if (!isRecord(manifest) || manifest.schema_version !== 2 || typeof manifest.generated_at !== 'string' || !Array.isArray(manifest.pages)) return false;
    if (!validPresentation(manifest.presentation)) return false;
    const ids = new Set();
    return manifest.pages.every((page) => {
      const domain = typeof page?.destination_id === 'string' ? page.destination_id.split('.')[0] : '';
      const expectedArtifactClass = page?.destination_id === 'operational.live-work' ? 'operational_artifact' : 'canonical_static_page';
      if (!isRecord(page) || typeof page.destination_id !== 'string' || !KNOWN_DESTINATIONS.has(page.destination_id)
        || ids.has(page.destination_id) || typeof page.canonical_route !== 'string'
        || page.canonical_route !== canonicalRoute(page.destination_id)
        || !Array.isArray(page.legacy_aliases) || !page.legacy_aliases.every((alias) => typeof alias === 'string')
        || page.domain !== domain || page.artifact_class !== expectedArtifactClass
        || !isRecord(page.labels) || typeof page.labels.primary !== 'string' || typeof page.labels.navigation !== 'string'
        || typeof page.updated_at !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(page.content_id || '')
        || !isRecord(page.access) || page.access.audience !== 'owner' || !['owner_only', 'shareable'].includes(page.access.share_policy)
        || !isRecord(page.search) || typeof page.search.title !== 'string' || !Array.isArray(page.search.terms)
        || !isRecord(page.navigation) || page.navigation.section !== domain || !Number.isInteger(page.navigation.order)
        || !isRecord(page.presentation) || page.presentation.contract !== 'html-share-v5' || page.presentation.version !== manifest.presentation.version
        || typeof page.object_key !== 'string'
        || !page.object_key.startsWith('pages/') || !isRecord(page.access)
        || (page.href !== null && typeof page.href !== 'string')) return false;
      ids.add(page.destination_id);
      return true;
    });
  }

  function validV1(manifest) {
    return isRecord(manifest) && typeof manifest.generatedAt === 'string' && Array.isArray(manifest.pages)
      && manifest.pages.every((page) => isRecord(page) && typeof page.slug === 'string');
  }

  function explicitDestination(page) {
    if (typeof page.destination_id === 'string' && page.destination_id) return page.destination_id;
    if (typeof page.slug === 'string') return LEGACY_DESTINATIONS[page.slug] ?? null;
    return null;
  }

  function canonicalRoute(destinationId) {
    if (!destinationId) return null;
    return `/app/index.html#/${destinationId === 'home' ? 'home' : destinationId.replace('.', '/')}`;
  }

  function normalizeV1Page(page) {
    const destination_id = explicitDestination(page);
    return {
      destination_id,
      canonical_route: canonicalRoute(destination_id),
      legacy_aliases: destination_id ? Object.entries(LEGACY_DESTINATIONS).filter(([, id]) => id === destination_id).map(([alias]) => alias) : [],
      domain: destination_id?.split('.')[0] ?? 'legacy',
      artifact_class: destination_id === 'operational.live-work' ? 'operational_artifact' : 'canonical_static_page',
      labels: { primary: page.title || page.slug, navigation: page.title || page.slug },
      updated_at: page.updatedAt || page.date || page.updated_at || '',
      content_id: null,
      access: { audience: 'owner', share_policy: page.share_policy || 'owner_only' },
      search: { title: page.title || page.slug, terms: [] },
      navigation: { section: destination_id?.split('.')[0] ?? 'legacy', order: 0 },
      presentation: null,
      object_key: page.objectKey || `pages/${page.slug}/index.html`,
      href: typeof page.href === 'string' ? page.href : null,
      slug: page.slug,
      navigationToken: typeof page.navigationToken === 'string' ? page.navigationToken : '',
      title: page.title || page.slug,
      date: page.date || page.updatedAt || '',
      updatedAt: page.updatedAt || page.date || '',
      repository: page.repository || 'legacy',
      stream: page.stream || page.repository || 'legacy',
      streamLabel: page.streamLabel || page.stream || page.repository || 'legacy',
      share_policy: page.share_policy || 'owner_only',
      objectKey: page.objectKey || `pages/${page.slug}/index.html`,
    };
  }

  function normalizeManifests(v2, v1) {
    const v1Pages = validV1(v1) ? v1.pages.map(normalizeV1Page) : [];
    if (!validV2(v2)) {
      if (!v1Pages.length && !validV1(v1)) throw new Error('No valid html-share manifest is available');
      return { source: 'v1', generatedAt: v1.generatedAt, pages: v1Pages };
    }

    const byObjectKey = new Map(v1Pages.map((page) => [page.object_key, page]));
    const byDestination = new Map(v1Pages.filter((page) => page.destination_id).map((page) => [page.destination_id, page]));
    const pages = v2.pages.map((page) => {
      const legacy = byObjectKey.get(page.object_key) ?? byDestination.get(page.destination_id);
      const slug = legacy?.slug || page.legacy_aliases[0] || page.destination_id;
      return {
        ...page,
        slug,
        navigationToken: legacy?.navigationToken || '',
        title: page.labels.primary,
        date: page.updated_at,
        updatedAt: page.updated_at,
        repository: legacy?.repository || page.domain,
        stream: legacy?.stream || page.domain,
        streamLabel: legacy?.streamLabel || page.labels.navigation,
        share_policy: page.access.share_policy,
        objectKey: page.object_key,
        href: typeof page.href === 'string' ? page.href : legacy?.href || null,
      };
    });
    return { source: 'v2', generatedAt: v2.generated_at, pages, manifest: v2 };
  }

  async function getJson(url, cache = 'no-cache') {
    const response = await fetch(url, { cache });
    if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);
    return response.json();
  }

  async function load() {
    const [v2Result, v1Result] = await Promise.allSettled([
      getJson('manifest.v2.json'),
      getJson('manifest.json'),
    ]);
    const v2 = v2Result.status === 'fulfilled' ? v2Result.value : null;
    const v1 = v1Result.status === 'fulfilled' ? v1Result.value : null;
    return normalizeManifests(v2, v1);
  }

  window.HtmlShareManifest = Object.freeze({
    LEGACY_DESTINATIONS,
    validV2,
    validV1,
    normalizeManifests,
    load,
    routeToken,
  });
})();
