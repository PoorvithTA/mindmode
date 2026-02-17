// ─── MindMode Background Service Worker ─────────────────────────────────────

const DEFAULT_STATE = {
  mode: 'free',
  sessionActive: false,
  sessionStart: null,
  sessionDuration: 45,
  sessionVisits: {},
  distractionCount: 0,
  schedule: [],
  whitelist: ['github.com', 'stackoverflow.com', 'google.com', 'notion.so', 'figma.com'],
  maxTabs: { study: 8, deepwork: 5, chill: 20, free: null }
};

// ─── Default fallback blocklist (used before AI generates one) ────────────────
const FALLBACK_BLOCKLIST = [
  // Social
  'facebook.com','twitter.com','x.com','instagram.com','tiktok.com',
  'snapchat.com','pinterest.com','tumblr.com','linkedin.com','threads.net',
  'bereal.com','mastodon.social',
  // OTT / Streaming
  'netflix.com','hulu.com','primevideo.com','disneyplus.com','max.com',
  'twitch.tv','crunchyroll.com','peacocktv.com','paramountplus.com',
  // Gaming
  'roblox.com','miniclip.com','poki.com','crazygames.com','itch.io',
  // News
  'buzzfeed.com','tmz.com','huffpost.com','dailymail.co.uk',
  // Shopping
  'amazon.com','ebay.com','etsy.com','shein.com','aliexpress.com',
  // Messaging
  'web.whatsapp.com','discord.com','telegram.org','web.telegram.org',
  // Forums
  'reddit.com','quora.com','4chan.org'
];

// Returns the full flat list of blocked domains (AI or fallback)
async function getBlockedDomains() {
  return new Promise(resolve => {
    chrome.storage.local.get('mindmode', ({ mindmode }) => {
      const aiBlocklist = mindmode?.aiBlocklist;
      if (aiBlocklist && typeof aiBlocklist === 'object') {
        const allDomains = Object.values(aiBlocklist).flat().filter(Boolean);
        resolve(allDomains.length ? allDomains : FALLBACK_BLOCKLIST);
      } else {
        resolve(FALLBACK_BLOCKLIST);
      }
    });
  });
}

// ─── Init ────────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get('mindmode');
  if (!existing.mindmode) {
    await chrome.storage.local.set({ mindmode: DEFAULT_STATE });
  }
  setupAlarms();
});

chrome.runtime.onStartup.addListener(() => setupAlarms());

async function getState() {
  const { mindmode } = await chrome.storage.local.get('mindmode');
  return mindmode || DEFAULT_STATE;
}

async function setState(updates) {
  const state = await getState();
  const newState = { ...state, ...updates };
  await chrome.storage.local.set({ mindmode: newState });
  return newState;
}

// ─── Mode Activation ─────────────────────────────────────────────────────────
async function activateMode(mode, duration = null) {
  const state = await getState();
  const sessionStart = Date.now();

  await setState({
    mode,
    sessionActive: true,
    sessionStart,
    sessionDuration: duration || state.sessionDuration,
    sessionVisits: {},
    distractionCount: 0
  });

  await applyTabEffects(mode);

  if (duration) {
    chrome.alarms.create('sessionEnd', { delayInMinutes: duration });
  }

  notifyTabs({ type: 'MODE_CHANGED', mode });

  if (mode === 'deepwork') {
    chrome.alarms.create('idleTabCheck', { periodInMinutes: 2 });
  } else {
    chrome.alarms.clear('idleTabCheck');
  }
}

async function deactivateMode() {
  const state = await getState();
  const summary = buildSummary(state);

  await setState({
    sessionActive: false,
    sessionStart: null,
    mode: 'free'
  });

  chrome.alarms.clear('sessionEnd');
  chrome.alarms.clear('idleTabCheck');

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.mutedInfo?.muted) {
      chrome.tabs.update(tab.id, { muted: false }).catch(() => {});
    }
  }

  notifyTabs({ type: 'MODE_CHANGED', mode: 'free' });
  notifyTabs({ type: 'SESSION_END', summary });

  return summary;
}

// ─── Tab Effects ─────────────────────────────────────────────────────────────
async function applyTabEffects(mode) {
  const tabs = await chrome.tabs.query({});
  const state = await getState();

  if (mode === 'deepwork') {
    for (const tab of tabs) {
      if (!tab.active) {
        chrome.tabs.update(tab.id, { muted: true }).catch(() => {});
      }
    }
  }

  if (mode === 'study' || mode === 'deepwork') {
    const maxTabs = state.maxTabs[mode];
    if (maxTabs && tabs.length > maxTabs) {
      const toClose = tabs
        .filter(t => !t.active)
        .sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0))
        .slice(0, tabs.length - maxTabs);
      for (const tab of toClose) {
        chrome.tabs.remove(tab.id).catch(() => {});
      }
    }
  }
}

// ─── Tab Listeners ────────────────────────────────────────────────────────────
chrome.tabs.onCreated.addListener(async (tab) => {
  const state = await getState();
  if (!state.sessionActive) return;
  const maxTabs = state.maxTabs[state.mode];
  if (!maxTabs) return;
  const allTabs = await chrome.tabs.query({});
  if (allTabs.length > maxTabs) {
    setTimeout(() => chrome.tabs.remove(tab.id).catch(() => {}), 200);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const state = await getState();
  if (!state.sessionActive || state.mode !== 'deepwork') return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    chrome.tabs.update(tab.id, { muted: tab.id !== tabId }).catch(() => {});
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  const state = await getState();
  if (!state.sessionActive) return;

  try {
    const domain = new URL(tab.url).hostname.replace('www.', '');

    if (!tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
      const visits = { ...state.sessionVisits };
      visits[domain] = (visits[domain] || 0) + 1;
      await setState({ sessionVisits: visits });
    }

    // Check against dynamic AI blocklist
    const blockedDomains = await getBlockedDomains();
    const isBlocked = blockedDomains.some(site => domain.includes(site.replace('www.', '')));
    if (isBlocked) {
      await setState({ distractionCount: state.distractionCount + 1 });
    }
  } catch (e) {}
});

// ─── Alarms ───────────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sessionEnd') {
    const summary = await deactivateMode();
    chrome.notifications.create('sessionEnd', {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'MindMode Session Complete! 🎉',
      message: `Focus score: ${summary.focusScore}% | Sites visited: ${summary.uniqueSites}`
    });
  }

  if (alarm.name === 'idleTabCheck') {
    await checkIdleTabs();
  }

  if (alarm.name.startsWith('schedule_')) {
    const state = await getState();
    const scheduleId = alarm.name.replace('schedule_', '');
    const entry = state.schedule.find(s => s.id === scheduleId);
    if (entry) activateMode(entry.mode, entry.duration);
  }
});

async function checkIdleTabs() {
  const state = await getState();
  if (state.mode !== 'deepwork') return;
  const idleThreshold = 10 * 60 * 1000;
  const now = Date.now();
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.active && tab.lastAccessed && (now - tab.lastAccessed) > idleThreshold) {
      chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
}

// ─── Schedule ─────────────────────────────────────────────────────────────────
function setupAlarms() {
  chrome.storage.local.get('mindmode', ({ mindmode }) => {
    const schedule = mindmode?.schedule || [];
    schedule.forEach(entry => {
      const [hours, minutes] = entry.time.split(':').map(Number);
      const now = new Date();
      const target = new Date();
      target.setHours(hours, minutes, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      const delayMinutes = (target - now) / 60000;
      chrome.alarms.create(`schedule_${entry.id}`, {
        delayInMinutes: delayMinutes,
        periodInMinutes: 1440
      });
    });
  });
}

// ─── Summary Builder ──────────────────────────────────────────────────────────
function buildSummary(state) {
  if (!state.sessionStart) return null;
  const elapsed = Math.floor((Date.now() - state.sessionStart) / 60000);
  const uniqueSites = Object.keys(state.sessionVisits).length;
  const distractions = state.distractionCount;
  const focusScore = Math.max(0, Math.min(100,
    100 - (distractions * 10) - Math.max(0, uniqueSites - 5) * 2
  ));

  return {
    duration: elapsed,
    targetDuration: state.sessionDuration,
    uniqueSites,
    totalVisits: Object.values(state.sessionVisits).reduce((a, b) => a + b, 0),
    topSites: Object.entries(state.sessionVisits).sort((a, b) => b[1] - a[1]).slice(0, 5),
    distractionCount: distractions,
    focusScore: Math.round(focusScore),
    mode: state.mode
  };
}

// ─── Message Handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ACTIVATE_MODE') {
    activateMode(msg.mode, msg.duration).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'DEACTIVATE') {
    deactivateMode().then(summary => sendResponse({ ok: true, summary }));
    return true;
  }
  if (msg.type === 'GET_STATE') {
    getState().then(state => {
      const summary = state.sessionActive ? buildSummary(state) : null;
      sendResponse({ state, summary });
    });
    return true;
  }
  if (msg.type === 'UPDATE_BLOCKLIST') {
    setState({ aiBlocklist: msg.blocklist }).then(() => {
      notifyTabs({ type: 'BLOCKLIST_UPDATED' });
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === 'UPDATE_SETTINGS') {
    setState(msg.updates).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'UPDATE_SCHEDULE') {
    setState({ schedule: msg.schedule }).then(() => {
      chrome.alarms.clearAll(() => setupAlarms());
      sendResponse({ ok: true });
    });
    return true;
  }
});

function notifyTabs(msg) {
  chrome.tabs.query({}, tabs => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
    });
  });
}
