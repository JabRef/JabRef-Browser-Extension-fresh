// background.js (sketch)
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'runTranslator') return;

  const { translatorPath, translators, url } = msg;

  // If Chrome supports offscreen documents, forward the request so the
  // offscreen document runs the translator. If not (Firefox or Chrome without
  // offscreen), run the translator directly from the background page which
  // has a DOM. The translator iteration and execution logic is implemented
  // in `sources/offscreenRunner.js` to avoid duplicating that behavior here
  // and in `offscreen.js`.
  if (chrome.offscreen) {
    try {
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  }

  // Firefox / no offscreen: fetch page HTML and run translator here.
  try {
    const resp = await fetch(url, { credentials: 'omit' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    // Normalize translators list: accept either `translators` array or single `translatorPath`.
    const list = Array.isArray(translators) && translators.length ? translators : (translatorPath ? [translatorPath] : []);
    if (!list.length) throw new Error('No translator paths provided');

    // Use the shared offscreenRunner helper to avoid duplicating iteration
    // and execution logic present in `offscreen.js`.
    const runner = await import(chrome.runtime.getURL('sources/offscreenRunner.js'));
    const { runTranslators } = runner;
    const { result, translator: successful, error } = await runTranslators(list, html, url, { mode: 'parallel' });

    if (result) {
      chrome.runtime.sendMessage({ type: 'offscreenResult', url, result, translator: successful });
      sendResponse({ ok: true });
    } else {
      const msg = error ? String(error) : 'All translators failed';
      chrome.runtime.sendMessage({ type: 'offscreenResult', url, error: msg });
      sendResponse({ ok: false, error: msg });
    }
  } catch (e) {
    chrome.runtime.sendMessage({ type: 'offscreenResult', url, error: String(e) });
    sendResponse({ ok: false, error: String(e) });
  }
  return true;
});