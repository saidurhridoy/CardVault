/* Small DOM / format / file helpers shared across the app. */

/* ---------- DOM ---------- */

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

/** Escape untrusted text before injecting into innerHTML. */
export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function debounce(fn, ms = 160) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------- toasts ---------- */

const TOAST_ICON = {
  ok: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  error: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  info: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
};

export function toast(message, type = 'ok', ms = 2600) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' toast-error' : ''}`;
  el.innerHTML = `${TOAST_ICON[type] || TOAST_ICON.info}<span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-hide');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/* ---------- ids / dates / text ---------- */

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  (globalThis.crypto || {}).getRandomValues?.(b);
  return 'id-' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function initials(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words[0][0] + (words[1]?.[0] || '')).toUpperCase();
}

const GRADIENTS = [
  ['#6366f1', '#8b5cf6'], ['#0ea5e9', '#6366f1'], ['#059669', '#0d9488'],
  ['#f59e0b', '#ef4444'], ['#ec4899', '#8b5cf6'], ['#14b8a6', '#0ea5e9'],
  ['#f97316', '#eab308'], ['#64748b', '#334155']
];

export function gradientFor(str) {
  let h = 0;
  for (const ch of String(str || 'x')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const [a, b] = GRADIENTS[h % GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

/** "SARAH CHEN" -> "Sarah Chen" (leave mixed-case text untouched). */
export function titleCaseIfShouting(line) {
  if (!line) return line;
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length < 2) return line;
  const isShouting = letters === letters.toUpperCase();
  if (!isShouting) return line;
  return line
    .toLowerCase()
    .replace(/(^|[\s.'-])([a-z])/g, (m, p, c) => p + c.toUpperCase())
    .replace(/\b(md|ms|mr|mrs|dr|engr)\b\.?/gi, (m) => {
      const word = m.replace('.', '').toLowerCase();
      return word[0].toUpperCase() + word.slice(1) + '.';
    });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* ---------- images & files ---------- */

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

/** Downscale a data-URL image so its longest side is <= maxDim. */
export async function downscaleDataUrl(dataUrl, maxDim = 1600, quality = 0.85) {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return c.toDataURL('image/jpeg', quality);
}

export async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** Shrink an image data-URL to a small base64 payload (no data: prefix) for vCards. */
export async function smallPhotoBase64(dataUrl, maxDim = 288) {
  try {
    const small = await downscaleDataUrl(dataUrl, maxDim, 0.8);
    return small.slice(small.indexOf(',') + 1); // strip "data:image/jpeg;base64,"
  } catch {
    return null;
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(text, filename, mime = 'text/plain') {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

/* ---------- safe localStorage (works even in sandboxed previews) ---------- */

const mem = new Map();
export const safeStore = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return mem.get(key) ?? null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { mem.set(key, value); }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { mem.delete(key); }
  }
};
