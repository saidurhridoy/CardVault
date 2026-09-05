/* vCard 3.0 generation — "Save to contacts" + share + bulk export. */

function escVal(v) {
  return String(v ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\r\n', '\\n')
    .replaceAll('\n', '\\n');
}

/** Fold long lines per RFC 2426 (75 octets, CRLF + space). */
function fold(line) {
  if (line.length <= 74) return line;
  const parts = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 73) {
    parts.push(' ' + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  if (rest) parts.push(' ' + rest);
  return parts.join('\r\n');
}

function splitName(full) {
  const tokens = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { last: '', first: '', middle: '' };
  if (tokens.length === 1) return { last: '', first: tokens[0], middle: '' };
  return {
    last: tokens[tokens.length - 1],
    first: tokens[0],
    middle: tokens.slice(1, -1).join(' ')
  };
}

/**
 * Build a vCard string for a card record.
 * @param {object} card  card fields (name, designation, company, phone, email, website, address, notes)
 * @param {string|null} photoBase64  raw base64 JPEG (no data: prefix), optional
 */
export function buildVCard(card, photoBase64 = null) {
  const { last, first, middle } = splitName(card.name);
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escVal(last)};${escVal(first)};${escVal(middle)};;`,
    `FN:${escVal(card.name || card.company || 'Contact')}`,
    'PROFILE:VCARD'
  ];

  if (card.company) lines.push(`ORG:${escVal(card.company)}`);
  if (card.designation) lines.push(`TITLE:${escVal(card.designation)}`);

  const phones = String(card.phone || '')
    .split(/[,;/]\s*(?=[+\d])/)
    .map((p) => p.trim())
    .filter(Boolean);
  phones.forEach((p, i) => {
    const type = /^(\+?88)?01[3-9]|^\+?[1-9]\d{8,}\b/.test(p.replace(/[\s()-]/g, '')) && i === 0
      ? 'CELL' : 'VOICE,WORK';
    lines.push(`TEL;TYPE=${type}:${escVal(p)}`);
  });

  const emails = String(card.email || '')
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean);
  emails.forEach((e) => lines.push(`EMAIL;TYPE=INTERNET:${escVal(e)}`));
  if (card.website) {
    const url = /^https?:\/\//i.test(card.website) ? card.website : `https://${card.website}`;
    lines.push(`URL:${escVal(url)}`);
  }
  if (card.address) lines.push(`ADR;TYPE=WORK:;;${escVal(card.address)};;;;`);
  if (card.notes) lines.push(`NOTE:${escVal(card.notes)}`);
  if (photoBase64) lines.push(`PHOTO;ENCODING=BASE64;TYPE=JPEG:${photoBase64}`);

  lines.push(`REV:${new Date().toISOString()}`);
  lines.push('END:VCARD');

  return lines.map(fold).join('\r\n');
}

export function vcardFileName(card) {
  const base = (card.name || card.company || 'contact')
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '_');
  return `${base || 'contact'}.vcf`;
}

/** Combine many vCards into one .vcf file. */
export function buildVCardCollection(cards) {
  return cards.map((c) => buildVCard(c)).join('\r\n');
}
