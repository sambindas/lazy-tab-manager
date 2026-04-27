// archive.js

let allEntries = [];

const listEl   = document.getElementById('archive-list');
const searchEl = document.getElementById('search');
const countBar = document.getElementById('count-bar');
const btnClear = document.getElementById('btn-clear');

// ─── Safe message helper ──────────────────────────────────────────────────────
function sendMsg(msg, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      chrome.runtime.sendMessage(msg, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch (_) {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Render ───────────────────────────────────────────────────────────────────
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

  entries.forEach((entry) => {
    const realIndex = allEntries.indexOf(entry);
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
        <button class="btn-restore">Restore</button>
        <button class="btn-delete" title="Remove from archive">✕</button>
      </div>
    `;

    item.querySelector('.btn-restore').addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'RESTORE_ARCHIVED', url: entry.url });
    });

    item.querySelector('.btn-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      await sendMsg({ type: 'DELETE_ARCHIVED', index: realIndex });
      allEntries.splice(realIndex, 1);
      render(filterEntries(searchEl.value));
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

async function load() {
  const archive = await sendMsg({ type: 'GET_ARCHIVE' });
  allEntries = Array.isArray(archive) ? archive : [];
  render(filterEntries(searchEl.value));
}

// ─── Events ───────────────────────────────────────────────────────────────────
searchEl.addEventListener('input', () => {
  render(filterEntries(searchEl.value));
});

btnClear.addEventListener('click', async () => {
  if (!confirm('Clear all archived tabs? This cannot be undone.')) return;
  await sendMsg({ type: 'CLEAR_ARCHIVE' });
  allEntries = [];
  render([]);
});

load();
