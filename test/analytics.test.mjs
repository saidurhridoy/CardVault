/* Unit tests for team vault analytics (js/analytics.js).
   Run with:  node test/analytics.test.mjs                                        */

import { computeTeamAnalytics } from '../js/analytics.js';

let passed = 0, failed = 0;

function check(label, actual, expected) {
  const a = String(actual ?? '').trim().toLowerCase();
  const e = String(expected ?? '').trim().toLowerCase();
  if (a === e) { passed++; return true; }
  failed++;
  console.error(`  ✗ ${label}\n      expected: "${expected}"\n      actual:   "${actual}"`);
  return false;
}

const U1 = '11111111-1111-1111-1111-111111111111'; // Rakib (owner)
const U2 = '22222222-2222-2222-2222-222222222222'; // Sadia (member)
const U3 = '33333333-3333-3333-3333-333333333333'; // Tanvir (member)

const members = [
  { user_id: U1, name: 'Rakib Hasan', email: 'rakib@x.com', role: 'owner' },
  { user_id: U2, name: 'Sadia Islam', email: 'sadia@x.com', role: 'member' },
  { user_id: U3, name: 'Tanvir Ahmed', email: 'tanvir@x.com', role: 'member' }
];

const d = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();
const card = (over = {}) => ({
  id: over.id || Math.random().toString(36).slice(2),
  user_id: U1, name: '', company: '', designation: '', phone: '', email: '',
  created_at: d(10), ...over
});

/* ------------------------------------------------------------------------ */

console.log('• totals and activity');
{
  const cards = [
    card({ user_id: U1, company: 'Bengal Solutions' }),
    card({ user_id: U1, company: 'Apex Engineering' }),
    card({ user_id: U2, company: 'Apex Engineering' }),
    card({ user_id: U3 })
  ];
  const a = computeTeamAnalytics(cards, members);
  check('totalCards', a.totalCards, 4);
  check('activity[0].name', a.activity[0].name, 'Rakib Hasan');
  check('activity[0].cards', a.activity[0].cards, 2);
  check('activity last has 1', a.activity[a.activity.length - 1].cards, 1);
}

console.log('• same contact added by two members = shared relationship');
{
  const cards = [
    card({ user_id: U1, name: 'Nusrat Jahan', company: 'Bengal Solutions', phone: '+880 1712-345678', email: 'nusrat@bengal.com' }),
    card({ user_id: U2, name: 'Nusrat Jahan', company: 'Bengal Solutions', phone: '01712-345678' }) // same number, BD-normalized
  ];
  const a = computeTeamAnalytics(cards, members);
  check('one duplicate group', a.duplicateGroups, 1);
  check('group is cross-member', a.crossMemberContacts, 1);
  check('knownBy joined', a.duplicates[0].knownBy.join('+'), 'Rakib Hasan+Sadia Islam');
  check('match on phone', a.duplicates[0].matches.includes('phone'), true);
}

console.log('• same member duplicated own card (not cross-member)');
{
  const cards = [
    card({ user_id: U1, name: 'Arif Chowdhury', company: 'Apex', email: 'arif@apex.com' }),
    card({ user_id: U1, name: 'Arif Chowdhury', company: 'Apex', email: 'arif@apex.com' })
  ];
  const a = computeTeamAnalytics(cards, members);
  check('duplicate group found', a.duplicateGroups, 1);
  check('not cross-member', a.crossMemberContacts, 0);
  check('shared=false', a.duplicates[0].shared, false);
}

console.log('• stale contacts (older than 180 days)');
{
  const cards = [
    card({ name: 'Fresh Contact', created_at: d(20) }),
    card({ name: 'Old Contact', created_at: d(400) }),
    card({ name: 'Ancient Contact', created_at: d(1000) })
  ];
  const a = computeTeamAnalytics(cards, members);
  check('stale count', a.stale.length, 2);
  check('oldest first', a.stale[0].name, 'Ancient Contact');
}

console.log('• top companies');
{
  const cards = [
    card({ company: 'Apex Engineering' }),
    card({ company: 'apex engineering' }),
    card({ company: 'apex engineering.' }),
    card({ company: 'Bengal Solutions' }),
    card({ company: '' })
  ];
  const a = computeTeamAnalytics(cards, members);
  check('top company', a.topCompanies[0].company, 'Apex Engineering');
  check('top count (case/punct-insensitive)', a.topCompanies[0].count, 3);
}

console.log('• who knows whom');
{
  const cards = [
    card({ user_id: U1, company: 'Apex Engineering' }),
    card({ user_id: U2, company: 'Apex Engineering' }),
    card({ user_id: U1, company: 'Bengal Solutions' }),
    card({ user_id: U2, company: 'Bengal Solutions' }),
    card({ user_id: U1, company: 'Zenith Traders' }),
    card({ user_id: U3, company: 'Zenith Traders' })
  ];
  const a = computeTeamAnalytics(cards, members);
  check('two pairs', a.whoKnowsWhom.length, 2);
  const top = a.whoKnowsWhom[0];
  check('top pair sharedCount', top.sharedCount, 2);
  check('top pair is rakib+sadia', [top.a, top.b].sort().join('+'), 'Rakib Hasan+Sadia Islam');
}

console.log('• empty vault');
{
  const a = computeTeamAnalytics([], members);
  check('totalCards', a.totalCards, 0);
  check('no duplicates', a.duplicateGroups, 0);
  check('no stale', a.stale.length, 0);
}

/* ------------------------------------------------------------------------ */

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
