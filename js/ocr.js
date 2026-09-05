/* ============================================================================
   OCR — runs Tesseract.js fully on-device (no server, no API key, free)
   plus a heuristic parser that turns raw OCR text into structured fields.
   The user always gets to review/edit before saving, so the parser only
   needs to be "good enough" as a pre-fill.

   v1.3.1 quality upgrades (validated against a 4-card OCR test lab):
   • persistent worker (no re-download / re-init per scan)
   • image preprocessing from ./ocr-pre.js (auto-crop + resize + contrast)
   • dual-pass recognition: sparse-text PSM 11 (isolated labels, emails)
     followed by block PSM 6 (correct reading order for addresses);
     results are merged per-field, best-of-both
   • parser: label lines without separators, phones anywhere in a line,
     OCR-mangled emails (lost dots / commas), "&" company continuations
   ========================================================================== */

import { preprocessForOcr } from './ocr-pre.js';

/* ---------------------------------------------------------------------------
   OCR engine (browser only)
   ------------------------------------------------------------------------- */

let _worker = null;
let _workerLangs = null;

async function getWorker(langs, onProgress) {
  const T = window.Tesseract;
  if (_worker && _workerLangs === langs) return _worker;
  if (_worker) { try { await _worker.terminate(); } catch (e) { /* ignore */ } _worker = null; _workerLangs = null; }
  try {
    _worker = await T.createWorker(langs, 1, {
      logger: (m) => { if (onProgress) onProgress(m); }
    });
    _workerLangs = langs;
  } catch (e) {
    if (langs !== 'eng') {
      // extra language data unavailable (offline / CDN hiccup) — degrade to eng
      _worker = await T.createWorker('eng', 1, {
        logger: (m) => { if (onProgress) onProgress(m); }
      });
      _workerLangs = 'eng';
    } else {
      throw e;
    }
  }
  return _worker;
}

async function recognizeWithPsm(worker, image, psm) {
  await worker.setParameters({
    tessedit_pageseg_mode: String(psm),
    preserve_interword_spaces: '1'
  });
  const res = await worker.recognize(image);
  return (res && res.data && res.data.text) || '';
}

/** Load a data URL / <img> / <canvas> into a canvas of a sane size. */
function toCanvas(image) {
  return new Promise((resolve, reject) => {
    const draw = (img, w, h) => {
      const MAX = 2600; // guard against huge photos
      const scale = Math.min(1, MAX / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c);
    };
    if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) {
      draw(image, image.width, image.height);
    } else if (image && image.width && image.complete !== undefined) {
      if (image.complete && image.naturalWidth) draw(image, image.naturalWidth, image.naturalHeight);
      else {
        image.onload = () => draw(image, image.naturalWidth, image.naturalHeight);
        image.onerror = () => reject(new Error('Could not read the captured image.'));
      }
    } else if (typeof image === 'string') {
      const img = new Image();
      img.onload = () => draw(img, img.naturalWidth, img.naturalHeight);
      img.onerror = () => reject(new Error('Could not read the captured image.'));
      img.src = image;
    } else {
      reject(new Error('Unsupported image for OCR.'));
    }
  });
}

/**
 * Recognize a card image and parse it into fields.
 * @param {string|HTMLImageElement|HTMLCanvasElement} image
 * @param {function} onProgress  receives Tesseract logger messages ({status, progress})
 * @param {{langs?: string}} opts  OCR languages, e.g. 'eng' or 'eng+ben'
 * @returns {Promise<{text: string, fields: object}>}
 */
export async function recognizeCard(image, onProgress, opts) {
  if (typeof window === 'undefined' || !window.Tesseract) {
    throw new Error('OCR engine not loaded — you may be offline. Enter the details manually.');
  }
  const langs = (opts && opts.langs) || 'eng';
  const canvas = await toCanvas(image);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // preprocess: auto-crop the card, resize into the sweet spot, stretch contrast
  let proc = src;
  try { proc = preprocessForOcr(src); } catch (e) { /* keep raw */ }
  const procCanvas = document.createElement('canvas');
  procCanvas.width = proc.width;
  procCanvas.height = proc.height;
  procCanvas.getContext('2d').putImageData(
    new ImageData(new Uint8ClampedArray(proc.data.buffer ? proc.data.buffer : proc.data), proc.width, proc.height),
    0, 0
  );

  try {
    const worker = await getWorker(langs, onProgress);
    const PSM = (window.Tesseract && window.Tesseract.PSM) || {};
    // Pass 1 — sparse text: best for isolated labels, emails, numbers
    const sparseText = await recognizeWithPsm(worker, procCanvas, PSM.SPARSE_TEXT || '11');
    // Pass 2 — single block: best for reading order (multi-line addresses)
    const blockText = await recognizeWithPsm(worker, procCanvas, PSM.SINGLE_BLOCK || '6');
    const fields = parseCardTextDual(sparseText, blockText);
    return { text: (sparseText + '\n' + blockText).trim(), fields };
  } catch (e) {
    // fall back to the one-shot API (still on the preprocessed image)
    const res = await window.Tesseract.recognize(procCanvas, langs, {
      logger: (m) => { if (onProgress) onProgress(m); }
    });
    const text = (res && res.data && res.data.text) || '';
    return { text, fields: parseCardText(text) };
  }
}

/** Backwards-compatible one-shot helper: returns raw recognized text only. */
export async function runOcr(image, onProgress) {
  const r = await recognizeCard(image, onProgress);
  return r.text;
}

/* ---------------------------------------------------------------------------
   Field parser
   ------------------------------------------------------------------------- */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const URL_RE = /(?:https?:\/\/|www\.)[^\s,;|<>"')]+/i;
const BARE_DOMAIN_RE = /^[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)+(?:\/[^\s]*)?$/;
const PHONE_TOKEN_RE = /\+?\d[\d\s().\-\/]{6,}\d/g;

const LABEL_ONLY_RE =
  /^(?:tel|telephone|phone|mobile|mob|cell|ph|hotline|whatsapp|email|e-?mail|mail|web|website|url|add(?:ress)?|office|contact|fax)\s*[.:-]?\s*$/i;

const LABEL_RE =
  /^(?:tel|telephone|phone|mobile|mob|cell|ph|hotline|whatsapp|email|e-?mail|mail|web|website|url|add(?:ress)?|office|contact|fax|p|m|t|c|f|e|w)\s*[.:-]\s*/i;

const DESIGNATION_RE = new RegExp(
  '\\b(ceo|cto|cfo|coo|cio|cmo|co[- ]founder|founder|owner|proprietor|partner|president|vice president|vp|' +
  'managing director|executive director|director|general manager|manager|sr\\.? manager|senior manager|' +
  'head of|head|lead|consultant|advisor|advocate|architect|engineer|developer|programmer|designer|analyst|' +
  'specialist|executive|officer|assistant|associate|coordinator|supervisor|trainer|lecturer|professor|teacher|' +
  'dentist|doctor|surgeon|physician|cardiologist|neurologist|dermatologist|pediatrician|gynecologist|' +
  'accountant|auditor|lawyer|editor|writer|photographer|producer|strategist|researcher|scientist|' +
  'representative|agent|broker|recruiter|intern|chartered|surveyor|planner|chemist|physiotherapist)\\b' +
  '|(পরিচালক|ব্যবস্থাপক|সহকারী|প্রধান|চেয়ারম্যান|সভাপতি|মহাসচিব|সম্পাদক|প্রতিষ্ঠাতা|মালিক|অফিসার|নির্বাহী|' +
  'ইঞ্জিনিয়ার|কনসালট্যান্ট|শিক্ষক|প্রফেসর|ডাক্তার|হিসাবরক্ষক|প্রোপ্রাইটর|প্রোপাইটর|বিক্রয়|ক্রয়)',
  'i'
);

/** A word that ends like a job title (cardiologist, technician, physician…). */
const DESIGNATION_SUFFIX_RE = /^[A-Za-z]{4,}(ist|ian)$/i;

const COMPANY_RE = new RegExp(
  '\\b(ltd\\.?|limited|pvt\\.?|private|inc\\.?|llc|llp|corp\\.?|corporation|company|technologies|technology|' +
  'tech|solutions|services|group|industries|enterprises|holdings|trading|agency|studio|labs?|systems|' +
  'consultancy|international|global|ventures|capital|media|software|digital|networks|communications|' +
  'bank|insurance|hospital|clinic|pharma|logistics|shipping|aviation|fashion|retail|associates|brothers|' +
  'motors|foods|textiles|concern|associates|gmbh|plc|pty)\\b' +
  '|(লিমিটেড|প্রাইভেট|সংস্থা|কোম্পানি|গ্রুপ|ব্যাংক|হাসপাতাল|কনস্ট্রাকশন|ফার্মাসিউটিক্যাল|ইলেকট্রনিক্স|' +
  'এন্টারপ্রাইজ|ট্রেডার্স|ইন্ডাস্ট্রিজ|এজেন্সি|কমিউনিকেশন|টেলিকম|ফার্ম|স্টোর|ইলেকট্রিক্স|মোটরস)',
  'i'
);

const ADDRESS_KW_RE = new RegExp(
  '\\b(road|rd|street|st|avenue|ave|block|sector|phase|floor|fl|level|suite|ste|room|plot|house|lane|' +
  'p\\.?o|box|district|city|town|postal|zip|dhaka|chattogram|chittagong|sylhet|khulna|rajshahi|barishal|' +
  'barisal|rangpur|mymensingh|gulshan|banani|dhanmondi|uttara|mirpur|basundhara|bashundhara|mohakhali|' +
  'motijheel|farmgate|khilgaon|badda|tegaon|tejgaon)\\b' +
  '|(রোড|সড়ক|নং|ভবন|ফ্লোর|সেক্টর|ব্লক|বাংলাদেশ|ঢাকা|চট্টগ্রাম|সিলেট|খুলনা|রাজশাহী|বরিশাল|রংপুর|ময়মনসিংহ|' +
  'গুলশান|বনানী|ধানমন্ডি|উত্তরা|মিরপুর|মতিঝিল|মোহাম্মদপুর|টঙ্গী|গাজীপুর|নারায়ণগঞ্জ|কেরানীগঞ্জ|যাত্রাবাড়ী)',
  'i'
);

const wordCount = (s) => s.trim().split(/\s+/).filter(Boolean).length;
/* \d is ASCII-only — cards also print Bengali (০-৯) and Arabic (٠-٩) digits */
const hasDigit = (s) => /[0-9০-৯٠-٩]/.test(s);
/* any-script letter/digit, so Bengali/Arabic/Hindi lines survive the noise filter */
const WORDISH_RE = /[A-Za-z0-9\u00C0-\u024F\u0370-\u04FF\u0590-\u06FF\u0900-\u097F\u0980-\u09FF\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/g;
const isNameToken = (t) => /^[A-Za-z\u0980-\u09FF][A-Za-z\u0980-\u09FF.'’-]*$/.test(t) || /^[A-Za-z]{1,2}\.$/.test(t);

/* Bengali + Arabic-Indic digit transliteration (for phone matching only) */
const DIGIT_MAP = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
const toAsciiDigits = (s) => s.replace(/[০-৯٠-٩]/g, (d) => DIGIT_MAP[d]);

/** Line is just `match` (plus a label/punctuation) and nothing else meaningful. */
function lineIsOnly(line, match) {
  const rest = line
    .replace(match, '')
    .replace(LABEL_RE, '')
    .replace(/[^A-Za-z0-9]/g, '');
  return rest.length < 2;
}

/** Repair common OCR mangles inside a probable email:
 *  "nusrat jahan@x.com" (lost dot)  → "nusrat.jahan@x.com"
 *  "info@company,com"   (comma)     → "info@company.com"
 *  Only joins lowercase words (emails print lowercase) of ≥3 chars, so
 *  "Contact John at john@x.com" is left alone.                             */
function repairEmailish(s) {
  return s
    .replace(/\b([a-z0-9][a-z0-9._%+-]{2,})\s+([a-z0-9][a-z0-9._%+-]{2,})\s*@/g, '$1.$2@')
    .replace(/@([A-Za-z0-9.-]+?)\s*,\s*([A-Za-z]{2,})(?![A-Za-z])/g, '@$1.$2');
}

/** Repair "www.company,com" style comma-for-dot OCR errors. */
function repairDomainComma(s) {
  return s.replace(/(\.[A-Za-z0-9-]+)\s*,\s*([A-Za-z]{2,4})\b/g, '$1.$2');
}

/** Normalized key used to dedupe the same phone written differently
 *  (+880 1712… vs 01712…) so a card doesn't list one number twice.       */
function phoneKey(tok) {
  const d = String(tok).replace(/\D/g, '');
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('880') && d.length >= 12) return '0' + d.slice(3);
  return d;
}

/** Extract phone-like tokens from anywhere in a line (labels tolerated).
 *  Bengali/Arabic digits are transliterated so those numbers dial too.     */
function extractPhones(line) {
  const ascii = toAsciiDigits(line);
  const matches = ascii.match(PHONE_TOKEN_RE) || [];
  const out = [];
  for (const m of matches) {
    const digits = m.replace(/\D/g, '');
    if (digits.length < 8) continue; // house/plot numbers, years, PINs
    out.push(m.trim().replace(/\s{2,}/g, ' '));
  }
  return out;
}

/** Collapse OCR duplicate commas / spaces in a joined address. */
function tidyAddress(s) {
  return String(s || '')
    .replace(/\s*,\s*(,\s*)+/g, ', ')
    .replace(/,\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** If the card's own website extends the email's domain (email read as
 *  "…solutions.co" while the site says "…solutions.com"), trust the site. */
function crossFieldEmailRepair(out) {
  if (!out.email || !out.website) return out;
  const list = String(out.email).split(',').map((e) => e.trim()).filter(Boolean);
  if (!list.length) return out;
  const primary = list[0];
  const host = (primary.split('@')[1] || '').toLowerCase();
  const site = String(out.website)
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .toLowerCase();
  if (host && site && site !== host && site.startsWith(host) && /^[a-z0-9.-]+$/.test(host)) {
    list[0] = primary.replace(/@.*$/, '@' + site);
    out.email = list.join(', ');
  }
  return out;
}

/** Merge two parses (e.g. sparse-text pass + block pass) into the best of
 *  both: first non-empty per field, longest company, most coherent address,
 *  union of phones/emails with de-duplication.                              */
export function mergeCardParses(a, b) {
  const out = { ...a };
  if (!out.name && b.name) out.name = b.name;
  if (!out.designation && b.designation) out.designation = b.designation;
  if (!out.website && b.website) out.website = b.website;
  if (String(b.company || '').length > String(out.company || '').length) out.company = b.company;
  if (addressScore(b.address) > addressScore(out.address)) out.address = b.address;
  const seen = new Set();
  const phones = [];
  String(a.phone || '')
    .split(',')
    .concat(String(b.phone || '').split(','))
    .forEach((p) => {
      const t = p.trim();
      if (!t) return;
      const k = phoneKey(t);
      if (seen.has(k)) return;
      seen.add(k);
      if (phones.length < 4) phones.push(t);
    });
  out.phone = phones.join(', ');
  const seenE = new Set();
  const emails = [];
  String(a.email || '')
    .split(',')
    .concat(String(b.email || '').split(','))
    .forEach((e) => {
      const t = e.trim().toLowerCase();
      if (!t || seenE.has(t)) return;
      seenE.add(t);
      if (emails.length < 3) emails.push(e.trim());
    });
  out.email = emails.join(', ');
  out.address = tidyAddress(out.address);
  crossFieldEmailRepair(out);
  if (!out.notes && b.notes) out.notes = b.notes;
  return out;
}

/** Prefer addresses with more meaningful parts and fewer fragments. */
function addressScore(s) {
  if (!s) return -1;
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  const good = parts.filter((p) => /([A-Za-z]{2,}|\d{2,})/.test(p)).length;
  return good * 10 - parts.length;
}

/** Parse two OCR reads (e.g. PSM 11 + PSM 6) and merge them. */
export function parseCardTextDual(textA, textB) {
  const a = parseCardText(textA);
  if (!textB) return a;
  return mergeCardParses(a, parseCardText(textB));
}

/**
 * Parse raw OCR text into card fields.
 * @returns {{name, designation, company, phone, email, website, address, notes}}
 */
export function parseCardText(rawText) {
  const out = { name: '', designation: '', company: '', phone: '', email: '', website: '', address: '', notes: '' };
  if (!rawText) return out;

  // -- normalize lines: collapse whitespace, drop noise & bare label lines,
  //    join "&"-continuations so split company names become one line
  let lines = String(rawText)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => (l.match(WORDISH_RE) || []).length >= 2)
    .filter((l) => !LABEL_ONLY_RE.test(l));

  const joined = [];
  for (const l of lines) {
    const prev = joined.length ? joined[joined.length - 1] : '';
    const prevClean = prev.replace(/[\s,;:.]+$/, '');
    if (prevClean && /&$/.test(prevClean)) {
      joined[joined.length - 1] = prevClean + ' ' + l;          // "APEX ENGINEERING &" + "CONSULTANCY LTD."
    } else if (/,$/.test(prev) && !hasDigit(prev) && !hasDigit(l) && !l.includes('@')) {
      joined[joined.length - 1] = prev.replace(/,$/, '') + ', ' + l; // "Level 7, Apex Tower," + "Gulshan…"
    } else {
      joined.push(l);
    }
  }
  lines = joined;

  const used = new Set();
  const emails = [], urls = [], phones = [], addresses = [];

  // Pass 1: emails & websites (search anywhere in the line).
  // A blurry photo often loses the dot in the local part, so per line we
  // prefer the repaired email when it explains more of the text.
  lines.forEach((line, i) => {
    let emLine = line;
    let em = line.match(EMAIL_RE);
    const rep = repairEmailish(line);
    if (rep !== line) {
      const rem = rep.match(EMAIL_RE);
      if (rem && (!em || rem[0].length > em[0].length)) { emLine = rep; em = rem; }
    }
    if (em) {
      if (!emails.includes(em[0])) emails.push(em[0]);
      if (lineIsOnly(emLine, em[0])) used.add(i);
    }
    const rline = repairDomainComma(line);
    const um = rline.match(URL_RE);
    if (um) {
      const u = normalizeUrl(um[0]);
      if (!urls.includes(u)) urls.push(u);
      if (lineIsOnly(rline, um[0])) used.add(i);
    } else if (looksLikeUrlLine(rline)) {
      const u = normalizeUrl(rline);
      if (!urls.includes(u)) urls.push(u);
      used.add(i);
    }
  });

  // Pass 2: phone numbers (anywhere in a line) & addresses
  lines.forEach((line, i) => {
    if (used.has(i)) return;
    const masked = line.replace(EMAIL_RE, ' '); // don't read digits out of emails
    const found = extractPhones(masked);
    if (found.length) {
      for (const p of found) {
        const k = phoneKey(p);
        if (!phones.some((q) => phoneKey(q) === k)) phones.push(p);
      }
      used.add(i);
      return;
    }
    const stripped = line.replace(LABEL_RE, '').trim();
    if (hasDigit(stripped) && (stripped.includes(',') || ADDRESS_KW_RE.test(stripped)) && wordCount(stripped) >= 2) {
      addresses.push(stripped);
      used.add(i);
    }
  });

  // Pass 3: name / designation / company from the remaining lines
  const restIdx = lines.map((_, i) => i).filter((i) => !used.has(i));
  let nameIdx = -1, bestScore = 0;
  restIdx.forEach((i) => {
    const s = nameScore(lines[i]);
    if (s > bestScore) { bestScore = s; nameIdx = i; }
  });
  if (nameIdx > -1 && bestScore >= 1.5) {
    out.name = lines[nameIdx];
  }

  const strongDesig = (l) => DESIGNATION_RE.test(l) || DESIGNATION_SUFFIX_RE.test(l.trim());

  let desigIdx = -1, companyIdx = -1;
  for (const i of restIdx) {
    if (i === nameIdx || desigIdx > -1) continue;
    const l = lines[i];
    if (!hasDigit(l) && wordCount(l) <= 6 && strongDesig(l)) { desigIdx = i; break; }
  }
  for (const i of restIdx) {
    if (i === nameIdx || i === desigIdx || companyIdx > -1) continue;
    const l = lines[i];
    if (wordCount(l) <= 8 && COMPANY_RE.test(l)) { companyIdx = i; break; }
  }

  // Leftover lines fill the blanks in a sensible order
  const leftovers = restIdx.filter((i) => i !== nameIdx && i !== desigIdx && i !== companyIdx);
  if (desigIdx === -1 && leftovers.length) {
    const k = leftovers.findIndex((i) => !hasDigit(lines[i]) && wordCount(lines[i]) <= 6 && strongDesig(lines[i]));
    if (k > -1) desigIdx = leftovers.splice(k, 1)[0];
  }
  if (companyIdx === -1 && leftovers.length) {
    const k = leftovers.findIndex((i) => COMPANY_RE.test(lines[i]));
    if (k > -1) companyIdx = leftovers.splice(k, 1)[0];
  }
  if (desigIdx === -1 && leftovers.length) {
    const i = leftovers[0];
    if (!hasDigit(lines[i]) && wordCount(lines[i]) <= 6) desigIdx = leftovers.shift();
  }
  if (companyIdx === -1 && leftovers.length) {
    const i = leftovers[0];
    if (!hasDigit(lines[i]) && wordCount(lines[i]) <= 8) companyIdx = leftovers.shift();
  }

  const clean = (s) => String(s || '').replace(/^[\s,;:.]+/, '').replace(/[\s,;:]+$/, '');
  if (nameIdx > -1) out.name = clean(lines[nameIdx]);
  if (desigIdx > -1) out.designation = clean(lines[desigIdx]);
  if (companyIdx > -1) out.company = clean(lines[companyIdx]);

  out.email = emails.slice(0, 3).join(', ');
  out.website = (urls.find((u) => /^https?:\/\/(www\.)?/i.test(u)) || urls[0] || '')
    .replace(/^https?:\/\//i, '');
  out.phone = phones.slice(0, 4).join(', ');
  out.address = tidyAddress(addresses.join(', '));
  crossFieldEmailRepair(out);

  const extra = [];
  if (urls.length > 1) extra.push('Web: ' + urls.slice(1).map((u) => u.replace(/^https?:\/\//i, '')).join(', '));
  const noteLines = leftovers.map((i) => lines[i]).filter((l) => l !== out.name);
  if (noteLines.length) extra.unshift(noteLines.join(' · '));
  out.notes = extra.join('\n').trim();

  out.name = out.name ? titleCaseNormalize(out.name) : '';
  return out;
}

function nameScore(line) {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) return 0;
  if (!tokens.every(isNameToken)) return 0;
  if (hasDigit(line)) return 0;
  if (DESIGNATION_RE.test(line) || COMPANY_RE.test(line) || EMAIL_RE.test(line)) return 0;
  const titleIsh = tokens.every((t) => /^[A-Z\u0980-\u09FF]/.test(t));
  return 1 + (titleIsh ? 1 : 0) + (tokens.length <= 3 ? 0.5 : 0);
}

function normalizeUrl(u) {
  let url = String(u || '').trim().replace(/[.,;)]+$/, '');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

function looksLikeUrlLine(line) {
  return BARE_DOMAIN_RE.test(line) && !line.includes('@') && /\.[A-Za-z]{2,}$/.test(line.split('/').pop() || '');
}

/* keep title casing tidy without importing util.js (stays Node-testable) */
function titleCaseNormalize(line) {
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 2 && letters !== letters.toUpperCase()) return line;
  return line
    .toLowerCase()
    .replace(/(^|[\s.'-])([a-z])/g, (m, p, c) => p + c.toUpperCase())
    .replace(/\b(md|ms|mr|mrs|dr|engr)\b\.?/gi, (m) => {
      const word = m.replace('.', '').toLowerCase();
      return word[0].toUpperCase() + word.slice(1) + '.';
    });
}
