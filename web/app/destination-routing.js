(() => {
  'use strict';

  const token = (value) => {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value, location.href);
      return `${url.pathname}${url.hash}`;
    } catch {
      return value.trim();
    }
  };

  const resolve = (value, manifest) => {
    if (!manifest || !Array.isArray(manifest.pages)) return null;
    if (typeof value === 'string') {
      const identity = manifest.pages.find((page) => page.destination_id === value.trim());
      if (identity) return identity.destination_id;
    }
    const input = token(value);
    for (const page of manifest.pages) {
      if (page.destination_id === input || page.canonical_route === input) return page.destination_id;
      const alias = input.includes('#/') ? input.split('#/').at(-1) : input.replace(/^\/+|\/$/g, '');
      if (Array.isArray(page.legacy_aliases) && page.legacy_aliases.includes(alias)) return page.destination_id;
      if (page.slug === alias && page.destination_id) return page.destination_id;
    }
    return null;
  };

  window.HtmlShareDestinationRouting = Object.freeze({ resolve });
})();
