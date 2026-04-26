const DEFAULTS = {
  suspendMinutes: 30,
  closeMinutes: 120,
  suspendEnabled: true,
  closeEnabled: true,
};

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

async function markTabActive(tabId) {
  const activity = await getTabActivity();
  activity[tabId] = Date.now();
  await setTabActivity(activity);
}

async function removeTabActivity(tabId) {
  const activity = await getTabActivity();
  delete activity[tabId];
  await setTabActivity(activity);
}

// ─── Suspended page helpers ───────────────────────────────────────────────────
function getSuspendedPageUrl(originalUrl, title) {
  const base = chrome.runtime.getURL('suspended.html');
  const params = new URLSearchParams({
    url: originalUrl,
    title: title || originalUrl,
    at: Date.now().toString(),
  });
  // Use hash fragment — query strings can be stripped by browsers on extension pages
  return `${base}#${params.toString()}`;
}

function isSuspendedPage(url) {
  if (!url) return false;
  return url.startsWith(chrome.runtime.getURL('suspended.html'));
}

function getOriginalUrlFromSuspended(url) {
  try {
    const hash = new URL(url).hash.slice(1); // remove leading #
    return new URLSearchParams(hash).get('url');
  } catch (_) {
    return null;
  }
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
    // Content script not ready — fall back to a browser notification
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
      await removeTabActivity(tab.id);
      continue;
    }

    if (settings.suspendEnabled && idleMs >= suspendMs) {
      const suspendUrl = getSuspendedPageUrl(tab.url, tab.title);
      await chrome.tabs.update(tab.id, { url: suspendUrl });
    }
  }
});

// ─── Tab Lifecycle Listeners ──────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (!isSuspendedPage(tab.url)) {
      checkForDuplicate(tabId, tab.url);
      markTabActive(tabId);
    }
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  markTabActive(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  removeTabActivity(tabId);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'SWITCH_TO_DUPLICATE') {
    chrome.tabs.update(msg.duplicateTabId, { active: true });
    chrome.windows.update(msg.duplicateWindowId, { focused: true });
    chrome.tabs.remove(sender.tab.id);
  }
  if (msg.type === 'DISMISS_DUPLICATE') {
    markTabActive(sender.tab.id);
  }
});
