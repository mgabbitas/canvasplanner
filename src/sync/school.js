// Which Canvas: your school's address, any *.instructure.com host. Pure.

/** The host permission and content-script pattern in manifest.json. */
export const CANVAS_PATTERN = 'https://*.instructure.com/*';

const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOST = new RegExp(`^(?:${LABEL}\\.)+instructure\\.com$`);

export const isCanvasHost = (host) => typeof host === 'string' && HOST.test(host) && host !== 'www.instructure.com';

/**
 * What someone typed -> a Canvas host, or null. Accepts "byui", "byui.instructure.com",
 * or a pasted link like "https://byui.instructure.com/courses/123".
 */
export function normalizeHost(input) {
  let s = String(input ?? '').trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
  if (s && !s.includes('.')) s = `${s}.instructure.com`;
  return isCanvasHost(s) ? s : null;
}

export const canvasBase = (host) => `https://${host}`;

/** A link on any Canvas (instructure.com) site: safe to store and open. */
export function isCanvasUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('https://')) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.port && !u.username && isCanvasHost(u.hostname);
  } catch {
    return false;
  }
}

/** Is this page on your school's Canvas? */
export function onSchool(url, host) {
  try {
    return Boolean(host) && new URL(url).hostname === host;
  } catch {
    return false;
  }
}
