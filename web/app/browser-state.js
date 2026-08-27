(() => {
  'use strict';

  const VERSION = 2;
  const KEY = 'html-share-browser-state-v2';
  const PENDING_KEY = `${KEY}.pending`;
  const LEGACY_KEYS = Object.freeze({ favorites: 'mb_starred_pages', hidden: 'mb_hidden_pages', readMarks: 'mb_read_marks', recent: 'mb_recent_pages' });

  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const validId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 160;
  const emptyState = () => ({ version: VERSION, favorites: [], hidden: [], readMarks: {}, recent: [] });

  function validate(state) {
    if (!isObject(state) || state.version !== VERSION || !Array.isArray(state.favorites) || !Array.isArray(state.hidden)
      || !isObject(state.readMarks) || !Array.isArray(state.recent)) throw new Error('browser state schema is invalid');
    for (const values of [state.favorites, state.hidden, state.recent]) {
      if (!values.every(validId) || new Set(values).size !== values.length) throw new Error('browser state identity is invalid');
    }
    return state;
  }

  function parse(storage, key, fallback) {
    try {
      const raw = storage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function identityMap(pages) {
    const map = new Map();
    for (const page of pages) {
      if (!validId(page.destination_id)) continue;
      map.set(page.destination_id, page.destination_id);
      if (typeof page.slug === 'string') map.set(`slug:${page.slug}`, page.destination_id);
      if (typeof page.objectKey === 'string') map.set(`object:${page.objectKey}`, page.destination_id);
      if (typeof page.object_key === 'string') map.set(`object:${page.object_key}`, page.destination_id);
      for (const alias of page.legacy_aliases ?? []) if (typeof alias === 'string') map.set(`alias:${alias}`, page.destination_id);
    }
    return map;
  }

  function legacyIdentity(value, pages, map) {
    if (!validId(value)) return null;
    if (map.has(value)) return map.get(value);
    if (map.has(`slug:${value}`)) return map.get(`slug:${value}`);
    if (map.has(`object:${value}`)) return map.get(`object:${value}`);
    const alias = value.includes('#/') ? value.split('#/').at(-1) : value.replace(/^\/+|\/$/g, '');
    if (map.has(`alias:${alias}`)) return map.get(`alias:${alias}`);
    return null;
  }

  function convertReadMarks(value, pages, map) {
    if (!isObject(value)) return {};
    const result = {};
    for (const [key, mark] of Object.entries(value)) {
      const destination_id = legacyIdentity(key, pages, map);
      if (!destination_id || !isObject(mark) && typeof mark !== 'string') continue;
      result[destination_id] = mark;
    }
    return result;
  }

  function migrate(storage, pages) {
    const current = parse(storage, KEY, null);
    if (current !== null) return validate(current);
    const map = identityMap(pages);
    const source = emptyState();
    for (const [target, key] of Object.entries(LEGACY_KEYS)) {
      const value = parse(storage, key, target === 'readMarks' ? {} : []);
      if (target === 'readMarks') source.readMarks = convertReadMarks(value, pages, map);
      else if (Array.isArray(value)) source[target] = [...new Set(value.map((item) => legacyIdentity(item, pages, map)).filter(Boolean))];
    }
    validate(source);
    try {
      storage.setItem(PENDING_KEY, JSON.stringify(source));
      validate(JSON.parse(storage.getItem(PENDING_KEY)));
      storage.setItem(KEY, JSON.stringify(source));
      validate(JSON.parse(storage.getItem(KEY)));
      storage.removeItem(PENDING_KEY);
      return source;
    } catch (error) {
      try { storage.removeItem(PENDING_KEY); } catch { /* preserve all legacy state */ }
      throw error;
    }
  }

  function read(storage) {
    const state = parse(storage, KEY, null);
    return state === null ? emptyState() : validate(state);
  }

  function write(storage, state) {
    validate(state);
    const serialized = JSON.stringify(state);
    try {
      storage.setItem(PENDING_KEY, serialized);
      validate(JSON.parse(storage.getItem(PENDING_KEY)));
      storage.setItem(KEY, serialized);
      validate(JSON.parse(storage.getItem(KEY)));
      storage.removeItem(PENDING_KEY);
      return state;
    } catch (error) {
      try { storage.removeItem(PENDING_KEY); } catch { /* preserve the last committed state */ }
      throw error;
    }
  }

  window.HtmlShareBrowserState = Object.freeze({ VERSION, KEY, LEGACY_KEYS, validate, migrate, read, write, emptyState });
})();
