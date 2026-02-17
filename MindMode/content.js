// ─── MindMode Content Script ─────────────────────────────────────────────────

let currentMode = 'free';
let overlayActive = false;

// Dynamic blocklist — loaded from storage (AI-generated or fallback)
const FALLBACK_BLOCKED = [
  'facebook.com','twitter.com','x.com','instagram.com','tiktok.com',
  'snapchat.com','pinterest.com','tumblr.com','linkedin.com','threads.net',
  'netflix.com','hulu.com','primevideo.com','disneyplus.com','twitch.tv',
  'roblox.com','discord.com','reddit.com','quora.com','whatsapp.com',
  'telegram.org','buzzfeed.com','dailymail.co.uk','amazon.com','shein.com'
];

function getBlockedList(callback) {
  try {
    chrome.storage.local.get('mindmode', ({ mindmode }) => {
      const ai = mindmode?.aiBlocklist;
      if (ai && typeof ai === 'object') {
        const flat = Object.values(ai).flat().filter(Boolean);
        callback(flat.length ? flat : FALLBACK_BLOCKED);
      } else {
        callback(FALLBACK_BLOCKED);
      }
    });
  } catch (e) {
    callback(FALLBACK_BLOCKED);
  }
}

function getDomain() {
  return location.hostname.replace('www.', '');
}

function isWhitelisted(whitelist) {
  const domain = getDomain();
  return whitelist.some(s => domain.includes(s));
}

function isYouTube() {
  return location.hostname.includes('youtube.com');
}

// ─── Blocking Overlay ─────────────────────────────────────────────────────────
function showBlockOverlay(mode) {
  if (overlayActive) return;
  overlayActive = true;

  const modeInfo = {
    study:    { emoji: '📚', name: 'Study Mode',     color: '#6366f1', tip: 'Stay focused — this site is blocked during Study Mode.' },
    deepwork: { emoji: '💻', name: 'Deep Work Mode', color: '#0ea5e9', tip: 'Not on your whitelist. Keep your attention where it matters.' }
  };

  const info = modeInfo[mode] || { emoji: '🔒', name: mode, color: '#6366f1', tip: 'Blocked by MindMode.' };

  const overlay = document.createElement('div');
  overlay.id = 'mindmode-overlay';
  overlay.innerHTML = `
    <style>
      #mindmode-overlay {
        position: fixed; inset: 0; z-index: 2147483647;
        background: #0f0f13;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #fff;
      }
      #mindmode-overlay .mm-ring {
        width: 120px; height: 120px; border-radius: 50%;
        border: 3px solid ${info.color}33;
        border-top-color: ${info.color};
        display: flex; align-items: center; justify-content: center;
        font-size: 48px;
        animation: mm-spin 3s linear infinite;
        margin-bottom: 32px;
      }
      @keyframes mm-spin { to { transform: rotate(360deg); } }
      #mindmode-overlay h1 { font-size: 28px; font-weight: 700; margin: 0 0 8px; }
      #mindmode-overlay .mm-badge {
        background: ${info.color}22; color: ${info.color};
        border: 1px solid ${info.color}44;
        padding: 4px 14px; border-radius: 20px;
        font-size: 13px; font-weight: 600; letter-spacing: 0.5px;
        margin-bottom: 20px;
      }
      #mindmode-overlay p { color: #888; font-size: 15px; max-width: 360px; text-align: center; line-height: 1.6; }
      #mindmode-overlay .mm-domain { color: #555; font-size: 13px; margin-top: 8px; }
      #mindmode-overlay .mm-btn {
        margin-top: 32px;
        background: ${info.color}; color: #fff;
        border: none; padding: 12px 28px; border-radius: 12px;
        font-size: 14px; font-weight: 600; cursor: pointer;
        transition: opacity 0.2s;
      }
      #mindmode-overlay .mm-btn:hover { opacity: 0.85; }
    </style>
    <div class="mm-ring">${info.emoji}</div>
    <div class="mm-badge">${info.name} Active</div>
    <h1>This site is blocked</h1>
    <p>${info.tip}</p>
    <div class="mm-domain">${getDomain()}</div>
    <button class="mm-btn" onclick="history.back()">← Go Back</button>
  `;

  document.documentElement.appendChild(overlay);
  document.documentElement.style.overflow = 'hidden';
}

function removeBlockOverlay() {
  const overlay = document.getElementById('mindmode-overlay');
  if (overlay) { overlay.remove(); overlayActive = false; }
  document.documentElement.style.overflow = '';
}

// ─── YouTube Feed Hider ────────────────────────────────────────────────────────
function hideYouTubeFeed() {
  if (!isYouTube()) return;
  const style = document.createElement('style');
  style.id = 'mindmode-yt-style';
  style.textContent = `
    ytd-rich-grid-renderer,
    ytd-shelf-renderer,
    #related,
    ytd-watch-next-secondary-results-renderer { display: none !important; }
    ytd-browse[page-subtype="home"] #primary,
    ytd-browse[page-subtype="home"] #secondary { display: none !important; }
    ytd-browse[page-subtype="home"] #contents::after {
      content: '📚 YouTube recommendations hidden by MindMode';
      display: block; text-align: center;
      padding: 80px 20px; color: #888;
      font-family: -apple-system, sans-serif; font-size: 18px;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function unhideYouTubeFeed() {
  document.getElementById('mindmode-yt-style')?.remove();
}

// ─── Chill Soft Theme ─────────────────────────────────────────────────────────
function applySoftTheme() {
  if (document.getElementById('mindmode-chill-style')) return;
  const style = document.createElement('style');
  style.id = 'mindmode-chill-style';
  style.textContent = `
    html { filter: saturate(0.8) brightness(0.97) !important; transition: filter 0.5s !important; }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function removeSoftTheme() {
  document.getElementById('mindmode-chill-style')?.remove();
}

// ─── Apply Mode (uses dynamic AI blocklist from storage) ───────────────────────
function applyMode(mode, whitelist = []) {
  currentMode = mode;
  removeBlockOverlay();
  unhideYouTubeFeed();
  removeSoftTheme();

  if (!mode || mode === 'free') return;
  if (location.href.startsWith('chrome://') || location.href.startsWith('chrome-extension://')) return;

  const domain = getDomain();

  if (mode === 'study') {
    getBlockedList(blockedDomains => {
      const hit = blockedDomains.some(s => domain.includes(s.replace('www.','')));
      if (hit) showBlockOverlay('study');
      else if (isYouTube()) hideYouTubeFeed();
    });
    return;
  }

  if (mode === 'deepwork') {
    if (!isWhitelisted(whitelist)) showBlockOverlay('deepwork');
    else if (isYouTube()) hideYouTubeFeed();
    return;
  }

  if (mode === 'chill') applySoftTheme();
}

// ─── Init ─────────────────────────────────────────────────────────────────────
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
  if (chrome.runtime.lastError || !response) return;
  const { state } = response;
  if (state?.sessionActive) applyMode(state.mode, state.whitelist);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'MODE_CHANGED') {
    chrome.storage.local.get('mindmode', ({ mindmode }) => {
      applyMode(msg.mode, mindmode?.whitelist || []);
    });
  }
  if (msg.type === 'BLOCKLIST_UPDATED') {
    // Re-apply current mode with new blocklist
    chrome.storage.local.get('mindmode', ({ mindmode }) => {
      if (mindmode?.sessionActive) {
        applyMode(mindmode.mode, mindmode.whitelist || []);
      }
    });
  }
  if (msg.type === 'SESSION_END') {
    removeBlockOverlay();
    unhideYouTubeFeed();
    removeSoftTheme();
  }
});
