import { runTranslatorOnHtml } from './translatorRunner.js';

// Try translators sequentially, returning the first non-null/defined result
export async function tryTranslatorsSerial(list, html, url) {
  let lastError = null;
  for (const t of list) {
    try {
      const result = await runTranslatorOnHtml(t, html, url);
      if (result !== null && typeof result !== 'undefined') return { result, translator: t };
    } catch (e) {
      lastError = e;
      continue;
    }
  }
  return { error: lastError };
}

// Try translators in parallel and return first fulfilled
export async function tryTranslatorsParallel(list, html, url) {
  const attempts = list.map((t) => (async () => {
    try {
      const result = await runTranslatorOnHtml(t, html, url);
      if (result !== null && typeof result !== 'undefined') return { result, translator: t };
      throw new Error('No result');
    } catch (e) {
      throw { err: e, translator: t };
    }
  })());

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
    return await firstFulfilled(attempts);
  } catch (errors) {
    return { error: errors };
  }
}

export async function runTranslators(list, html, url, { mode = 'serial' } = {}) {
  if (!Array.isArray(list) || !list.length) return { error: new Error('No translator paths provided') };
  if (mode === 'parallel') return await tryTranslatorsParallel(list, html, url);
  return await tryTranslatorsSerial(list, html, url);
}
