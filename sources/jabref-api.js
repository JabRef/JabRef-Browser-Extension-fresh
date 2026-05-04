/**
 * JabRef HTTP API client.
 *
 * Handles health checks, BibTeX import, PIN-based pairing, and poll-retry.
 * All requests to JabRef include the required security headers.
 */

const DEFAULT_PORT = 23119;
const TOKEN_KEY = 'connectorToken';
const PORT_KEY = 'jabrefPort';

if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

export async function getPort() {
  const res = await browser.storage.local.get({ [PORT_KEY]: DEFAULT_PORT });
  return res[PORT_KEY] || DEFAULT_PORT;
}

export async function getBaseUrl() {
  const port = await getPort();
  return `http://localhost:${port}/`;
}

export async function getToken() {
  const res = await browser.storage.local.get({ [TOKEN_KEY]: null });
  return res[TOKEN_KEY] || null;
}

export async function setToken(token) {
  await browser.storage.local.set({ [TOKEN_KEY]: token });
}

export async function clearToken() {
  await browser.storage.local.remove(TOKEN_KEY);
}

async function buildHeaders() {
  const headers = { 'X-JabRef-Connector': 'true' };
  const token = await getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Check whether JabRef is reachable.
 * Returns { reachable, needsPairing, status }.
 *   - GET / with no Origin header bypasses the security filter.
 */
export async function healthCheck() {
  try {
    const base = await getBaseUrl();
    const resp = await fetch(base, { method: 'GET', cache: 'no-store' });
    if (resp.status === 401) {
      return { reachable: true, needsPairing: true, status: 401 };
    }
    return { reachable: resp.ok || resp.status === 404, needsPairing: false, status: resp.status };
  } catch {
    return { reachable: false, needsPairing: false, status: 0 };
  }
}

/**
 * Send a BibTeX entry to JabRef.
 * Returns { ok, status, error }.
 */
export async function sendBibEntry(bibtex) {
  const base = await getBaseUrl();
  const url = base + 'libraries/current/entries';
  const headers = await buildHeaders();
  headers['Content-Type'] = 'application/x-bibtex';

  try {
    const resp = await fetch(url, { method: 'POST', headers, body: bibtex });
    if (resp.ok) {
      return { ok: true, status: resp.status };
    }
    const text = await resp.text().catch(() => '');
    return { ok: false, status: resp.status, error: text || `HTTP ${resp.status}` };
  } catch (e) {
    return { ok: false, status: 0, error: e.message || String(e) };
  }
}

/**
 * Exchange a 6-digit PIN for a bearer token.
 * Returns { ok, token, error }.
 */
export async function pair(pin) {
  const base = await getBaseUrl();
  const url = base + 'auth/pair';
  const headers = await buildHeaders();
  headers['Content-Type'] = 'application/json';

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pin }),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.token) {
        await setToken(data.token);
        return { ok: true, token: data.token };
      }
      return { ok: false, error: 'No token in response' };
    }

    const data = await resp.json().catch(() => ({}));
    return { ok: false, error: data.error || `HTTP ${resp.status}` };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Poll until JabRef becomes reachable or timeout is reached.
 * Returns true if reachable within the timeout.
 */
export async function pollUntilReachable(timeoutMs = 20000, intervalMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { reachable } = await healthCheck();
    if (reachable) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Read a boolean or numeric setting from storage.
 */
export async function getSetting(key, defaultValue) {
  const res = await browser.storage.local.get({ [key]: defaultValue });
  return res[key];
}

export async function setSetting(key, value) {
  await browser.storage.local.set({ [key]: value });
}
