// popup.js

const DEFAULTS = {
  suspendMinutes: 30,
  closeMinutes: 120,
  suspendEnabled: true,
  closeEnabled: true,
};

// ─── Elements ─────────────────────────────────────────────────────────────────
const suspendToggle  = document.getElementById('suspend-toggle');
const closeToggle    = document.getElementById('close-toggle');
const suspendMins    = document.getElementById('suspend-minutes');
const closeMins      = document.getElementById('close-minutes');
const suspendGroup   = document.getElementById('suspend-group');
const closeGroup     = document.getElementById('close-group');
const btnSave        = document.getElementById('btn-save');
const btnOptions     = document.getElementById('btn-options');
const savedMsg       = document.getElementById('saved-msg');
const btnArchive     = document.getElementById('btn-archive');
const btnViewArchive = document.getElementById('btn-view-archive');
const archiveMsg     = document.getElementById('archive-msg');
const debtValue      = document.getElementById('debt-value');
const tabCountEl     = document.getElementById('tab-count');
const tabList        = document.getElementById('tab-list');
const staleCount     = document.getElementById('stale-count');

// ─── Safe message helper ──────────────────────────────────────────────────────
// Firefox can silently drop responses; this wraps sendMessage in a promise
// with a timeout so the popup never freezes.
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

// ─── Settings ─────────────────────────────────────────────────────────────────
chrome.storage.sync.get(DEFAULTS, (settings) => {
  suspendToggle.checked = settings.suspendEnabled;
  closeToggle.checked   = settings.closeEnabled;
  suspendMins.value     = settings.suspendMinutes;
  closeMins.value       = settings.closeMinutes;
  updateGroups();
});

function updateGroups() {
  suspendGroup.classList.toggle('disabled-group', !suspendToggle.checked);
  closeGroup.classList.toggle('disabled-group', !closeToggle.checked);
}

suspendToggle.addEventListener('change', updateGroups);
closeToggle.addEventListener('change', updateGroups);

btnSave.addEventListener('click', () => {
  const settings = {
    suspendEnabled: suspendToggle.checked,
    closeEnabled:   closeToggle.checked,
    suspendMinutes: Math.max(1, parseInt(suspendMins.value, 10) || 30),
    closeMinutes:   Math.max(1, parseInt(closeMins.value, 10) || 120),
  };
  chrome.storage.sync.set(settings, () => {
    savedMsg.classList.add('show');
    setTimeout(() => savedMsg.classList.remove('show'), 1800);
  });
});

btnOptions.addEventListener('click', () => chrome.runtime.openOptionsPage());

// ─── Tab debt scores ──────────────────────────────────────────────────────────
function scoreClass(score) {
  if (score >= 200) return 'high';
  if (score >= 100) return 'medium';
  return 'low';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTabs(scored) {
  if (!scored || !Array.isArray(scored)) {
    tabList.innerHTML = '<div class="empty-state">Could not load tabs.</div>';
    return;
  }

  const total = scored.reduce((s, t) => s + t.scores.total, 0);
  debtValue.textContent = total;
  debtValue.className = 'value ' + scoreClass(total / Math.max(scored.length, 1));
  tabCountEl.textContent = `${scored.length} tab${scored.length !== 1 ? 's' : ''} open`;

  const stale = scored.filter(t => t.scores.total >= 100);
  staleCount.textContent = stale.length > 0 ? `${stale.length} stale` : '';
  btnArchive.disabled = stale.length === 0;

  if (scored.length === 0) {
    tabList.innerHTML = '<div class="empty-state">No tabs to show.</div>';
    return;
  }

  tabList.innerHTML = '';

  for (const tab of scored) {
    const s = tab.scores;
    const item = document.createElement('div');
    item.className = 'tab-item';

    const favicon = tab.favIconUrl
      ? `<img class="tab-favicon" src="${escHtml(tab.favIconUrl)}" onerror="this.style.display='none'" />`
      : '<div class="tab-favicon"></div>';

    const dupPill = s.duplicateScore > 0
      ? `<span class="pill dup">duplicate</span>`
      : '';

    item.innerHTML = `
      <div class="tab-row">
        ${favicon}
        <span class="tab-title">${escHtml(tab.title || tab.url || '')}</span>
        <span class="tab-score ${scoreClass(s.total)}">${s.total}</span>
      </div>
      <div class="tab-breakdown">
        <span class="pill ${s.ageScore > 0 ? 'active' : ''}">age ${s.ageScore}</span>
        <span class="pill ${s.inactivityScore > 0 ? 'active' : ''}">idle ${s.inactivityScore}</span>
        ${dupPill}
      </div>
    `;

    item.addEventListener('click', () => {
      chrome.tabs.update(tab.id, { active: true });
      chrome.windows.update(tab.windowId, { focused: true });
      window.close();
    });

    tabList.appendChild(item);
  }
}

async function loadScores() {
  tabList.innerHTML = '<div class="empty-state">Loading...</div>';
  const scored = await sendMsg({ type: 'GET_SCORES' });
  renderTabs(scored);
}

loadScores();

// ─── Archive ──────────────────────────────────────────────────────────────────
btnArchive.addEventListener('click', async () => {
  btnArchive.disabled = true;
  btnArchive.textContent = 'Archiving...';

  const result = await sendMsg({ type: 'ARCHIVE_STALE' });

  if (result && result.archived > 0) {
    archiveMsg.textContent = `${result.archived} tab${result.archived !== 1 ? 's' : ''} archived!`;
    archiveMsg.classList.add('show');
    setTimeout(() => archiveMsg.classList.remove('show'), 2500);
  }

  btnArchive.textContent = 'Archive stale tabs';
  await loadScores();
});

btnViewArchive.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('archive.html') });
  window.close();
});
