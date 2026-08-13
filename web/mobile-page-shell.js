(() => {
  const script = document.currentScript;
  const currentSlug = script?.dataset.slug ?? '';
  if (!currentSlug || !matchMedia('(max-width: 46rem)').matches) return;

  // 一覧の見た目と描画は page-list.js が唯一の実装。ここへ写しを作らないこと
  const L = window.MyBriefsList;
  if (!L) {
    console.error('page-list.js が読み込まれていないため、ページ一覧を表示できません');
    return;
  }

  const host = document.createElement('div');
  host.id = 'mybriefs-mobile-page-shell';
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `
    <style>${L.styleText(':host')}</style>
    <style>
      :host {
        --blue-deep: #0e0d6a;
        --blue: #0a4695;
        --blue-soft: #eaf2fb;
        --line: #e5e5ea;
        --panel: #fff;
        --ink: #1a1a1f;
        --sub: #45454d;
        --mut: #6b6b73;
        --gold: #f0b21f;
        --gold-deep: #8a5a00;
        --gold-soft: #fdf3d2;
        --blue-line: #cfe0f2;
        --chip: #f0f3f7;
        --danger: #d92d20;
        --blue-grad: linear-gradient(135deg, #0e0d6a 0%, #0a4695 45%, #0862aa 68%, #01b6ec 100%);
        --glass: rgba(255, 255, 255, .78);
        --glass-border: rgba(255, 255, 255, .62);
        --shadow: 0 2px 8px rgba(26, 26, 31, .10), 0 14px 34px rgba(14, 13, 106, .18);
        color: var(--ink);
        font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif;
      }
      *, *::before, *::after { box-sizing: border-box; }
      button, input, select { font: inherit; }
      button { -webkit-tap-highlight-color: transparent; }
      .toolbar {
        position: fixed;
        z-index: 2147483004;
        top: calc(.5rem + env(safe-area-inset-top, 0px));
        left: max(.55rem, env(safe-area-inset-left, 0px));
        right: max(.55rem, env(safe-area-inset-right, 0px));
        display: flex;
        justify-content: space-between;
        pointer-events: none;
        transition: transform .24s ease, opacity .18s ease;
      }
      .toolbar.reading {
        display: none;
      }
      .tool {
        width: 2.75rem;
        height: 2.75rem;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--glass-border);
        border-radius: 50%;
        background: var(--glass);
        color: var(--sub);
        box-shadow: var(--shadow);
        backdrop-filter: blur(22px) saturate(180%);
        -webkit-backdrop-filter: blur(22px) saturate(180%);
        pointer-events: auto;
      }
      .tool svg { width: 1.15rem; height: 1.15rem; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
      .tool.more svg { fill: currentColor; stroke: none; }
      .tool:active { transform: scale(.94); }
      /* display を持つ要素は hidden 属性だけでは隠れないので、明示的に落とす */
      .action-menu[hidden], .share-panel[hidden] { display: none; }
      .action-menu,
      .share-panel {
        position: fixed;
        z-index: 2147483003;
        top: calc(3.65rem + env(safe-area-inset-top, 0px));
        right: max(.55rem, env(safe-area-inset-right, 0px));
        border: 1px solid rgba(28, 35, 51, .10);
        background: rgba(255, 255, 255, .92);
        box-shadow: var(--shadow);
        backdrop-filter: blur(26px) saturate(180%);
        -webkit-backdrop-filter: blur(26px) saturate(180%);
      }
      .action-menu {
        width: min(15rem, calc(100vw - 1.1rem));
        padding: .38rem; border-radius: 1rem;
      }
      .action {
        width: 100%; min-height: 2.75rem; padding: .55rem .7rem;
        display: flex; align-items: center; gap: .7rem;
        border: 0; border-radius: .72rem; background: transparent; color: var(--ink); text-align: left;
      }
      .action + .action { border-top: 1px solid rgba(229, 229, 234, .72); border-radius: 0; }
      .action svg { width: 1.05rem; height: 1.05rem; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .action:active { background: rgba(10, 70, 149, .08); }
      .action.delete { color: var(--danger); }
      .share-panel {
        width: min(21rem, calc(100vw - 1.1rem));
        padding: .75rem; display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, .8fr); gap: .55rem;
        border-radius: 1rem;
      }
      .share-panel label { display: grid; gap: .25rem; color: var(--mut); font-size: .68rem; }
      .share-panel select, .issue {
        min-width: 0; min-height: 2.4rem; padding: .4rem .55rem;
        border: 1px solid var(--line); border-radius: .6rem; background: #f6f7f9; color: var(--ink);
      }
      .issue { grid-column: 1 / -1; border-color: var(--blue); background: var(--blue); color: #fff; font-weight: 600; }
      .issue:disabled { opacity: .72; }
      @media (prefers-reduced-transparency: reduce) {
        .tool, .action-menu, .share-panel { background: #fff; backdrop-filter: none; -webkit-backdrop-filter: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        .toolbar { transition: none; }
      }
    </style>
    <div class="toolbar" aria-label="共有くんのページ操作">
      <button class="tool nav" type="button" aria-label="トップへ戻る" title="トップへ戻る">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.2 12 4.5l8 6.7M6.4 9.6V19h11.2V9.6"/></svg>
      </button>
      <button class="tool more" type="button" aria-label="ページ操作を開く" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
      </button>
    </div>
    <div class="action-menu" role="menu" aria-label="ページ操作" hidden>
      <button class="action refresh" type="button" role="menuitem">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M19 11a7 7 0 1 0 .2 5"/></svg><span>更新</span>
      </button>
      <button class="action share" type="button" role="menuitem">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M8 8l4-4 4 4M5 13v6h14v-6"/></svg><span>共有URLを発行</span>
      </button>
      <button class="action delete" type="button" role="menuitem">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg><span>一覧から削除</span>
      </button>
    </div>
    <div class="share-panel" aria-label="共有URLの発行" hidden>
      <label>公開範囲<select class="scope"><option value="i">社内限定</option><option value="p">IP制限なし</option></select></label>
      <label>有効日数<select class="days"><option>1</option><option>3</option><option selected>7</option><option>14</option><option>30</option><option>90</option></select></label>
      <button class="issue" type="button">発行してコピー</button>
    </div>
  `;

  const $ = (selector) => root.querySelector(selector);
  const toolbar = $('.toolbar');
  const nav = $('.nav');
  const more = $('.more');
  const actionMenu = $('.action-menu');
  const sharePanel = $('.share-panel');
  const issue = $('.issue');
  const STAR_KEY = 'mb_starred_pages';
  const HIDDEN_KEY = 'mb_hidden_pages';
  const READ_KEY = 'mb_read_marks';
  // 開かないまま放置したページが延々と黄色く残らないよう、新着表示はこの日数までに限る
  const NEW_WINDOW_DAYS = 30;
  // 生成HTMLは管理画面と別オリジンで配信するため、端末内の表示設定だけを使う。
  const CAN_SYNC = false;
  let allPages = [];
  let currentPage = null;
  let starredSources = [];
  let hiddenSources = new Set();
  // { ページの source: 開いたときの更新日時 }。更新日時ごと持つので、再更新で自動的に未読へ戻る
  let readMarks = {};
  let knowsReadMarks = false;
  function readList(key, max) {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? '[]');
      return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, max) : [];
    } catch {
      return [];
    }
  }

  function readMarksFromStorage() {
    try {
      const raw = localStorage.getItem(READ_KEY);
      const saved = raw === null ? null : JSON.parse(raw);
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        readMarks = saved;
        knowsReadMarks = true;
      }
    } catch { /* 壊れた保存値は未記録として扱う */ }
  }

  function saveLocalPreferences() {
    try {
      localStorage.setItem(STAR_KEY, JSON.stringify(starredSources));
      localStorage.removeItem('mb_recent_pages');
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hiddenSources]));
      localStorage.setItem(READ_KEY, JSON.stringify(readMarks));
      knowsReadMarks = true;
    } catch { /* noop */ }
  }

  // 既読はMacとスマホで別々に進むので、上書きではなく source ごとに新しい方を残す
  function mergeReadMarks(base, incoming) {
    const merged = { ...base };
    for (const [source, readAt] of Object.entries(incoming ?? {})) {
      if (typeof readAt !== 'string' || Number.isNaN(Date.parse(readAt))) continue;
      const current = merged[source];
      if (!current || Date.parse(readAt) > Date.parse(current)) merged[source] = readAt;
    }
    return merged;
  }

  /** 導入直後に全ページが新着になるのを避け、いま並んでいるぶんは読んだことにする */
  function seedReadMarks() {
    for (const page of allPages) readMarks[page.source] ??= page.date;
  }

  async function sha256(value) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function preferencesApi(options = {}) {
    const body = options.body;
    const headers = { ...(options.headers ?? {}) };
    if (body) {
      headers['content-type'] = 'application/json';
      headers['x-amz-content-sha256'] = await sha256(body);
    }
    const response = await fetch('/api/owner/preferences', { cache: 'no-store', ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? '表示設定の保存に失敗しました');
    return payload;
  }

  async function persistPreferences() {
    saveLocalPreferences();
    if (!CAN_SYNC) return;
    // PUT は項目まるごとの上書きなので、既読も必ず一緒に送る。
    // 省くと保存済みの既読が消え、全ページが新着へ戻ってしまう
    const body = JSON.stringify({
      starredSources,
      recentSources: [],
      hiddenSources: [...hiddenSources],
      readMarks,
    });
    await preferencesApi({ method: 'PUT', body });
  }

  function setToolbarHidden(hidden) {
    if (!actionMenu.hidden || !sharePanel.hidden) hidden = false;
    toolbar.classList.toggle('reading', hidden);
  }

  function closePopovers() {
    actionMenu.hidden = true;
    sharePanel.hidden = true;
    more.setAttribute('aria-expanded', 'false');
  }

  nav.addEventListener('click', () => { location.href = '/app/index.html'; });

  more.addEventListener('click', () => {
    const willOpen = actionMenu.hidden;
    closePopovers();
    actionMenu.hidden = !willOpen;
    more.setAttribute('aria-expanded', String(willOpen));
    setToolbarHidden(false);
  });
  $('.refresh').addEventListener('click', () => location.reload());
  $('.share').addEventListener('click', () => {
    actionMenu.hidden = true;
    sharePanel.hidden = false;
    more.setAttribute('aria-expanded', 'true');
  });
  $('.delete').addEventListener('click', async () => {
    if (!currentPage) return;
    closePopovers();
    if (!confirm(`「${currentPage.title}」を共有くんの一覧から削除します。\n\n原本と発行済みURLは残り、左の「削除済み」から戻せます。`)) return;
    const previousHidden = new Set(hiddenSources);
    const previousStarred = [...starredSources];
    hiddenSources.add(currentPage.source);
    starredSources = starredSources.filter((sourceValue) => sourceValue !== currentPage.source);
    try {
      await persistPreferences();
      location.href = '/';
    } catch (error) {
      hiddenSources = previousHidden;
      starredSources = previousStarred;
      saveLocalPreferences();
      alert(error.message);
    }
  });

  issue.addEventListener('click', async () => {
    if (!currentPage) return;
    const mode = $('.scope').value;
    const days = Number($('.days').value);
    if (
      mode === 'p' &&
      !confirm(`「${currentPage.title}」をIP制限なしで${days}日間共有します。よろしいですか？`)
    ) return;
    issue.disabled = true;
    issue.textContent = '発行中…';
    let generatedUrl = '';
    try {
      const response = await fetch('/api/owner/shares', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: currentPage.slug,
          scope: mode === 'i' ? 'internal' : 'public',
          days,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) throw new Error(payload.error ?? '共有URLを発行できませんでした');
      generatedUrl = payload.url;
      await navigator.clipboard.writeText(generatedUrl);
      issue.textContent = '✓ コピーしました';
    } catch (error) {
      console.error(error);
      issue.textContent = generatedUrl ? 'URLを表示しました' : '発行できませんでした';
      if (generatedUrl) prompt('このURLをコピーしてください', generatedUrl);
    } finally {
      setTimeout(() => {
        issue.disabled = false;
        issue.textContent = '発行してコピー';
      }, 2200);
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (event.composedPath().includes(host)) return;
    closePopovers();
  });
  addEventListener('scroll', () => {
    const nextY = scrollY;
    setToolbarHidden(nextY > 24);
  }, { passive: true });

  starredSources = readList(STAR_KEY, 200);
  hiddenSources = new Set(readList(HIDDEN_KEY, 500));
  readMarksFromStorage();
  const hadLocalReadMarks = knowsReadMarks;

  fetch('/app/manifest.json', { cache: 'no-store' }).then((response) => response.json()).then(async (manifest) => {
    allPages = manifest.pages ?? [];
    const validSources = new Set(allPages.map((page) => page.source));
    hiddenSources = new Set([...hiddenSources].filter((sourceValue) => validSources.has(sourceValue)));
    currentPage = allPages.find((page) => page.slug === currentSlug) ?? null;

    const pruneReadMarks = () => {
      readMarks = Object.fromEntries(
        Object.entries(readMarks).filter(([sourceValue]) => validSources.has(sourceValue)),
      );
    };
    /** 手元にだけある新しい既読印の有無。無ければ書き戻しのPUTを省ける */
    const hasUnsyncedReadMarks = (remoteMarks) => Object.entries(readMarks).some(([sourceValue, readAt]) => {
      const remote = remoteMarks?.[sourceValue];
      return !remote || Date.parse(readAt) > Date.parse(remote);
    });
    let needsPush = false;
    pruneReadMarks();

    if (CAN_SYNC) {
      try {
        const saved = await preferencesApi();
        if (saved.exists) {
          starredSources = (saved.starredSources ?? []).filter((value) => validSources.has(value));
          hiddenSources = new Set((saved.hiddenSources ?? []).filter((value) => validSources.has(value)));
          needsPush = hasUnsyncedReadMarks(saved.readMarks);
          readMarks = mergeReadMarks(readMarks, saved.readMarks ?? {});
          pruneReadMarks();
          // どちらにも既読の記録が無ければ、この機能を使い始めた回。全ページを既読から始める
          if (!hadLocalReadMarks && saved.readMarks === null) {
            seedReadMarks();
            needsPush = true;
          }
        } else {
          if (!hadLocalReadMarks) seedReadMarks();
          needsPush = true;
        }
      } catch (error) {
        console.warn(error);
      }
    } else if (!hadLocalReadMarks) {
      seedReadMarks();
    }

    // いま開いている当のページは読んだ状態にする。トップを経由せず
    // 共有URLやホーム画面から直接来たときも、これで新着が外れる
    if (L.markRead(currentPage, readMarks)) needsPush = true;
    saveLocalPreferences();
    if (needsPush) persistPreferences().catch((error) => console.warn(error));
  }).catch((error) => {
    console.error(error);
  });
})();
