/* Unit tests for the OCR field parser (js/ocr.js).
   Run with:  npm test   (or: node test/parser.test.mjs)                */

import { parseCardText, parseCardTextDual } from '../js/ocr.js';

let passed = 0, failed = 0;

function check(label, actual, expected) {
  const a = String(actual || '').trim().toLowerCase();
  const e = String(expected || '').trim().toLowerCase();
  if (a === e) { passed++; return true; }
  failed++;
  console.error(`  ✗ ${label}\n      expected: "${expected}"\n      actual:   "${actual}"`);
  return false;
}

function testCase(title, text, expect) {
  console.log(`• ${title}`);
  const out = parseCardText(text);
  for (const [key, val] of Object.entries(expect)) {
    check(key, out[key], val);
  }
}

function testCaseDual(title, sparseText, blockText, expect) {
  console.log(`• ${title}`);
  const out = parseCardTextDual(sparseText, blockText);
  for (const [key, val] of Object.entries(expect)) {
    check(key, out[key], val);
  }
}

/* ------------------------------------------------------------------------ */

testCase(
  'typical English card',
  [
    'John Rahman',
    'Senior Marketing Manager',
    'Acme Technologies Ltd.',
    '+880 1712-345678',
    'john.rahman@acme-tech.com',
    'www.acme-tech.com',
    'House 12, Road 5, Dhanmondi, Dhaka 1205'
  ].join('\n'),
  {
    name: 'John Rahman',
    designation: 'Senior Marketing Manager',
    company: 'Acme Technologies Ltd.',
    phone: '+880 1712-345678',
    email: 'john.rahman@acme-tech.com',
    website: 'www.acme-tech.com',
    address: 'House 12, Road 5, Dhanmondi, Dhaka 1205'
  }
);

testCase(
  'all-caps name, labelled phones, bare domain',
  [
    'SARAH CHEN',
    'Founder & CEO',
    'Northwind Solutions Inc',
    'Tel: +1 (555) 123-4567',
    'Mobile: +1 (555) 987-6543',
    'sarah@northwind.io',
    'northwind.io'
  ].join('\n'),
  {
    name: 'Sarah Chen',
    designation: 'Founder & CEO',
    company: 'Northwind Solutions Inc',
    phone: '+1 (555) 123-4567, +1 (555) 987-6543',
    email: 'sarah@northwind.io',
    website: 'northwind.io'
  }
);

testCase(
  'minimal card with profession + workplace',
  ['Dr. Amir Hossain', 'Cardiologist', 'Square Hospital'].join('\n'),
  {
    name: 'Dr. Amir Hossain',
    designation: 'Cardiologist',
    company: 'Square Hospital'
  }
);

testCase(
  'BD-style card with labels and hotline',
  [
    'MD. RAJU AHMED',
    'Managing Director',
    'Raju Brothers & Co.',
    'Hotline: 01711-223344',
    'Email: info@rajubrothers.com',
    'www.rajubrothers.com',
    'Plot # 12, Block # C, Mirpur 10, Dhaka-1216'
  ].join('\n'),
  {
    name: 'Md. Raju Ahmed',
    designation: 'Managing Director',
    company: 'Raju Brothers & Co.',
    phone: '01711-223344',
    email: 'info@rajubrothers.com',
    website: 'www.rajubrothers.com'
  }
);

testCase(
  'minimal card: name + company only',
  ['Jane Doe', 'Acme Corp'].join('\n'),
  { name: 'Jane Doe', company: 'Acme Corp' }
);

testCase(
  'OCR noise and symbols are ignored',
  ['|', '———', 'www.jd.com', 'J D', '34, Blue Lane, Wellington 6011', 'jd@jd.com', '0455 889 221'].join('\n'),
  { email: 'jd@jd.com' }
);

testCase(
  'email + url on lines with extra labels',
  ['Priya Nair', 'consultant', 'E: priya@zenith.in', 'Web: https://zenith.in/about'].join('\n'),
  { name: 'Priya Nair', designation: 'Consultant', email: 'priya@zenith.in', website: 'zenith.in/about' }
);

/* ---- v1.3.1 OCR-robustness cases (validated in the OCR lab) -------------- */

testCase(
  'phone label without separator',
  ['Muhammad Arif Chowdhury', 'Deputy General Manager', 'Phone +880 1819-998877', 'Mobile 01711-223344'].join('\n'),
  { phone: '+880 1819-998877, 01711-223344' }
);

testCase(
  'label-only lines (sparse OCR split) are dropped, not kept as notes',
  ['Muhammad Arif Chowdhury', 'Phone', 'Tel', 'Mobile', 'Email', 'Web'].join('\n'),
  { name: 'Muhammad Arif Chowdhury', notes: '' }
);

testCase(
  'company split across lines with "&" is joined',
  ['APEX ENGINEERING &', 'CONSULTANCY LTD.', 'Arif Chowdhury'].join('\n'),
  { company: 'APEX ENGINEERING & CONSULTANCY LTD.' }
);

testCase(
  'email with lost dot (blurry photo) is repaired',
  ['Nusrat Jahan', 'Senior Product Manager', 'nusrat jahan@bengalsolutions.com'].join('\n'),
  { email: 'nusrat.jahan@bengalsolutions.com' }
);

testCase(
  'email with comma domain (OCR misread) is repaired',
  ['Bengal Solutions Ltd.', 'info@bengalsolutions,com'].join('\n'),
  { email: 'info@bengalsolutions.com' }
);

testCase(
  'website with comma domain is repaired',
  ['Bengal Solutions Ltd.', 'www.bengalsolutions,com'].join('\n'),
  { website: 'www.bengalsolutions.com' }
);

testCase(
  'two numbers on one line',
  ['Apex Tower', 'Tel: 02-8877665 Mobile: 01711-223344'].join('\n'),
  { phone: '02-8877665, 01711-223344' }
);

testCase(
  'same number in +880 and 0 forms is not duplicated',
  ['Nusrat Jahan', '+880 1712-345678', '01712-345678'].join('\n'),
  { phone: '+880 1712-345678' }
);

testCase(
  'labelled address line keeps its label stripped',
  ['Rakib Hasan', 'Add: House 5, Road 2, Dhanmondi, Dhaka'].join('\n'),
  { address: 'House 5, Road 2, Dhanmondi, Dhaka' }
);

testCaseDual(
  'dual-pass merge: sparse (good email, fragmented address) + block (good address)',
  [
    'BENGAL SOLUTIONS LTD.',
    'Nusrat Jahan',
    'Senior Product Manager',
    '+880 1712-345678',
    'nusrat jahan@bengalsolutions.com',
    'www.bengalsolutions.com',
    'Dhaka 1205',
    'House 1',
    '2, Road 5, Dhanmondi,'
  ].join('\n'),
  [
    'BENGAL SOLUTIONS LTD.',
    'Nusrat Jahan',
    'Senior Product Manager',
    '+880 1712-345678',
    'nusrat.jahan@bengalsolutions.com',
    'www.bengalsolutions.com',
    'House 12, Road 5, Dhanmondi, Dhaka 1205'
  ].join('\n'),
  {
    name: 'Nusrat Jahan',
    designation: 'Senior Product Manager',
    company: 'BENGAL SOLUTIONS LTD.',
    phone: '+880 1712-345678',
    email: 'nusrat.jahan@bengalsolutions.com',
    website: 'www.bengalsolutions.com',
    address: 'House 12, Road 5, Dhanmondi, Dhaka 1205'
  }
);

/* ---- v1.4.0: multi-value, Bengali, back-side cases ------------------------ */

testCase(
  'multiple emails are all kept (comma-joined)',
  ['Rakib Hasan', 'info@apex-eng.com', 'rakib.hasan@apex-eng.com'].join('\n'),
  { email: 'info@apex-eng.com, rakib.hasan@apex-eng.com' }
);

testCase(
  'multiple phones up to four',
  ['Sadia Islam', '01711-223344', '02-8877665', '01812-998877', '01913-445566'].join('\n'),
  { phone: '01711-223344, 02-8877665, 01812-998877, 01913-445566' }
);

testCase(
  'Bengali name, designation, company and address',
  ['মেহেদী টেলিকম', 'সালমান খান', 'ব্যবস্থাপক', '০১২৩৪-৬৪৬৭৮৯০', '১২ নং রোড মতিঝিল ঢাকা'].join('\n'),
  { name: 'সালমান খান', designation: 'ব্যবস্থাপক', phone: '01234-6467890', address: '১২ নং রোড মতিঝিল ঢাকা' }
);

testCase(
  'Bengali phone digits are transliterated for dialing',
  ['হাসান মাহমুদ', 'মোবাইল: ০১৭১২-৩৪৫৬৭৮'].join('\n'),
  { phone: '01712-345678' }
);

testCase(
  'truncated email TLD repaired from the card website',
  ['Nusrat Jahan', 'nusrat.jahan@bengalsolutions.co', 'www.bengalsolutions.com'].join('\n'),
  { email: 'nusrat.jahan@bengalsolutions.com' }
);

testCase(
  'duplicate commas in a joined address are collapsed',
  ['Level 7, Apex Tower, 42 Gulshan Avenue,', 'Gulshan 1, Dhaka 1212'].join('\n'),
  { address: 'Level 7, Apex Tower, 42 Gulshan Avenue, Gulshan 1, Dhaka 1212' }
);

testCaseDual(
  'back side (logo) merged with front (details): front wins, back fills blanks',
  [
    'APEX ENGINEERING & CONSULTANCY LTD.',
    'Muhammad Arif Chowdhury',
    'Deputy General Manager',
    '+880 1819-998877',
    'arif.chowdhury@apex-eng.com',
    'www.apex-eng.com'
  ].join('\n'),
  [
    'APEX',
    'Level 7, Apex Tower, Gulshan Avenue, Dhaka 1212',
    '01711-223344'
  ].join('\n'),
  {
    name: 'Muhammad Arif Chowdhury',
    company: 'APEX ENGINEERING & CONSULTANCY LTD.',
    phone: '+880 1819-998877, 01711-223344',
    email: 'arif.chowdhury@apex-eng.com',
    address: 'Level 7, Apex Tower, Gulshan Avenue, Dhaka 1212'
  }
);

/* ------------------------------------------------------------------------ */

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
