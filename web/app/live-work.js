(() => {
  'use strict';

  const ELEMENT_ID = 'html-share-live-work-public-summary-v1';
  const MARKER = 'v1';
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const fieldNames = ['title', 'repository', 'agent', 'status', 'current', 'next', 'updated_at'];

  function parse(documentObject) {
    const element = documentObject?.querySelector?.(`#${ELEMENT_ID}[data-html-share-live-work-summary="${MARKER}"]`);
    if (!element) return null;
    let value;
    try { value = JSON.parse(element.textContent || ''); } catch { return null; }
    if (!isObject(value) || value.schema_version !== 1 || !['current', 'stale', 'unknown'].includes(value.freshness)
      || !Array.isArray(value.active) || !Number.isInteger(value.active_count) || value.active_count < 0) return null;
    const active = value.active.filter((item) => isObject(item) && fieldNames.every((name) => typeof item[name] === 'string'));
    if (active.length !== value.active.length || active.length !== value.active_count) return null;
    return { schema_version: 1, freshness: value.freshness, source_updated_at: typeof value.source_updated_at === 'string' ? value.source_updated_at : null, active_count: active.length, active };
  }

  async function read(url, fetchImpl = fetch) {
    const response = await fetchImpl(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Live Work request failed: ${response.status}`);
    const html = await response.text();
    return parse(new DOMParser().parseFromString(html, 'text/html'));
  }

  function render(container, summary, link) {
    if (!container) return;
    container.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = 'Live Work';
    container.append(heading);
    if (!summary || summary.freshness !== 'current') {
      const message = document.createElement('p');
      message.textContent = summary?.freshness === 'stale' ? '最新状況は確認できません。運用ページで確認してください。' : '現在のActive状況は未確認です。';
      container.append(message);
    } else if (summary.active.length === 0) {
      const message = document.createElement('p');
      message.textContent = '現在アクティブな作業はありません。';
      container.append(message);
    } else {
      const list = document.createElement('ul');
      for (const item of summary.active) {
        const entry = document.createElement('li');
        entry.textContent = `${item.title} — ${item.current}`;
        list.append(entry);
      }
      container.append(list);
    }
    if (link) {
      const anchor = document.createElement('a');
      anchor.href = link;
      anchor.textContent = 'Live Workを開く';
      container.append(anchor);
    }
  }

  window.HtmlShareLiveWork = Object.freeze({ ELEMENT_ID, parse, read, render });
})();
