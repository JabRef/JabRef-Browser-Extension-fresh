import { runTranslators } from './sources/offscreenRunner.js';

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'runTranslator') return;
  const { url, translatorPath, translators } = msg;
  try {
    const resp = await fetch(url, { credentials: 'omit' });
    const html = await resp.text();

    const list = Array.isArray(translators) && translators.length ? translators : (translatorPath ? [translatorPath] : []);
    if (!list.length) throw new Error('No translator paths provided');

    const { result, translator: successful, error } = await runTranslators(list, html, url, { mode: 'serial' });
    if (result) {
      chrome.runtime.sendMessage({ type: 'offscreenResult', url, result, translator: successful });
      sendResponse({ ok: true });
    } else {
      const msgErr = error ? String(error) : 'No translator produced a result';
      chrome.runtime.sendMessage({ type: 'offscreenResult', url, error: msgErr });
      sendResponse({ ok: false, error: msgErr });
    }
  } catch (e) {
    chrome.runtime.sendMessage({ type: 'offscreenResult', url, error: String(e) });
    sendResponse({ ok: false, error: String(e) });
  }
  return true;
});
