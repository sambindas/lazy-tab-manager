// background.js — Lazy Tab Manager

// ─── Defaults ────────────────────────────────────────────────────────────────
const DEFAULTS = {
  suspendMinutes: 30,
  closeMinutes: 120,
  suspendEnabled: true,
  closeEnabled: true,
};

// ─── Storage helpers (session not available in Firefox, fall back to local) ───
const sessionStore = (typeof chrome.storage.session !== 'undefined')
  ? chrome.storage.session
  : chrome.storage.local;

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULTS, (result) => resolve(result));
  });
}

async function getTabActivity() {
  return new Promise((resolve) => {
    sessionStore.get({ tabLastActive: {} }, (r) => resolve(r.tabLastActive || {}));
  });
}

async function setTabActivity(tabLastActive) {
  return new Promise((resolve) => {
    sessionStore.set({ tabLastActive }, resolve);
  });
}

async function getTabCreated() {
  return new Promise((resolve) => {
    sessionStore.get({ tabCreated: {} }, (r) => resolve(r.tabCreated || {}));
  });
}

async function setTabCreated(tabCreated) {
  return new Promise((resolve) => {
    sessionStore.set({ tabCreated }, resolve);
  });
}

async function markTabActive(tabId) {
  const activity = await getTabActivity();
  activity[tabId] = Date.now();
  await setTabActivity(activity);
}

async function markTabCreated(tabId) {
  const created = await getTabCreated();
  if (!created[tabId]) {
    created[tabId] = Date.now();
    await setTabCreated(created);
  }
}

async function removeTabTracking(tabId) {
  const [activity, created] = await Promise.all([getTabActivity(), getTabCreated()]);
  delete activity[tabId];
  delete created[tabId];
  await Promise.all([setTabActivity(activity), setTabCreated(created)]);
}

// ─── Suspended page helpers ───────────────────────────────────────────────────
function getSuspendedPageUrl(originalUrl, title) {
  const base = chrome.runtime.getURL('suspended.html');
  const params = new URLSearchParams({
    url: originalUrl,
    title: title || originalUrl,
    at: Date.now().toString(),
  });
  return `${base}#${params.toString()}`;
}

function isSuspendedPage(url) {
  if (!url) return false;
  return url.startsWith(chrome.runtime.getURL('suspended.html'));
}

function getOriginalUrlFromSuspended(url) {
  try {
    const hash = new URL(url).hash.slice(1);
    return new URLSearchParams(hash).get('url');
  } catch (_) {
    return null;
  }
}

// ─── Tab Debt Scoring ─────────────────────────────────────────────────────────
// Score = age points + inactivity points + duplicate points
// Each component is 0–100, total max = 300

function scoreTab(tab, activity, created, urlCounts) {
  const now = Date.now();
  const HOUR = 3_600_000;

  const effectiveUrl = isSuspendedPage(tab.url)
    ? getOriginalUrlFromSuspended(tab.url)
    : tab.url;

  // Age score — max 100 at 48h+
  const createdAt = created[tab.id] ?? now;
  const ageHours = (now - createdAt) / HOUR;
  const ageScore = Math.min(100, Math.round((ageHours / 48) * 100));

  // Inactivity score — max 100 at 4h+
  const lastActive = activity[tab.id] ?? tab.lastAccessed ?? now;
  const inactiveHours = (now - lastActive) / HOUR;
  const inactivityScore = Math.min(100, Math.round((inactiveHours / 4) * 100));

  // Duplicate score — 100 if URL appears more than once, else 0
  const duplicateScore = (urlCounts[effectiveUrl] || 0) > 1 ? 100 : 0;

  const total = ageScore + inactivityScore + duplicateScore;

  return { total, ageScore, inactivityScore, duplicateScore };
}

async function computeAllScores() {
  const [activity, created] = await Promise.all([getTabActivity(), getTabCreated()]);
  const tabs = await chrome.tabs.query({});

  // Count URL occurrences (resolve suspended pages to their real URL)
  const urlCounts = {};
  for (const tab of tabs) {
    const url = isSuspendedPage(tab.url)
      ? getOriginalUrlFromSuspended(tab.url)
      : tab.url;
    if (url) urlCounts[url] = (urlCounts[url] || 0) + 1;
  }

  const scored = tabs
    .filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('moz-extension://') && !t.url.startsWith('about:'))
    .map(tab => ({
      id: tab.id,
      title: tab.title,
      url: isSuspendedPage(tab.url) ? getOriginalUrlFromSuspended(tab.url) : tab.url,
      favIconUrl: tab.favIconUrl,
      windowId: tab.windowId,
      suspended: isSuspendedPage(tab.url),
      scores: scoreTab(tab, activity, created, urlCounts),
    }))
    .sort((a, b) => b.scores.total - a.scores.total);

  return scored;
}

async function updateBadge() {
  const scored = await computeAllScores();
  const totalDebt = scored.reduce((sum, t) => sum + t.scores.total, 0);
  const display = totalDebt > 999 ? '999+' : totalDebt > 0 ? String(totalDebt) : '';
  const color = totalDebt > 500 ? '#e94560' : totalDebt > 200 ? '#ff9800' : '#4caf50';

  chrome.action.setBadgeText({ text: display });
  chrome.action.setBadgeBackgroundColor({ color });
}

// ─── Archive helpers ──────────────────────────────────────────────────────────
async function getArchive() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ archive: [] }, (r) => resolve(r.archive));
  });
}

async function saveToArchive(tabs) {
  const archive = await getArchive();
  const now = Date.now();
  const newEntries = tabs.map(t => ({
    url: t.url,
    title: t.title || t.url,
    favIconUrl: t.favIconUrl || '',
    archivedAt: now,
  }));
  const updated = [...newEntries, ...archive].slice(0, 500); // cap at 500 entries
  return new Promise((resolve) => {
    chrome.storage.local.set({ archive: updated }, resolve);
  });
}

async function archiveAndCloseStaleTabs() {
  const scored = await computeAllScores();
  const tabs = await chrome.tabs.query({});

  // Stale = debt score >= 100, not active, not pinned
  const staleTabs = scored.filter(t => {
    const tab = tabs.find(x => x.id === t.id);
    if (!tab || tab.active || tab.pinned) return false;
    return t.scores.total >= 100;
  });

  if (staleTabs.length === 0) return { archived: 0 };

  await saveToArchive(staleTabs);
  await Promise.all(staleTabs.map(t => chrome.tabs.remove(t.id)));
  await Promise.all(staleTabs.map(t => removeTabTracking(t.id)));
  await updateBadge();

  return { archived: staleTabs.length };
}

// ─── Duplicate Tab Detection ──────────────────────────────────────────────────
async function checkForDuplicate(newTabId, url) {
  if (!url || url === 'about:blank') return;
  if (url.startsWith('chrome://') || url.startsWith('moz-extension://') || url.startsWith('about:')) return;
  if (isSuspendedPage(url)) return;

  const tabs = await chrome.tabs.query({});
  const duplicate = tabs.find((t) => {
    if (t.id === newTabId) return false;
    const tUrl = isSuspendedPage(t.url) ? getOriginalUrlFromSuspended(t.url) : t.url;
    return tUrl === url;
  });

  if (!duplicate) return;

  try {
    await chrome.tabs.sendMessage(newTabId, {
      type: 'DUPLICATE_DETECTED',
      duplicateTabId: duplicate.id,
      duplicateWindowId: duplicate.windowId,
    });
  } catch (_) {
    chrome.notifications.create(`dup-${newTabId}`, {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Tab already open',
      message: 'This URL is already open in another tab.',
      buttons: [{ title: 'Switch to existing tab' }],
      priority: 2,
    });
    sessionStore.set({ [`notif-${newTabId}`]: { newTabId, duplicate } });
  }
}

chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  const key = notifId.replace('dup-', 'notif-');
  const result = await new Promise((r) => sessionStore.get(key, (res) => r(res)));
  const data = result[key];
  if (!data) return;
  if (btnIdx === 0) {
    await chrome.tabs.update(data.duplicate.id, { active: true });
    await chrome.windows.update(data.duplicate.windowId, { focused: true });
    await chrome.tabs.remove(data.newTabId);
  }
  chrome.notifications.clear(notifId);
  sessionStore.remove(key);
});

// ─── Inactivity Alarm ─────────────────────────────────────────────────────────
const ALARM_NAME = 'inactivity-check';
chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  const [settings, activity] = await Promise.all([getSettings(), getTabActivity()]);
  const now = Date.now();
  const suspendMs = settings.suspendMinutes * 60_000;
  const closeMs = settings.closeMinutes * 60_000;
  const tabs = await chrome.tabs.query({});

  for (const tab of tabs) {
    if (tab.active || tab.pinned) continue;
    if (!tab.url) continue;
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('moz-extension://') || tab.url.startsWith('about:')) continue;
    if (isSuspendedPage(tab.url)) continue;

    const lastActive = activity[tab.id] ?? tab.lastAccessed ?? now;
    const idleMs = now - lastActive;

    if (settings.closeEnabled && idleMs >= closeMs) {
      await chrome.tabs.remove(tab.id);
      await removeTabTracking(tab.id);
      continue;
    }

    if (settings.suspendEnabled && idleMs >= suspendMs) {
      const suspendUrl = getSuspendedPageUrl(tab.url, tab.title);
      await chrome.tabs.update(tab.id, { url: suspendUrl });
    }
  }

  await updateBadge();
});

// ─── Tab Lifecycle Listeners ──────────────────────────────────────────────────
chrome.tabs.onCreated.addListener((tab) => {
  markTabCreated(tab.id);
  markTabActive(tab.id);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (!isSuspendedPage(tab.url)) {
      checkForDuplicate(tabId, tab.url);
      markTabActive(tabId);
    }
    updateBadge();
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  markTabActive(tabId);
  updateBadge();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  removeTabTracking(tabId);
  updateBadge();
});

// ─── Message handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SWITCH_TO_DUPLICATE') {
    chrome.tabs.update(msg.duplicateTabId, { active: true });
    chrome.windows.update(msg.duplicateWindowId, { focused: true });
    chrome.tabs.remove(sender.tab.id);
  }
  if (msg.type === 'DISMISS_DUPLICATE') {
    markTabActive(sender.tab.id);
  }
  if (msg.type === 'GET_SCORES') {
    computeAllScores().then(sendResponse);
    return true; // keep channel open for async response
  }
  if (msg.type === 'ARCHIVE_STALE') {
    archiveAndCloseStaleTabs().then(sendResponse);
    return true;
  }
  if (msg.type === 'GET_ARCHIVE') {
    getArchive().then(sendResponse);
    return true;
  }
  if (msg.type === 'RESTORE_ARCHIVED') {
    chrome.tabs.create({ url: msg.url });
  }
  if (msg.type === 'CLEAR_ARCHIVE') {
    chrome.storage.local.set({ archive: [] }, () => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'DELETE_ARCHIVED') {
    getArchive().then(archive => {
      const updated = archive.filter((_, i) => i !== msg.index);
      chrome.storage.local.set({ archive: updated }, () => sendResponse({ ok: true }));
    });
    return true;
  }
});
