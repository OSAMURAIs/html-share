/**
 * 共有くんの「ページ一覧」の唯一の実装。
 *
 * 一覧は2か所に出る。PCとスマホのトップ画面はダッシュボード本体（index.html）の
 * サイドバー、スマホで個別ページを開いたときは Shadow DOM のドロワー
 * （mobile-page-shell.js）で、遷移先が別文書になるため描画コードを共有できない。
 * 以前は同じUIを2つのコードで書いていたので、片方だけ直すと見た目と機能がずれた。
 *
 * そこで CSS と行の組み立てをこのファイルへ集約し、両者はここを呼ぶだけにしてある。
 * 一覧の見た目・並び・チップ・新着表示を変えるときは、必ずこのファイルだけを直す。
 * 呼び出し側へコピーを作らないこと。
 */
(() => {
  // 一覧が使う色。値そのものはダッシュボードの :root と同じだが、Shadow DOM は
  // 外の :root を継承しない箇所があるため、ここを唯一の出どころにしておく
  const VARS = `
    --line: #e5e5ea;
    --chip: #f0f3f7;
    --blue: #0a4695;
    --blue-deep: #0e0d6a;
    --blue-soft: #eaf2fb;
    --sub: #45454d;
    --ink-faint: #6b6b73;
    --accent: var(--blue);
    --accent-soft: var(--blue-soft);
    --star: #f0b21f;
    --gold-deep: #8a5a00;
  `;

  const CSS = `
    .group {
      padding: .8rem .6rem .3rem;
      display: flex; align-items: center; gap: .55rem;
      font-size: .7rem; font-weight: 700; letter-spacing: .08em;
      color: var(--ink-faint);
    }
    .group::after { content: ""; flex: 1; height: 1px; background: var(--line); }
    .item-wrap { position: relative; }
    .item {
      display: block; width: 100%; text-align: left;
      padding: .55rem 2.55rem .55rem .6rem;
      border: 0; border-radius: .5rem;
      background: none; color: inherit; font: inherit; text-decoration: none;
      cursor: pointer; line-height: 1.4;
    }
    .item[aria-current="true"] { background: var(--accent-soft); }
    .item[aria-current="true"] .t { color: var(--accent); font-weight: 600; }
    .item .t {
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      overflow: hidden; font-size: .85rem;
    }
    .item .m {
      margin-top: .25rem;
      display: flex; align-items: center; gap: .4rem; flex-wrap: wrap;
      font-size: .7rem; color: var(--ink-faint);
    }
    .chip {
      padding: .05rem .4rem; border-radius: .6rem;
      background: var(--blue-soft); color: var(--blue-deep);
    }
    .chip[data-tone="mid"] { background: #e7f1fa; color: var(--blue); }
    .chip[data-tone="bright"] { background: #e7f8fd; color: #04658d; }
    .chip[data-tone="soft"] { background: #f0f3f7; color: var(--sub); }
    /* 新着（まだ開いていない更新）。色だけに頼らず「新着」の2文字も添える */
    .new-flag {
      padding: .05rem .4rem; border-radius: .6rem;
      background: #f7e2a8; color: var(--gold-deep);
      font-size: .66rem; font-weight: 700; letter-spacing: .04em;
    }
    .item-wrap.is-new .item { background: #fff8e6; }
    /* ☆の見た目。位置指定を分けてあるので、トップ画面の行（.row-wrap）も同じ見た目を使える */
    .star {
      width: 2.25rem; height: 2.25rem;
      display: flex; align-items: center; justify-content: center;
      border: 0; border-radius: .45rem;
      background: transparent; color: var(--ink-faint);
      font: inherit; font-size: 1.1rem; line-height: 1;
      cursor: pointer;
      transition: color .16s ease, background .16s ease, transform .16s ease;
      -webkit-tap-highlight-color: transparent;
    }
    .star.on { color: var(--star); }
    .star:active { transform: scale(.82); }
    .item-wrap > .star {
      position: absolute; top: 50%; right: .2rem;
      transform: translateY(-50%);
    }
    .item-wrap > .star:active { transform: translateY(-50%) scale(.82); }
    .restore-list {
      position: absolute; top: 50%; right: .2rem; transform: translateY(-50%);
      min-width: 3.4rem; min-height: 2.25rem; padding: 0 .5rem;
      border: 0; border-radius: .5rem; background: var(--blue-soft); color: var(--blue);
      font: inherit; font-size: .7rem; font-weight: 600; cursor: pointer;
    }
    /* 触って操作する環境ではホバーが残るので、マウスのある環境だけに限る */
    @media (hover: hover) {
      .item:hover { background: var(--chip); }
      .item-wrap.is-new .item:hover { background: #fdf0cd; }
      .star:hover { background: var(--chip); color: var(--star); }
    }
    @media (prefers-reduced-motion: reduce) {
      .star { transition: none; }
    }
  `;

  // ── 日付の扱い。区切りの出し方を端末でずらさないため、ここに1つだけ置く ──
  const jstDate = (value) => {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric',
    }).formatToParts(d);
    const get = (type) => Number(parts.find((part) => part.type === type)?.value);
    return { year: get('year'), month: get('month'), day: get('day') };
  };
  const dayNumber = ({ year, month, day }) => Date.UTC(year, month - 1, day) / 86400000;
  const previousMonth = ({ year, month }) => (month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 });

  function dateGroup(iso, now = new Date()) {
    const date = jstDate(iso);
    const today = jstDate(now);
    if (!date || !today) return '日付不明';

    const daysAgo = dayNumber(today) - dayNumber(date);
    if (daysAgo <= 0) return '今日';
    if (daysAgo === 1) return '昨日';

    // 月曜始まり。今日・昨日は、週の境界よりも分かりやすい専用区切りを優先する。
    const daysSinceMonday = (new Date(dayNumber(today) * 86400000).getUTCDay() + 6) % 7;
    if (daysAgo <= daysSinceMonday) return '今週';
    if (daysAgo <= daysSinceMonday + 7) return '先週';
    if (date.year === today.year && date.month === today.month) return '今月';

    const lastMonth = previousMonth(today);
    if (date.year === lastMonth.year && date.month === lastMonth.month) return '先月';
    return date.year === today.year
      ? `${date.month}月`
      : `${date.year}年${date.month}月`;
  }

  function fmtDateTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(date);
  }

  /**
   * 一覧の行に出す短い更新表示。日付の区切りで大枠は分かるので、行では時刻を優先する。
   * 「更新 2026/08/12 20:03」のフル表記はツールチップ側に残す。
   */
  function shortTime(iso) {
    const date = jstDate(iso);
    const today = jstDate(new Date());
    if (!date || !today) return '';
    const at = new Date(iso);
    const hm = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(at);
    const daysAgo = dayNumber(today) - dayNumber(date);
    if (daysAgo <= 0) return hm;
    if (daysAgo === 1) return `昨日 ${hm}`;
    if (daysAgo < 7) {
      const weekday = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo', weekday: 'short',
      }).format(at);
      return `${weekday}曜 ${hm}`;
    }
    return `${date.month}/${date.day}`;
  }

  // 開かないまま放置したページが延々と黄色く残らないよう、新着表示はこの日数までに限る
  const NEW_WINDOW_DAYS = 30;

  const pageRepository = (page) => page.repository ?? page.category ?? 'unknown';

  const repositoryTone = (repository = '') => {
    const hash = [...repository].reduce((value, char) => value * 31 + char.charCodeAt(0), 0);
    return ['deep', 'mid', 'bright', 'soft'][Math.abs(hash) % 4];
  };

  // 一度も開いていない、または開いたあとに元HTMLが更新されたページ
  const isUnread = (page, readMarks = {}) => {
    const readAt = readMarks[page.source];
    if (!readAt) return true;
    return Date.parse(page.date) > Date.parse(readAt);
  };

  const isNew = (page, readMarks = {}) => {
    if (!isUnread(page, readMarks)) return false;
    const updated = Date.parse(page.date);
    return Number.isFinite(updated) && Date.now() - updated < NEW_WINDOW_DAYS * 86400000;
  };

  /** そのページを「今の版で読んだ」ことにする。次に元HTMLが更新されれば再び新着に戻る */
  function markRead(page, readMarks) {
    if (!page || !isUnread(page, readMarks)) return false;
    readMarks[page.source] = page.date;
    return true;
  }

  /**
   * スターの☆ボタン。サイドバー・ドロワー・トップ画面の行が共通で使う。
   * 位置と大きさだけは、置く側が `.item-wrap > .star` のように詳しく書いて調整する。
   */
  function starButton(page, { starred, onToggle }) {
    const button = document.createElement('button');
    const on = starred.has(page.source);
    button.className = `star${on ? ' on' : ''}`;
    button.type = 'button';
    button.textContent = on ? '★' : '☆';
    button.title = on ? 'スターを外す' : 'スターを付ける';
    button.setAttribute('aria-label', `${page.title}の${button.title}`);
    button.setAttribute('aria-pressed', String(on));
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onToggle?.(page);
    });
    return button;
  }

  /** そのページ自身のURL。⌘クリックで別タブへ開くときの行き先になる */
  const pageUrl = (page) => new URL(page.href, `${location.origin}/`).toString();

  /**
   * 行を「開く」動作に結ぶ。行を button ではなく a で作るのは、⌘/Ctrl クリック・中クリック・
   * 右クリックの「新しいタブで開く」をブラウザ本来の動きに任せるため。
   * 修飾キーなしの左クリックだけ横取りして、これまでどおり画面内で開く。
   */
  function bindOpen(anchor, page, onOpen) {
    anchor.href = pageUrl(page);
    anchor.addEventListener('click', (event) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onOpen?.(page);
    });
  }

  /** 一覧の1行に出す補足（新着・リポジトリ・更新日時・共有中の印） */
  function metaRow(page, readMarks) {
    const meta = document.createElement('div');
    meta.className = 'm';
    if (isNew(page, readMarks)) {
      const flag = document.createElement('span');
      flag.className = 'new-flag';
      flag.textContent = '新着';
      meta.append(flag);
    }
    const repository = pageRepository(page);
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = repository;
    chip.dataset.tone = repositoryTone(repository);
    const when = document.createElement('time');
    when.dateTime = page.date;
    when.textContent = `更新 ${fmtDateTime(page.date)}`;
    meta.append(chip, when);
    if (page.sharedHref) {
      const mark = document.createElement('span');
      const isOpen = page.shareMode === 'public';
      mark.textContent = isOpen ? '🌐' : '🔗';
      mark.title = isOpen ? 'IP制限なしで公開中' : '社内IP限定の共有リンクあり';
      meta.append(mark);
    }
    return meta;
  }

  /**
   * 一覧をまるごと描き直す。PCのサイドバーもスマホのドロワーもこの1本を呼ぶ。
   *
   * @param {object} options
   * @param {Element} options.container 描画先（中身は毎回置き換える）
   * @param {Array}   options.pages     表示候補（削除済み表示のときは削除済みだけを渡す）
   * @param {string}  [options.filter]  絞り込み文字列
   * @param {boolean} [options.showingTrash] 削除済み表示か
   * @param {string}  [options.currentSlug]  いま開いているページ
   * @param {Set}     options.starred   スター付きの source
   * @param {object}  [options.readMarks]    既読の記録
   * @param {Function} options.onOpen        行を押したとき
   * @param {Function} [options.onToggleStar] ☆を押したとき
   * @param {Function} [options.onRestore]    「戻す」を押したとき
   */
  function render(options) {
    const {
      container, pages, filter = '', showingTrash = false,
      currentSlug = null, starred = new Set(), readMarks = {},
      onOpen, onToggleStar, onRestore,
    } = options;

    const needle = filter.trim().toLowerCase();
    const hits = needle
      ? pages.filter((page) => `${page.title} ${pageRepository(page)} ${page.source}`
        .toLowerCase().includes(needle))
      : pages;

    container.replaceChildren();
    if (hits.length === 0) {
      const none = document.createElement('div');
      none.className = 'group';
      none.textContent = showingTrash ? '削除済みページはありません' : '該当なし';
      container.append(none);
      return;
    }

    const isStarred = (page) => starred.has(page.source);
    const ordered = showingTrash
      ? hits
      : [...hits.filter(isStarred), ...hits.filter((page) => !isStarred(page))];

    let group = null;
    for (const page of ordered) {
      const key = showingTrash
        ? '削除済み'
        : (isStarred(page) ? 'スター' : dateGroup(page.date));
      if (key !== group) {
        group = key;
        const head = document.createElement('div');
        head.className = 'group';
        head.textContent = key;
        container.append(head);
      }

      const wrap = document.createElement('div');
      wrap.className = `item-wrap${!showingTrash && isNew(page, readMarks) ? ' is-new' : ''}`;

      // 削除済み表示は開けないので button のまま。ふつうの一覧は a にして⌘クリックを効かせる
      const item = document.createElement(showingTrash ? 'button' : 'a');
      item.className = 'item';
      item.title = page.source;   // ヘッダーを廃したので出典はツールチップで見せる
      item.setAttribute('aria-current', String(!showingTrash && page.slug === currentSlug));
      const title = document.createElement('div');
      title.className = 't';
      title.textContent = page.title;
      item.append(title, metaRow(page, readMarks));

      if (showingTrash) {
        item.type = 'button';
        item.disabled = true;
        const restore = document.createElement('button');
        restore.className = 'restore-list';
        restore.type = 'button';
        restore.textContent = '戻す';
        restore.addEventListener('click', () => onRestore?.(page));
        wrap.append(item, restore);
      } else {
        bindOpen(item, page, onOpen);
        wrap.append(item, starButton(page, { starred, onToggle: onToggleStar }));
      }
      container.append(wrap);
    }
  }

  /** 一覧のCSSを、通常DOMなら :root、Shadow DOM なら :host に合わせて返す */
  const styleText = (scope = ':root') => `${scope} {${VARS}}\n${CSS}`;

  /**
   * 通常のDOMへ一覧CSSを差し込む。呼び出し元は自分側で上書きしたい規則
   * （トップ画面の狭い行など）を、より詳しいセレクタで書けばよい。
   */
  function injectIntoHead(doc = document) {
    if (doc.getElementById('mybriefs-list-style')) return;
    const style = doc.createElement('style');
    style.id = 'mybriefs-list-style';
    style.textContent = styleText(':root');
    doc.head.append(style);
  }

  window.MyBriefsList = {
    NEW_WINDOW_DAYS,
    styleText,
    injectIntoHead,
    dateGroup,
    fmtDateTime,
    shortTime,
    pageRepository,
    repositoryTone,
    isUnread,
    isNew,
    markRead,
    metaRow,
    starButton,
    pageUrl,
    bindOpen,
    render,
  };
})();
