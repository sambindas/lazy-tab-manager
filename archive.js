// archive.js

let allEntries = [];

const listEl    = document.getElementById('archive-list');
const searchEl  = document.getElementById('search');
const countBar  = document.getElementById('count-bar');
const btnClear  = document.getElementById('btn-clear');

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function render(entries) {
  countBar.textContent = entries.length > 0
    ? `${entries.length} archived tab${entries.length !== 1 ? 's' : ''}`
    : '';

  if (entries.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">📦</div>
        <p>No archived tabs yet. Archive stale tabs from the popup.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = '';

  entries.forEach((entry, idx) => {
    const item = document.createElement('div');
    item.className = 'archive-item';

    const favicon = entry.favIconUrl
      ? `<img class="archive-favicon" src="${escHtml(entry.favIconUrl)}" onerror="this.style.display='none'" />`
      : '<div class="archive-favicon"></div>';

    item.innerHTML = `
      ${favicon}
      <div class="archive-info">
        <div class="archive-title">${escHtml(entry.title)}</div>
        <div class="archive-url">${escHtml(entry.url)}</div>
      </div>
      <div class="archive-meta">${timeAgo(entry.archivedAt)}</div>
      <div class="archive-actions">
        <button class="btn-restore" data-url="${escHtml(entry.url)}">Restore</button>
        <button class="btn-delete" data-index="${idx}" title="Remove from archive">✕</button>
      </div>
    `;

    item.querySelector('.btn-restore').addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'RESTORE_ARCHIVED', url: entry.url });
    });

    item.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      // Find real index in allEntries
      const realIndex = allEntries.indexOf(entry);
      chrome.runtime.sendMessage({ type: 'DELETE_ARCHIVED', index: realIndex }, () => {
        allEntries.splice(realIndex, 1);
        render(filterEntries(searchEl.value));
      });
    });

    listEl.appendChild(item);
  });
}

function filterEntries(query) {
  if (!query.trim()) return allEntries;
  const q = query.toLowerCase();
  return allEntries.filter(e =>
    e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q)
  );
}

function load() {
  chrome.runtime.sendMessage({ type: 'GET_ARCHIVE' }, (archive) => {
    if (chrome.runtime.lastError || !archive) {
      render([]);
      return;
    }
    allEntries = archive;
    render(filterEntries(searchEl.value));
  });
}

searchEl.addEventListener('input', () => {
  render(filterEntries(searchEl.value));
});

btnClear.addEventListener('click', () => {
  if (!confirm('Clear all archived tabs? This cannot be undone.')) return;
  chrome.runtime.sendMessage({ type: 'CLEAR_ARCHIVE' }, () => {
    allEntries = [];
    render([]);
  });
});

load();
