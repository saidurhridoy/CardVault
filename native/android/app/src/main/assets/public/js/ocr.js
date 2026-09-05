/* ============================================================================
   OCR — runs Tesseract.js fully on-device (no server, no API key, free)
   plus a heuristic parser that turns raw OCR text into structured fields.
   The user always gets to review/edit before saving, so the parser only
   needs to be "good enough" as a pre-fill.
   ========================================================================== */

/**
 * Recognize text in an image (data URL / URL / canvas / blob).
 * Calls onProgress({ status, progress }) for UI feedback.
 * Throws a friendly Error if the OCR engine is unavailable (e.g. offline).
 */
export async function runOcr(image, onProgress) {
  if (typeof window === 'undefined' || !window.Tesseract) {
    throw new Error('OCR engine not loaded — you may be offline. Enter the details manually.');
  }
  const result = await window.Tesseract.recognize(image, 'eng', {
    logger: (m) => { if (onProgress) onProgress(m); }
  });
  return result?.data?.text || '';
}

/* ---------------------------------------------------------------------------
   Field parser
   ------------------------------------------------------------------------- */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const URL_RE = /(?:https?:\/\/|www\.)[^\s,;|<>"')]+/i;
const BARE_DOMAIN_RE = /^[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)+(?:\/[^\s]*)?$/;
const PHONE_CHARS_RE = /^[+()[\]{}\s\d.,/-]{6,}$/;

const LABEL_RE =
  /^(?:tel|telephone|phone|mobile|mob|cell|ph|hotline|whatsapp|email|e-?mail|mail|web|website|url|add(?:ress)?|office|contact|fax|p|m|t|c|f|e|w)\s*[.:-]\s*/i;

const DESIGNATION_RE = new RegExp(
  '\\b(ceo|cto|cfo|coo|cio|cmo|co[- ]founder|founder|owner|proprietor|partner|president|vice president|vp|' +
  'managing director|executive director|director|general manager|manager|sr\\.? manager|senior manager|' +
  'head of|head|lead|consultant|advisor|advocate|architect|engineer|developer|programmer|designer|analyst|' +
  'specialist|executive|officer|assistant|associate|coordinator|supervisor|trainer|lecturer|professor|teacher|' +
  'dentist|doctor|surgeon|physician|cardiologist|neurologist|dermatologist|pediatrician|gynecologist|' +
  'accountant|auditor|lawyer|editor|writer|photographer|producer|strategist|researcher|scientist|' +
  'representative|agent|broker|recruiter|intern|chartered|surveyor|planner|chemist|physiotherapist)\\b',
  'i'
);

/** A word that ends like a job title (cardiologist, technician, physician…). */
const DESIGNATION_SUFFIX_RE = /^[A-Za-z]{4,}(ist|ian)$/i;

const COMPANY_RE = new RegExp(
  '\\b(ltd\\.?|limited|pvt\\.?|private|inc\\.?|llc|llp|corp\\.?|corporation|company|technologies|technology|' +
  'tech|solutions|services|group|industries|enterprises|holdings|trading|agency|studio|labs?|systems|' +
  'consultancy|international|global|ventures|capital|media|software|digital|networks|communications|' +
  'bank|insurance|hospital|clinic|pharma|logistics|shipping|aviation|fashion|retail|associates|brothers|' +
  'motors|foods|textiles|concern|associates|gmbh|plc|pty)\\b',
  'i'
);

const ADDRESS_KW_RE = new RegExp(
  '\\b(road|rd|street|st|avenue|ave|block|sector|phase|floor|fl|level|suite|ste|room|plot|house|lane|' +
  'p\\.?o|box|district|city|town|postal|zip|dhaka|chattogram|chittagong|sylhet|khulna|rajshahi|barishal|' +
  'barisal|rangpur|mymensingh|gulshan|banani|dhanmondi|uttara|mirpur|basundhara|bashundhara|mohakhali|' +
  'motijheel|farmgate|khilgaon|badda|tegaon|tejgaon)\\b',
  'i'
);

const wordCount = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const hasDigit = (s) => /\d/.test(s);
const isNameToken = (t) => /^[A-Za-z][A-Za-z.'’-]*$/.test(t) || /^[A-Za-z]{1,2}\.$/.test(t);

/** Line is just `match` (plus a label/punctuation) and nothing else meaningful. */
function lineIsOnly(line, match) {
  const rest = line
    .replace(match, '')
    .replace(LABEL_RE, '')
    .replace(/[^A-Za-z0-9]/g, '');
  return rest.length < 2;
}

function nameScore(line) {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) return 0;
  if (!tokens.every(isNameToken)) return 0;
  if (hasDigit(line)) return 0;
  if (DESIGNATION_RE.test(line) || COMPANY_RE.test(line) || EMAIL_RE.test(line)) return 0;
  const titleIsh = tokens.every((t) => /^[A-Z]/.test(t));
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

/**
 * Parse raw OCR text into card fields.
 * @returns {{name, designation, company, phone, email, website, address, notes}}
 */
export function parseCardText(rawText) {
  const out = { name: '', designation: '', company: '', phone: '', email: '', website: '', address: '', notes: '' };
  if (!rawText) return out;

  const lines = String(rawText)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => (l.match(/[A-Za-z0-9]/g) || []).length >= 2);

  const used = new Set();
  const emails = [], urls = [], phones = [], addresses = [];

  // Pass 1: emails & websites (search anywhere in the line)
  lines.forEach((line, i) => {
    const em = line.match(EMAIL_RE);
    if (em) {
      if (!emails.includes(em[0])) emails.push(em[0]);
      if (lineIsOnly(line, em[0])) used.add(i);
    }
    const um = line.match(URL_RE);
    if (um) {
      const u = normalizeUrl(um[0]);
      if (!urls.includes(u)) urls.push(u);
      if (lineIsOnly(line, um[0])) used.add(i);
    } else if (looksLikeUrlLine(line)) {
      const u = normalizeUrl(line);
      if (!urls.includes(u)) urls.push(u);
      used.add(i);
    }
  });

  // Pass 2: phone numbers & addresses (full-line tests, label-aware)
  lines.forEach((line, i) => {
    if (used.has(i)) return;
    const stripped = line.replace(LABEL_RE, '').trim();
    const digits = (stripped.match(/\d/g) || []).length;
    if (digits >= 7 && PHONE_CHARS_RE.test(stripped)) {
      phones.push(stripped);
      used.add(i);
      return;
    }
    if (digits > 0 && (stripped.includes(',') || ADDRESS_KW_RE.test(stripped)) && wordCount(stripped) >= 2) {
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

  if (nameIdx > -1) out.name = lines[nameIdx];
  if (desigIdx > -1) out.designation = lines[desigIdx];
  if (companyIdx > -1) out.company = lines[companyIdx];

  out.email = emails[0] || '';
  out.website = (urls.find((u) => /^https?:\/\/(www\.)?/i.test(u)) || urls[0] || '')
    .replace(/^https?:\/\//i, '');
  out.phone = phones.slice(0, 3).join(', ');
  out.address = addresses.join(', ');

  const extra = [];
  if (emails.length > 1) extra.push('Email: ' + emails.slice(1).join(', '));
  if (urls.length > 1) extra.push('Web: ' + urls.slice(1).map((u) => u.replace(/^https?:\/\//i, '')).join(', '));
  const noteLines = leftovers.map((i) => lines[i]).filter((l) => l !== out.name);
  if (noteLines.length) extra.unshift(noteLines.join(' · '));
  out.notes = extra.join('\n').trim();

  out.name = out.name ? titleCaseNormalize(out.name) : '';
  return out;
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
