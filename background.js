import { DOMParser as LinkeDOMParser } from './sources/vendor/linkedom.js';
import { runTranslatorOnHtml } from './sources/translatorRunner.js';
import * as api from './sources/jabref-api.js';
import * as watchlist from './sources/watchlist.js';

if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = LinkeDOMParser;
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.window.DOMParser === 'undefined') {
  globalThis.window.DOMParser = LinkeDOMParser;
}

console.debug('[background] module loaded');

if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

// ---------------------------------------------------------------------------
// Offscreen document management (Chrome only)
// ---------------------------------------------------------------------------
async function ensureOffscreen() {
  if (!browser.offscreen) return false;
  const has = await browser.offscreen.hasDocument();
  if (has) return true;
  try {
    await browser.offscreen.createDocument({
      url: browser.runtime.getURL('offscreen.html'),
      reasons: ['DOM_PARSER'],
      justification: 'Run translators',
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Run translators via offscreen document (Chrome) or directly (Firefox)
// ---------------------------------------------------------------------------
async function runTranslatorsInBackground(translatorPaths, url) {
  if (browser.offscreen) {
    await ensureOffscreen();
    return new Promise((resolve) => {
      const handler = (msg) => {
        if (!msg || msg.type !== 'offscreenResult' || msg.url !== url) return;
        browser.runtime.onMessage.removeListener(handler);
        if (msg.error) {
          console.warn('[background] translator error via offscreen:', msg.error);
          resolve(null);
        } else {
          const result = msg.result;
          resolve(result != null ? (typeof result === 'string' ? result : JSON.stringify(result, null, 2)) : null);
        }
      };
      browser.runtime.onMessage.addListener(handler);
      browser.runtime.sendMessage({ type: 'runTranslator', translators: translatorPaths, url }).catch(() => { });
      setTimeout(() => {
        browser.runtime.onMessage.removeListener(handler);
        resolve(null);
      }, 15000);
    });
  }

  // Firefox/Safari: run directly (background has DOM access)
  const pageResp = await fetch(url, { credentials: 'omit' });
  const html = await pageResp.text();
  for (const t of translatorPaths) {
    try {
      const translatorUrl = browser.runtime.getURL(t);
      const result = await runTranslatorOnHtml(translatorUrl, html, url);
      if (result != null) {
        return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      }
    } catch (e) {
      console.warn('[background] translator failed:', t, e);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Find matching translators for a URL
// ---------------------------------------------------------------------------
async function findMatches(url) {
  const manifestUrl = browser.runtime.getURL('translators/manifest.json');
  const resp = await fetch(manifestUrl);
  const list = await resp.json();
  const matches = [];
  for (const entry of list) {
    const target = (entry && entry.target) || '';
    if (!target) continue;
    try {
      if (new RegExp(target).test(url)) matches.push(entry);
    } catch { /* skip invalid regex */ }
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Launch JabRef via protocol handler, poll, send bibtex, close tab
// ---------------------------------------------------------------------------
async function launchAndImport(bibtex) {
  let phTabId = null;
  try {
    const tab = await browser.tabs.create({ url: 'jabref://open', active: true });
    phTabId = tab && tab.id;
    console.debug('[background] protocol handler tab opened, id:', phTabId);
  } catch (e) {
    console.warn('[background] protocol handler tab failed', e);
  }

  const reachable = await api.pollUntilReachable(20000, 1000);

  // Close protocol handler tab once JabRef is up (or on timeout)
  if (phTabId) {
    console.debug('[background] closing protocol handler tab', phTabId);
    try { await browser.tabs.remove(phTabId); } catch { /* already closed */ }
  }

  if (!reachable) return false;

  // Check if pairing is needed before attempting import
  const health = await api.healthCheck();
  if (health.needsPairing) {
    console.debug('[background] JabRef reachable but needs pairing — skipping import');
    return false;
  }

  const result = await api.sendBibEntry(bibtex);
  return result.ok;
}

// ---------------------------------------------------------------------------
// Direct-import keyboard shortcut (Alt+Shift+J)
// ---------------------------------------------------------------------------
browser.commands.onCommand.addListener(async (command) => {
  if (command !== 'import_to_jabref') return;
  console.debug('[background] import_to_jabref command received');

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    const url = tab && tab.url ? tab.url : '';

    if (!url || url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('chrome-extension://') || url.startsWith('moz-extension://') || url.startsWith('safari-extension://')) {
      console.debug('[background] skipping non-web URL:', url);
      return;
    }

    const matches = await findMatches(url);
    if (!matches.length) {
      console.debug('[background] no matching translators for', url);
      return;
    }

    const translatorPaths = matches.map(m => m.path || '');
    const bibtex = await runTranslatorsInBackground(translatorPaths, url);

    if (!bibtex || !bibtex.trim()) {
      console.debug('[background] no BibTeX result for', url);
      return;
    }

    // Send to JabRef
    const result = await api.sendBibEntry(bibtex);
    if (result.ok) {
      console.debug('[background] direct-import successful');
      return;
    }

    // If unreachable, try protocol handler
    if (result.status === 0) {
      const launchEnabled = await api.getSetting('launchJabRef', true);
      if (launchEnabled) {
        console.debug('[background] launching JabRef via protocol handler');
        const imported = await launchAndImport(bibtex);
        if (imported) {
          console.debug('[background] direct-import successful after protocol handler');
          return;
        }
      }
      console.debug('[background] saving to watchlist');
      await watchlist.add(bibtex);
    }
  } catch (e) {
    console.error('[background] direct-import error:', e);
  }
});

// ---------------------------------------------------------------------------
// Existing message listener for translator execution
// ---------------------------------------------------------------------------
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'importWithLaunch') {
    (async () => {
      const { bibtex } = msg;
      console.debug('[background] importWithLaunch — saving to watchlist and launching');
      const entry = await watchlist.add(bibtex);

      const imported = await launchAndImport(bibtex);
      if (imported) {
        console.debug('[background] importWithLaunch — success, removing from watchlist');
        await watchlist.remove(entry.id);
      } else {
        console.debug('[background] importWithLaunch — failed, entry stays in watchlist');
      }
      sendResponse({ ok: true, imported });
    })();
    return true;
  }

  if (msg && msg.type === 'getManifest') {
    (async () => {
      try {
        const url = browser.runtime.getURL('translators/manifest.json');
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const manifest = await resp.json();
        sendResponse({ ok: true, manifest });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  if (!msg || msg.type !== 'runTranslator') return;

  const { translatorPath, translators, url } = msg;

  // If offscreen is available (Chrome), forward the request so the offscreen
  // document runs the translator. If not (Firefox/Safari), run the translator
  // directly from the background page which has a DOM (or shimmed DOM).
  if (browser.offscreen) {
    // In Chrome, we don't need to do anything here because the content script
    // or popup should have opened the offscreen document and sent the message
    // there. However, if it was sent to background, we just acknowledge.
    sendResponse({ ok: true });
    return;
  }

  // Firefox / Safari / no offscreen: fetch page HTML and run translator here.
  (async () => {
    try {
      const resp = await fetch(url, { credentials: 'omit' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const html = await resp.text();

      // Normalize translators list: accept either `translators` array or single `translatorPath`.
      const list = Array.isArray(translators) && translators.length ? translators : (translatorPath ? [translatorPath] : []);
      if (!list.length) throw new Error('No translator paths provided');

      // Run all translator attempts in parallel and resolve with the first
      // successful (non-null/defined) result. We don't attempt to cancel other
      // promises; they will continue running in the background.
      const attempts = list.map((t) => (async () => {
        try {
          // In background.js we need to import the translator module because
          // we are running in the extension context.
          const translatorUrl = browser.runtime.getURL(t);
          const result = await runTranslatorOnHtml(translatorUrl, html, url);
          if (result !== null && typeof result !== 'undefined') return { result, translator: t };
          throw new Error('No result');
        } catch (e) {
          throw { err: e, translator: t };
        }
      })());

      // Custom Promise.any fallback to collect first fulfilled promise
      const firstFulfilled = (proms) => new Promise((resolve, reject) => {
        let pending = proms.length;
        const errors = [];
        proms.forEach(p => {
          p.then(resolve).catch(e => {
            errors.push(e);
            pending -= 1;
            if (pending === 0) reject(errors);
          });
        });
      });

      try {
        const { result, translator: successful } = await firstFulfilled(attempts);
        await browser.runtime.sendMessage({ type: 'offscreenResult', url, result, translator: successful });
        sendResponse({ ok: true });
      } catch (errors) {
        // All attempts failed
        const last = Array.isArray(errors) && errors.length ? errors[errors.length - 1] : errors;
        const msg = last && last.err ? String(last.err) : String(last || 'All translators failed');
        await browser.runtime.sendMessage({ type: 'offscreenResult', url, error: msg });
        sendResponse({ ok: false, error: msg });
      }
    } catch (e) {
      await browser.runtime.sendMessage({ type: 'offscreenResult', url, error: String(e) });
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;
});
