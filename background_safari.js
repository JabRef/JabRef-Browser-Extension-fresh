// background_safari.js
import { DOMParser } from './sources/vendor/linkedom.js';
import { runTranslatorOnHtml } from './sources/translatorRunner.js';

// Shim DOMParser for Safari
if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = DOMParser;
}
// Ensure DOMParser is also on window if it exists
if (typeof window !== 'undefined' && typeof window.DOMParser === 'undefined') {
  window.DOMParser = DOMParser;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'getManifest') {
    (async () => {
      try {
        const url = chrome.runtime.getURL('translators/manifest.json');
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

  (async () => {
    const { translatorPath, translators, url } = msg;
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
          const result = await runTranslatorOnHtml(t, html, url);
          if (result !== null && typeof result !== 'undefined') return { result, translator: t };
          throw new Error('No result');
        } catch (e) {
          // Wrap error with translator id for diagnostics
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
        chrome.runtime.sendMessage({ type: 'offscreenResult', url, result, translator: successful });
        sendResponse({ ok: true });
      } catch (errors) {
        // All attempts failed
        const last = Array.isArray(errors) && errors.length ? errors[errors.length - 1] : errors;
        const msg = last && last.err ? String(last.err) : String(last || 'All translators failed');
        chrome.runtime.sendMessage({ type: 'offscreenResult', url, error: msg });
        sendResponse({ ok: false, error: msg });
      }
    } catch (e) {
      chrome.runtime.sendMessage({ type: 'offscreenResult', url, error: String(e) });
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;
});
