// ─── MindMode Popup Controller ───────────────────────────────────────────────

let state = null;
let selectedMode = null;
let selectedDuration = 45;
let timerInterval = null;

const MODE_META = {
  study:    { label: '📚 Study Mode',        icon: 'menu_book',      color: '#818cf8' },
  deepwork: { label: '💻 Deep Work Mode',    icon: 'laptop_mac',     color: '#38bdf8' },
  chill:    { label: '🌙 Chill Mode',        icon: 'nights_stay',    color: '#c084fc' },
  free:     { label: '🎮 Free Mode',         icon: 'sports_esports', color: '#4ade80' }
};

const CATEGORY_META = {
  social:    { icon: '📱', label: 'Social Media' },
  ott:       { icon: '🎬', label: 'OTT / Streaming' },
  gaming:    { icon: '🎮', label: 'Gaming' },
  news:      { icon: '📰', label: 'News & Tabloids' },
  adult:     { icon: '🔞', label: 'Adult Content' },
  shopping:  { icon: '🛒', label: 'Shopping / Deals' },
  messaging: { icon: '💬', label: 'Messaging Apps' },
  forums:    { icon: '💬', label: 'Forums & Communities' }
};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  bindEvents();
});

function loadState() {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    state = res.state;
    render();
  });
}

// ─── View Management ──────────────────────────────────────────────────────────
function showView(id) {
  ['mainView', 'summaryView', 'settingsView', 'aboutView'].forEach(v => {
    document.getElementById(v)?.classList.add('hidden');
  });
  document.getElementById(id)?.classList.remove('hidden');
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  if (!state) return;
  showView('mainView');

  document.querySelectorAll('.mode-card').forEach(card => {
    card.classList.toggle('active',
      card.dataset.mode === state.mode && state.sessionActive
    );
  });

  const banner = document.getElementById('sessionBanner');
  if (state.sessionActive) {
    banner.classList.remove('hidden');
    renderSessionBanner();
    document.getElementById('durationPicker').classList.add('hidden');
  } else {
    banner.classList.add('hidden');
    clearInterval(timerInterval);
    if (selectedMode && selectedMode !== 'free') {
      document.getElementById('durationPicker').classList.remove('hidden');
    }
  }
}

function renderSessionBanner() {
  const meta = MODE_META[state.mode] || { label: state.mode, icon: 'timer' };
  document.getElementById('sessionModeLabel').textContent = meta.label;
  document.getElementById('sbIcon').textContent = meta.icon;
  document.getElementById('sbIcon').style.color = meta.color;
  startTimerTick();
  refreshLiveStats();
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function startTimerTick() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!state?.sessionActive || !state.sessionStart) return;
    const elapsed   = (Date.now() - state.sessionStart) / 1000;
    const total     = state.sessionDuration * 60;
    const remaining = Math.max(0, total - elapsed);
    const isInfinite = state.sessionDuration === 0;

    document.getElementById('sessionTimer').textContent =
      isInfinite ? formatTime(elapsed) : formatTime(remaining);

    const progress = isInfinite
      ? Math.min(1, elapsed / 3600)
      : Math.min(1, elapsed / total);
    document.getElementById('sessionBar').style.width = `${progress * 100}%`;

    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
      if (res?.state) { state = res.state; refreshLiveStats(); }
    });
  }, 1000);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function refreshLiveStats() {
  const sites    = Object.keys(state.sessionVisits || {}).length;
  const blocked  = state.distractionCount || 0;
  const focus    = Math.max(0, 100 - blocked * 10 - Math.max(0, sites - 5) * 2);
  document.getElementById('lSites').textContent   = sites;
  document.getElementById('lBlocked').textContent = blocked;
  document.getElementById('lFocus').textContent   = Math.round(focus);
}

// ─── Summary ──────────────────────────────────────────────────────────────────
function showSummary(summary) {
  if (!summary) { showView('mainView'); return; }
  showView('summaryView');

  document.getElementById('focusScore').textContent    = summary.focusScore + '%';
  document.getElementById('sDuration').textContent     = summary.duration;
  document.getElementById('sSites').textContent        = summary.uniqueSites;
  document.getElementById('sDistractions').textContent = summary.distractionCount;

  const list = document.getElementById('topSitesList');
  list.innerHTML = '';
  if (summary.topSites?.length) {
    list.innerHTML = `<div class="top-site-label">Top Sites Visited</div>`;
    summary.topSites.forEach(([domain, count]) => {
      list.innerHTML += `
        <div class="top-site-row">
          <span class="top-site-domain">${domain}</span>
          <span class="top-site-count">${count} visit${count !== 1 ? 's' : ''}</span>
        </div>`;
    });
  }
  drawScoreRing(summary.focusScore);
}

function drawScoreRing(score) {
  const canvas = document.getElementById('scoreRing');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 65, cy = 65, r = 55;
  ctx.clearRect(0, 0, 130, 130);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#1c2030';
  ctx.lineWidth = 9;
  ctx.stroke();

  const color = score >= 70 ? '#667eea' : score >= 40 ? '#f59e0b' : '#f87171';
  const grad  = ctx.createLinearGradient(0, 0, 130, 130);
  grad.addColorStop(0, color);
  grad.addColorStop(1, score >= 70 ? '#764ba2' : color);

  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (score / 100) * Math.PI * 2);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.stroke();
}

// ─── AI Smart Blocklist ───────────────────────────────────────────────────────

const BLOCKLIST_PROMPT = `You are a browser focus assistant. Generate a comprehensive, categorized blocklist of distracting websites for a productivity Chrome extension.

Return ONLY a valid JSON object (no markdown, no explanation) with this exact structure:
{
  "social":    ["domain1.com", "domain2.com", ...],
  "ott":       ["domain1.com", ...],
  "gaming":    ["domain1.com", ...],
  "news":      ["domain1.com", ...],
  "adult":     ["domain1.com", ...],
  "shopping":  ["domain1.com", ...],
  "messaging": ["domain1.com", ...],
  "forums":    ["domain1.com", ...]
}

Rules:
- Use base domains only (no www, no paths, no https://)
- Include 15-25 domains per category
- social: Facebook, Instagram, Twitter/X, TikTok, Snapchat, Pinterest, LinkedIn, Tumblr, BeReal, Threads, Mastodon, etc.
- ott: Netflix, Hulu, Disney+, Prime Video, HBO Max, Apple TV+, Peacock, Paramount+, Twitch, Crunchyroll, Mubi, etc.
- gaming: Steam, Epic, Roblox, Miniclip, Poki, CrazyGames, Kongregate, Armor Games, Itch.io, GameBanana, etc.
- news: Daily Mail, BuzzFeed, TMZ, HuffPost, Gawker, Vice, Digg, Flipboard, Bleacher Report, etc.
- adult: common adult content sites
- shopping: Amazon, eBay, Etsy, Shein, AliExpress, Wish, Wayfair, Zalando, ASOS, Depop, etc.
- messaging: WhatsApp Web, Telegram Web, Discord, Slack, Messenger, WeChat Web, Line, Kik, etc.
- forums: Reddit, Quora, 4chan, HackerNews (news.ycombinator.com), ProductHunt, Lemmy, etc.

Return ONLY the JSON object, nothing else.`;

async function fetchBlocklistFromAI() {
  const btn       = document.getElementById('refreshBlocklistBtn');
  const icon      = document.getElementById('refreshIcon');
  const loadRow   = document.getElementById('aiLoadingRow');
  const errRow    = document.getElementById('aiErrorRow');
  const metaText  = document.getElementById('aiMetaText');

  // UI state: loading
  btn.disabled = true;
  btn.classList.add('spinning');
  icon.textContent = 'refresh';
  loadRow.classList.remove('hidden');
  errRow.classList.add('hidden');
  document.getElementById('blocklistCategories').innerHTML = '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: BLOCKLIST_PROMPT }]
      })
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);

    const data = await response.json();
    const rawText = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Strip any accidental markdown fences
    const clean = rawText.replace(/```json|```/gi, '').trim();
    const blocklist = JSON.parse(clean);

    // Validate structure
    const validKeys = ['social','ott','gaming','news','adult','shopping','messaging','forums'];
    const hasKeys = validKeys.some(k => Array.isArray(blocklist[k]));
    if (!hasKeys) throw new Error('Unexpected response structure');

    // Save to storage + update state
    const now = new Date().toLocaleString();
    await saveBlocklist(blocklist);
    state.aiBlocklist = blocklist;

    metaText.textContent = `AI blocklist refreshed ${now} · stored locally`;
    renderBlocklistCategories(blocklist);

    // Push to background
    chrome.runtime.sendMessage({ type: 'UPDATE_BLOCKLIST', blocklist });

  } catch (err) {
    console.error('MindMode AI blocklist error:', err);
    errRow.classList.remove('hidden');
    document.getElementById('aiErrorText').textContent =
      err.message.includes('API error 401') ? 'API key error — check your setup' :
      err.message.includes('Failed to fetch') ? 'Network unavailable' :
      `Error: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.classList.remove('spinning');
    loadRow.classList.add('hidden');
  }
}

function saveBlocklist(blocklist) {
  return new Promise(resolve => {
    chrome.storage.local.get('mindmode', ({ mindmode }) => {
      const updated = { ...(mindmode || {}), aiBlocklist: blocklist };
      chrome.storage.local.set({ mindmode: updated }, resolve);
    });
  });
}

function renderBlocklistCategories(blocklist) {
  const container = document.getElementById('blocklistCategories');
  container.innerHTML = '';

  if (!blocklist || !Object.keys(blocklist).length) {
    container.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:10px">No blocklist yet — click Refresh to generate one.</div>`;
    return;
  }

  Object.entries(blocklist).forEach(([cat, domains]) => {
    if (!Array.isArray(domains) || !domains.length) return;
    const meta = CATEGORY_META[cat] || { icon: '🌐', label: cat };

    const el = document.createElement('div');
    el.className = 'bl-category';
    el.innerHTML = `
      <div class="bl-cat-header">
        <div class="bl-cat-left">
          <span class="bl-cat-icon">${meta.icon}</span>
          <span class="bl-cat-name">${meta.label}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="bl-cat-count">${domains.length} sites</span>
          <span class="material-symbols-rounded bl-cat-toggle">expand_more</span>
        </div>
      </div>
      <div class="bl-cat-body">
        ${domains.map(d => `<span class="bl-domain-tag">${d}</span>`).join('')}
      </div>
    `;

    el.querySelector('.bl-cat-header').addEventListener('click', () => {
      el.classList.toggle('expanded');
    });

    container.appendChild(el);
  });
}

function loadStoredBlocklist() {
  chrome.storage.local.get('mindmode', ({ mindmode }) => {
    const blocklist = mindmode?.aiBlocklist;
    if (blocklist) {
      renderBlocklistCategories(blocklist);
      const total = Object.values(blocklist).flat().length;
      document.getElementById('aiMetaText').textContent =
        `${total} sites blocked across ${Object.keys(blocklist).length} categories · stored locally`;
    } else {
      renderBlocklistCategories(null);
    }
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function openSettings() {
  showView('settingsView');
  if (!state) return;
  loadStoredBlocklist();
  renderWhitelistTags(state.whitelist || []);
  document.getElementById('maxTabsStudy').value    = state.maxTabs?.study    || 8;
  document.getElementById('maxTabsDeepwork').value = state.maxTabs?.deepwork || 5;
  renderSchedule(state.schedule || []);
}

function renderWhitelistTags(list) {
  const container = document.getElementById('whitelistTags');
  container.innerHTML = '';
  list.forEach((site, i) => {
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.innerHTML = `${site}<button class="tag-remove" data-index="${i}">×</button>`;
    container.appendChild(tag);
  });
  container.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      const updated = [...(state.whitelist || [])];
      updated.splice(idx, 1);
      state.whitelist = updated;
      renderWhitelistTags(updated);
    });
  });
}

function renderSchedule(schedule) {
  const container = document.getElementById('scheduleList');
  container.innerHTML = '';
  schedule.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'schedule-entry';
    row.innerHTML = `
      <input type="time" value="${entry.time || '09:00'}" data-field="time" data-index="${i}" />
      <select data-field="mode" data-index="${i}">
        <option value="study"    ${entry.mode==='study'   ?'selected':''}>📚 Study</option>
        <option value="deepwork" ${entry.mode==='deepwork'?'selected':''}>💻 Deep Work</option>
        <option value="chill"    ${entry.mode==='chill'   ?'selected':''}>🌙 Chill</option>
        <option value="free"     ${entry.mode==='free'    ?'selected':''}>🎮 Free</option>
      </select>
      <input type="number" value="${entry.duration || 45}" min="1" max="480" data-field="duration" data-index="${i}" style="width:52px" />
      <span style="font-size:11px;color:var(--text-tertiary)">min</span>
      <button class="schedule-remove" data-index="${i}">
        <span class="material-symbols-rounded">delete</span>
      </button>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('[data-field]').forEach(el => {
    el.addEventListener('change', () => {
      const idx = parseInt(el.dataset.index);
      const field = el.dataset.field;
      if (!state.schedule[idx]) return;
      state.schedule[idx][field] = el.type === 'number' ? parseInt(el.value) : el.value;
    });
  });

  container.querySelectorAll('.schedule-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      state.schedule.splice(parseInt(btn.dataset.index), 1);
      renderSchedule(state.schedule);
    });
  });
}

// ─── Event Bindings ───────────────────────────────────────────────────────────
function bindEvents() {

  // Mode cards
  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      if (state?.sessionActive) return;
      selectedMode = card.dataset.mode;

      document.querySelectorAll('.mode-card').forEach(c =>
        c.classList.toggle('active', c === card)
      );

      if (selectedMode === 'free') {
        chrome.runtime.sendMessage({ type: 'ACTIVATE_MODE', mode: 'free', duration: null }, () => {
          loadState();
          document.getElementById('durationPicker').classList.add('hidden');
        });
      } else {
        document.getElementById('durationPicker').classList.remove('hidden');
      }
    });
  });

  // Duration pills
  document.querySelectorAll('.dp-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dp-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDuration = parseInt(btn.dataset.min) || 0;
    });
  });

  // Start session
  document.getElementById('startSessionBtn').addEventListener('click', () => {
    if (!selectedMode || selectedMode === 'free') return;
    chrome.runtime.sendMessage({
      type: 'ACTIVATE_MODE',
      mode: selectedMode,
      duration: selectedDuration || null
    }, () => {
      document.getElementById('durationPicker').classList.add('hidden');
      loadState();
    });
  });

  // End session
  document.getElementById('endSessionBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'DEACTIVATE' }, (res) => {
      clearInterval(timerInterval);
      state = { ...state, sessionActive: false, mode: 'free' };
      selectedMode = null;
      if (res?.summary) showSummary(res.summary);
      else loadState();
    });
  });

  // Dismiss summary
  document.getElementById('dismissSummary').addEventListener('click', () => {
    selectedMode = null;
    loadState();
  });

  // Header nav
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('aboutBtn').addEventListener('click', () => showView('aboutView'));
  document.getElementById('settingsBackBtn').addEventListener('click', () => loadState());
  document.getElementById('aboutBackBtn').addEventListener('click', () => loadState());

  // AI blocklist refresh
  document.getElementById('refreshBlocklistBtn').addEventListener('click', fetchBlocklistFromAI);

  // Add whitelist
  document.getElementById('addWhitelistBtn').addEventListener('click', addWhitelistItem);
  document.getElementById('whitelistInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') addWhitelistItem();
  });

  function addWhitelistItem() {
    const input = document.getElementById('whitelistInput');
    const val = input.value.trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!val || !val.includes('.')) return;
    if (!state.whitelist) state.whitelist = [];
    if (!state.whitelist.includes(val)) {
      state.whitelist.push(val);
      renderWhitelistTags(state.whitelist);
    }
    input.value = '';
  }

  // Add schedule entry
  document.getElementById('addScheduleBtn').addEventListener('click', () => {
    if (!state.schedule) state.schedule = [];
    state.schedule.push({ id: Date.now().toString(), time: '09:00', mode: 'study', duration: 45 });
    renderSchedule(state.schedule);
  });

  // Save settings
  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    const updates = {
      whitelist: state.whitelist || [],
      maxTabs: {
        study:    parseInt(document.getElementById('maxTabsStudy').value)    || 8,
        deepwork: parseInt(document.getElementById('maxTabsDeepwork').value) || 5,
        chill:    20, free: null
      },
      schedule: state.schedule || []
    };

    chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', updates }, () => {
      chrome.runtime.sendMessage({ type: 'UPDATE_SCHEDULE', schedule: updates.schedule }, () => {
        loadState();
      });
    });
  });
}
