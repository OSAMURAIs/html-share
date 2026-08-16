(() => {
  'use strict';

  const navigationSlug = (event, frame, currentPage, manifestPages) => {
    if (!event || event.source !== frame.contentWindow || !currentPage) return null;

    let contentOrigin;
    try {
      contentOrigin = new URL(currentPage.href, location.href).origin;
    } catch {
      return null;
    }

    // Content is isolated by the existing CSP `sandbox allow-scripts`. Browsers
    // serialize that opaque sender origin as "null"; source identity remains exact.
    if (event.origin !== contentOrigin && event.origin !== 'null') return null;

    const data = event.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (Object.keys(data).sort().join(',') !== 'slug,token,type') return null;
    if (data.type !== 'html-share:navigate' || typeof data.slug !== 'string') return null;
    if (typeof data.token !== 'string' || data.token !== currentPage.navigationToken) return null;
    return manifestPages.some((page) => page.slug === data.slug) ? data.slug : null;
  };

  window.HtmlShareNavigation = Object.freeze({ navigationSlug });
})();
