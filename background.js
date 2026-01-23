// background.js
import { DOMParser as LinkeDOMParser } from './sources/vendor/linkedom.js';
import { runTranslatorOnHtml } from './sources/translatorRunner.js';

// Shim DOMParser for Safari and other environments without it in the background
if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = LinkeDOMParser;
}
if (typeof window !== 'undefined' && typeof window.DOMParser === 'undefined') {
  window.DOMParser = LinkeDOMParser;
}

// Provide a minimal compatibility shim: if `browser` is missing, alias it to `chrome`.
if (typeof browser === "undefined" && typeof chrome !== "undefined") {
  globalThis.browser = chrome;
}

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
          const mod = await import(translatorUrl);
          const result = await runTranslatorOnHtml(mod, html, url);
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
