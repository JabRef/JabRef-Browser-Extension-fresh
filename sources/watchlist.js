/**
 * Watchlist stored in browser.storage.sync for cross-device syncing.
 * Each entry: { id, bibtex, title, citationKey, savedAt }
 */

const STORAGE_KEY = 'watchlist';

if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

async function load() {
  const res = await browser.storage.sync.get({ [STORAGE_KEY]: [] });
  return res[STORAGE_KEY] || [];
}

async function save(entries) {
  await browser.storage.sync.set({ [STORAGE_KEY]: entries });
}

function parseBibtexMeta(bibtex) {
  let title = '';
  let citationKey = '';

  const keyMatch = bibtex.match(/@\w+\{([^,]+),/);
  if (keyMatch) {
    citationKey = keyMatch[1].trim();
  }

  const titleMatch = bibtex.match(/title\s*=\s*\{([^}]+)\}/i);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  return { title, citationKey };
}

export async function getAll() {
  return load();
}

export async function add(bibtex) {
  const entries = await load();
  const { title, citationKey } = parseBibtexMeta(bibtex);
  const entry = {
    id: crypto.randomUUID(),
    bibtex,
    title: title || citationKey || 'Untitled',
    citationKey,
    savedAt: Date.now(),
  };
  entries.push(entry);
  await save(entries);
  return entry;
}

export async function remove(id) {
  const entries = await load();
  const filtered = entries.filter(e => e.id !== id);
  await save(filtered);
}

export async function clear() {
  await save([]);
}

export async function count() {
  const entries = await load();
  return entries.length;
}
