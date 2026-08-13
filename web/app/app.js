const pagesRoot = document.querySelector('#pages');
const empty = document.querySelector('#empty');
const error = document.querySelector('#error');
const updated = document.querySelector('#updated');
const reviewCount = document.querySelector('#review-count');

const format = (value) => new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(value));

function pageCard(page) {
  const link = document.createElement('a');
  link.className = 'page';
  link.href = page.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const title = document.createElement('strong');
  title.textContent = page.title;
  const time = document.createElement('time');
  time.dateTime = page.updatedAt;
  time.textContent = `${format(page.updatedAt)} 更新`;
  link.append(title, time);
  return link;
}

async function load() {
  try {
    const [manifestResponse, reviewsResponse] = await Promise.all([
      fetch('/app/manifest.json', { cache: 'no-store' }),
      fetch('/api/owner/reviews', { cache: 'no-store' }),
    ]);
    if (!manifestResponse.ok) throw new Error('生成結果を取得できませんでした');
    const manifest = await manifestResponse.json();
    const reviews = reviewsResponse.ok ? await reviewsResponse.json() : { items: [] };
    pagesRoot.replaceChildren(...manifest.pages.map(pageCard));
    empty.hidden = manifest.pages.length > 0;
    updated.textContent = `${format(manifest.generatedAt)} 更新`;
    const waiting = reviews.items.filter((item) => item.status === 'waiting').length;
    reviewCount.hidden = waiting === 0;
    reviewCount.textContent = String(waiting);
  } catch (cause) {
    error.hidden = false;
    error.textContent = cause instanceof Error ? cause.message : '読み込みに失敗しました';
  }
}

load();
