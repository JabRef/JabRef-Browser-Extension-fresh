import * as api from './sources/jabref-api.js';
import * as watchlist from './sources/watchlist.js';

if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------
const ImportState = {
  LOADING: 'loading',
  DETECTED: 'detected',
  IMPORTED: 'success',
  STARTING: 'starting',
  DISCONNECTED: 'disconnected',
  PAIRING: 'pairing',
  NO_METADATA: 'no-metadata',
};

const appState = {
  importState: ImportState.LOADING,
  bibtex: null,
  connected: false,
  needsPairing: false,
  activeTab: 'import',
  settingsOpen: false,
  watchlistEntries: [],
  pinError: null,
};

function setState(patch) {
  Object.assign(appState, patch);
  render();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function render() {
  const { importState, bibtex, connected, needsPairing, activeTab, settingsOpen, watchlistEntries, pinError } = appState;

  // Status dot + text
  const dot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  dot.className = 'status-dot';

  if (needsPairing) {
    dot.classList.add('pairing');
    statusText.textContent = 'Not paired';
  } else if (importState === ImportState.STARTING) {
    dot.classList.add('starting');
    statusText.textContent = 'Starting...';
  } else if (connected) {
    dot.classList.add('connected');
    statusText.textContent = 'Connected';
  } else {
    dot.classList.add('disconnected');
    statusText.textContent = 'Disconnected';
  }

  // Tab nav visibility
  const tabNav = document.getElementById('tabNav');
  tabNav.style.display = needsPairing ? 'none' : '';

  // Tab active state
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
  });

  // Watchlist badge
  const badge = document.getElementById('watchlistBadge');
  const count = watchlistEntries.length;
  badge.textContent = count;
  badge.style.display = count > 0 ? '' : 'none';

  // Panels
  document.querySelectorAll('.panel').forEach(p => {
    p.classList.remove('active');
    p.style.display = '';
  });
  if (needsPairing) {
    document.getElementById('panel-pairing').style.display = 'block';
    document.getElementById('panel-pairing').classList.add('active');
  } else if (activeTab === 'watchlist') {
    document.getElementById('panel-watchlist').classList.add('active');
    renderWatchlist();
  } else {
    document.getElementById('panel-import').classList.add('active');
  }

  // Import sub-panels
  const subs = ['import-detected', 'import-success', 'import-starting', 'import-disconnected', 'import-no-metadata', 'import-loading'];
  const activeSubId = needsPairing ? null : `import-${importState}`;
  subs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === activeSubId ? '' : 'none';
  });

  // Fill BibTeX previews
  if (bibtex) {
    ['bibPreview', 'bibPreviewSuccess', 'bibPreviewStarting'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = bibtex;
    });
  }

  // Pin error
  const pinErrorEl = document.getElementById('pinError');
  if (pinError) {
    pinErrorEl.textContent = pinError;
    pinErrorEl.classList.add('visible');
  } else {
    pinErrorEl.classList.remove('visible');
  }

  // Settings overlay
  document.getElementById('settingsOverlay').classList.toggle('active', settingsOpen);
  document.getElementById('logSection').style.display = settingsOpen ? 'none' : '';
}

function renderWatchlist() {
  const container = document.getElementById('watchlist-items');
  const emptyState = document.getElementById('watchlist-empty-state');
  const entries = appState.watchlistEntries;

  if (!entries.length) {
    container.innerHTML = '';
    emptyState.style.display = '';
    return;
  }

  emptyState.style.display = 'none';
  container.innerHTML = entries.map(entry => `
    <div class="watchlist-item" data-id="${entry.id}">
      <div class="watchlist-item-content">
        <div class="watchlist-item-title">${escapeHtml(entry.title)}</div>
        ${entry.citationKey ? `<div class="watchlist-item-key">${escapeHtml(entry.citationKey)}</div>` : ''}
        <div class="watchlist-item-date">${formatDate(entry.savedAt)}</div>
      </div>
      <button class="btn btn-danger watchlist-remove-btn" data-id="${entry.id}" title="Remove">&#10005;</button>
    </div>
  `).join('') + `
    <div class="watchlist-actions">
      <button class="btn btn-primary" id="importAllBtn" style="width:100%"><span class="btn-icon">&#8599;</span> Import all to JabRef</button>
    </div>
  `;

  container.querySelectorAll('.watchlist-remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await watchlist.remove(btn.dataset.id);
      await refreshWatchlist();
    });
  });

  const importAllBtn = document.getElementById('importAllBtn');
  if (importAllBtn) {
    importAllBtn.addEventListener('click', importAllWatchlist);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Saved just now';
  if (mins < 60) return `Saved ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Saved ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Saved ${days}d ago`;
}

async function refreshWatchlist() {
  const entries = await watchlist.getAll();
  setState({ watchlistEntries: entries });
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
function appendLog(text, level = 'info') {
  const logInner = document.getElementById('logInner');
  if (!logInner) return;
  const div = document.createElement('div');
  div.className = `log-line ${level}`;
  div.textContent = text;
  logInner.appendChild(div);
  logInner.scrollTop = logInner.scrollHeight;
}

// ---------------------------------------------------------------------------
// Translator execution (reuses existing offscreen/background messaging)
// ---------------------------------------------------------------------------
async function findMatchesForUrl(url) {
  const manifestUrl = browser.runtime.getURL('translators/manifest.json');
  const resp = await fetch(manifestUrl);
  const list = await resp.json();
  const matches = [];
  for (const entry of list) {
    const target = (entry && entry.target) || '';
    if (!target) continue;
    try {
      if (new RegExp(target).test(url)) matches.push(entry);
    } catch {
      // skip invalid regex
    }
  }
  return matches;
}

async function ensureOffscreen() {
  if (!browser.offscreen) return false;
  const has = await browser.offscreen.hasDocument();
  if (has) return true;
  try {
    await browser.offscreen.createDocument({
      url: browser.runtime.getURL('offscreen.html'),
      reasons: ['DOM_PARSER'],
      justification: 'Run translators offscreen',
    });
    return true;
  } catch {
    return false;
  }
}

let translatorResolve = null;

async function runTranslators(translatorPaths, url) {
  await ensureOffscreen();
  return new Promise((resolve) => {
    translatorResolve = resolve;

    const payload = { type: 'runTranslator', translators: translatorPaths, url };
    appendLog(`Running translators for ${url}`, 'info');
    browser.runtime.sendMessage(payload).catch(() => {
      // Chrome may not return a response from the background message listener
    });

    // Timeout after 15 seconds
    setTimeout(() => {
      if (translatorResolve === resolve) {
        translatorResolve = null;
        resolve(null);
      }
    }, 15000);
  });
}

browser.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'offscreenResult') return;
  if (msg.error) {
    appendLog(`Translator error: ${msg.error}`, 'error');
    if (translatorResolve) {
      const r = translatorResolve;
      translatorResolve = null;
      r(null);
    }
    return;
  }
  appendLog(`Received result for ${msg.url}`, 'success');
  const result = msg.result;
  const bibtex = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  if (translatorResolve) {
    const r = translatorResolve;
    translatorResolve = null;
    r(bibtex);
  }
});

// ---------------------------------------------------------------------------
// Import flow
// ---------------------------------------------------------------------------
async function doImport() {
  if (!appState.bibtex) return;

  appendLog('Sending BibTeX to JabRef...', 'info');
  const result = await api.sendBibEntry(appState.bibtex);

  if (result.ok) {
    appendLog('BibTeX entry sent successfully.', 'success');
    setState({ importState: ImportState.IMPORTED, connected: true });
    return;
  }

  if (result.status === 401) {
    appendLog('Unauthorized — token missing or invalid.', 'error');
    setState({ needsPairing: true });
    return;
  }

  // Network error — delegate launch+import to background service worker.
  // The background survives even when the popup closes (tab focus change).
  const launchEnabled = await api.getSetting('launchJabRef', true);
  if (launchEnabled && result.status === 0) {
    appendLog('JabRef unreachable — launching and importing in background...', 'info');
    setState({ importState: ImportState.STARTING });

    browser.runtime.sendMessage({
      type: 'importWithLaunch',
      bibtex: appState.bibtex,
    }).catch(() => { });
    return;
  }

  // Save to watchlist on failure
  appendLog('Could not send — saving to watchlist.', 'warning');
  await watchlist.add(appState.bibtex);
  await refreshWatchlist();
  setState({ importState: ImportState.DISCONNECTED, connected: false });
}

async function importAllWatchlist() {
  const entries = await watchlist.getAll();
  if (!entries.length) return;

  let successCount = 0;
  for (const entry of entries) {
    const result = await api.sendBibEntry(entry.bibtex);
    if (result.ok) {
      await watchlist.remove(entry.id);
      successCount++;
    } else {
      appendLog(`Failed to import "${entry.title}": ${result.error}`, 'error');
      break;
    }
  }

  if (successCount > 0) {
    appendLog(`Imported ${successCount} watchlist entries.`, 'success');
  }
  await refreshWatchlist();
}

// ---------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------
function getPinValue() {
  const inputs = document.querySelectorAll('#pinRow .pin-digit');
  return Array.from(inputs).map(i => i.value).join('');
}

async function doPairing() {
  const pin = getPinValue();
  if (pin.length !== 6) {
    setState({ pinError: 'Please enter all 6 digits.' });
    return;
  }

  appendLog(`Pairing with PIN ${pin}...`, 'info');
  const result = await api.pair(pin);

  if (result.ok) {
    appendLog('Pairing successful.', 'success');
    setState({ needsPairing: false, connected: true, pinError: null });
    await runDetection();
  } else {
    appendLog(`Pairing failed: ${result.error}`, 'error');
    setState({ pinError: result.error || 'Invalid PIN. Generate a new PIN in JabRef preferences.' });
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
async function loadSettings() {
  const port = await api.getSetting('jabrefPort', 23119);
  const autoImport = await api.getSetting('autoImport', false);
  const launchJabRefSetting = await api.getSetting('launchJabRef', true);
  const autoImportWatchlist = await api.getSetting('autoImportWatchlist', false);

  document.getElementById('settingPort').value = port;
  document.getElementById('settingAutoImport').checked = autoImport;
  document.getElementById('settingLaunchJabRef').checked = launchJabRefSetting;
  document.getElementById('settingAutoImportWatchlist').checked = autoImportWatchlist;
}

function initSettingsListeners() {
  document.getElementById('settingPort').addEventListener('change', async (e) => {
    const val = parseInt(e.target.value, 10);
    if (val > 0 && val <= 65535) {
      await api.setSetting('jabrefPort', val);
    }
  });

  ['settingAutoImport', 'settingLaunchJabRef', 'settingAutoImportWatchlist'].forEach(id => {
    const key = id.replace('setting', '');
    const storageKey = key.charAt(0).toLowerCase() + key.slice(1);
    document.getElementById(id).addEventListener('change', async (e) => {
      await api.setSetting(storageKey, e.target.checked);
    });
  });

  document.getElementById('disconnectBtn').addEventListener('click', async () => {
    await api.clearToken();
    appendLog('Token cleared. You need to pair again.', 'warning');
    setState({ needsPairing: true, connected: false, settingsOpen: false });
  });
}

// ---------------------------------------------------------------------------
// Detection flow (run on popup open)
// ---------------------------------------------------------------------------
async function runDetection() {
  setState({ importState: ImportState.LOADING });

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    const url = tab && tab.url ? tab.url : '';

    if (!url || url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('chrome-extension://') || url.startsWith('moz-extension://') || url.startsWith('safari-extension://')) {
      setState({ importState: ImportState.NO_METADATA });
      return;
    }

    appendLog(`URL: ${url}`, 'info');
    const matches = await findMatchesForUrl(url);

    if (!matches || !matches.length) {
      appendLog('No matching translators found.', 'warning');
      setState({ importState: ImportState.NO_METADATA });
      return;
    }

    appendLog(`Found ${matches.length} translator(s).`, 'info');
    const translatorPaths = matches.map(m => m.path || '');
    const bibtex = await runTranslators(translatorPaths, url);

    if (bibtex && bibtex.trim()) {
      setState({ importState: ImportState.DETECTED, bibtex });
    } else {
      setState({ importState: ImportState.NO_METADATA });
    }
  } catch (e) {
    appendLog(`Detection error: ${e.message || e}`, 'error');
    setState({ importState: ImportState.NO_METADATA });
  }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await refreshWatchlist();
  initSettingsListeners();

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setState({ activeTab: btn.dataset.tab });
    });
  });

  // Gear / settings
  document.getElementById('gearBtn').addEventListener('click', () => {
    setState({ settingsOpen: true });
  });
  document.getElementById('settingsBack').addEventListener('click', () => {
    setState({ settingsOpen: false });
  });

  // Log toggle
  const logToggle = document.getElementById('logToggle');
  const logContent = document.getElementById('logContent');
  logToggle.addEventListener('click', () => {
    logToggle.classList.toggle('open');
    logContent.classList.toggle('open');
  });

  // PIN input behavior
  const pinDigits = document.querySelectorAll('#pinRow .pin-digit');

  function checkAutoSubmit() {
    const pin = Array.from(pinDigits).map(i => i.value).join('');
    if (pin.length === 6 && /^\d{6}$/.test(pin)) {
      doPairing();
    }
  }

  pinDigits.forEach((input, i, all) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '');
      if (input.value && i < all.length - 1) all[i + 1].focus();
      input.classList.toggle('filled', !!input.value);
      checkAutoSubmit();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && i > 0) {
        all[i - 1].focus();
      }
    });
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if (!pasted) return;
      for (let j = 0; j < Math.min(pasted.length, all.length - i); j++) {
        all[i + j].value = pasted[j];
        all[i + j].classList.toggle('filled', true);
      }
      const lastFilled = Math.min(i + pasted.length, all.length) - 1;
      all[lastFilled].focus();
      checkAutoSubmit();
    });
  });

  // Action buttons
  document.getElementById('importBtn').addEventListener('click', doImport);
  document.getElementById('watchBtn').addEventListener('click', async () => {
    if (appState.bibtex) {
      await watchlist.add(appState.bibtex);
      await refreshWatchlist();
      appendLog('Entry added to watchlist.', 'success');
    }
  });
  document.getElementById('importAgainBtn').addEventListener('click', doImport);
  document.getElementById('watchBtnSuccess').addEventListener('click', async () => {
    if (appState.bibtex) {
      await watchlist.add(appState.bibtex);
      await refreshWatchlist();
      appendLog('Entry added to watchlist.', 'success');
    }
  });
  document.getElementById('retryBtn').addEventListener('click', doImport);
  document.getElementById('openWatchlistBtn').addEventListener('click', () => {
    setState({ activeTab: 'watchlist' });
  });
  document.getElementById('pairBtn').addEventListener('click', doPairing);

  // Initial render
  render();

  // Health check (non-blocking status update)
  appendLog('Checking JabRef connection...', 'info');
  const health = await api.healthCheck();

  if (health.reachable) {
    if (health.needsPairing) {
      appendLog('JabRef reachable but requires pairing (401).', 'error');
      setState({ connected: true, needsPairing: true });
      return;
    }
    appendLog('JabRef reachable.', 'success');
    setState({ connected: true });
  } else {
    appendLog('JabRef not reachable.', 'warning');
    setState({ connected: false });
  }

  // Run detection
  await runDetection();

  // Auto-import watchlist if enabled and connected
  const autoImportWl = await api.getSetting('autoImportWatchlist', false);
  if (autoImportWl && appState.connected && !appState.needsPairing) {
    const wlEntries = await watchlist.getAll();
    if (wlEntries.length > 0) {
      appendLog('Auto-importing watchlist entries...', 'info');
      await importAllWatchlist();
    }
  }

  // Auto-import current page if enabled
  const autoImport = await api.getSetting('autoImport', false);
  if (autoImport && appState.bibtex && appState.connected && !appState.needsPairing) {
    appendLog('Auto-importing detected entry...', 'info');
    await doImport();
  }
});
