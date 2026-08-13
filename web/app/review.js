const root = document.querySelector('#reviews');
const purpose = document.querySelector('#purpose');
const error = document.querySelector('#review-error');
const pairing = document.querySelector('#pairing');
const pairButton = document.querySelector('#pair');

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `API error: ${response.status}`);
  return body;
}

function paragraph(text, className) {
  const node = document.createElement('p');
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function card(item) {
  const article = document.createElement('article');
  article.className = 'review-card';
  const title = document.createElement('h2');
  title.textContent = item.title;
  const question = paragraph(item.question);
  article.append(title, question);
  if (item.context) article.append(paragraph(item.context, 'context'));

  const form = document.createElement('form');
  form.className = 'answer';
  const textarea = document.createElement('textarea');
  textarea.placeholder = '追加の指示があれば入力';
  textarea.setAttribute('aria-label', '追加の指示');
  const row = document.createElement('div');
  row.className = 'button-row';
  const comment = document.createElement('button');
  comment.type = 'submit';
  comment.className = 'secondary-button';
  comment.textContent = 'コメントを返す';
  const approve = document.createElement('button');
  approve.type = 'button';
  approve.className = 'primary-button';
  approve.textContent = '承認する';
  row.append(comment, approve);
  form.append(textarea, row);

  async function answer(approved) {
    await api(`/api/owner/reviews/${encodeURIComponent(item.id)}/answer`, {
      method: 'POST',
      body: JSON.stringify({ approved, responseText: textarea.value }),
    });
    article.remove();
    if (!root.children.length) purpose.hidden = false;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await answer(false); } catch (cause) { showError(cause); }
  });
  approve.addEventListener('click', async () => {
    try { await answer(true); } catch (cause) { showError(cause); }
  });
  article.append(form);
  return article;
}

function showError(cause) {
  error.hidden = false;
  error.textContent = cause instanceof Error ? cause.message : '操作に失敗しました';
}

async function load() {
  try {
    const result = await api('/api/owner/reviews');
    root.replaceChildren(...result.items.map(card));
    purpose.hidden = result.items.length > 0;
  } catch (cause) { showError(cause); }
}

pairButton.addEventListener('click', async () => {
  try {
    const result = await api('/api/owner/pairings', { method: 'POST', body: '{}' });
    pairing.replaceChildren(document.createTextNode('PCで次のコードを入力してください'));
    const code = document.createElement('code');
    code.textContent = result.code;
    pairing.append(code);
    pairing.hidden = false;
  } catch (cause) { showError(cause); }
});

load();
