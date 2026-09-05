/* Unit tests for the OCR field parser (js/ocr.js).
   Run with:  npm test   (or: node test/parser.test.mjs)                */

import { parseCardText } from '../js/ocr.js';

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

/* ------------------------------------------------------------------------ */

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
