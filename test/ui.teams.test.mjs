/* ============================================================================
   UI smoke test — v1.5.0 Teams
   Boots the REAL app.js + db.js in jsdom against a stub Supabase client
   (a tiny in-memory .eq() filter), then drives the Teams UI with clicks:
   teams sheet, invites, manage, team vault view, attribution, analytics,
   share/unshare affordances, exit team.

   Run:  npm i --no-save jsdom && node test/ui.teams.test.mjs
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});

const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.navigator = window.navigator;
globalThis.localStorage = window.localStorage;
globalThis.location = window.location;
globalThis.history = window.history;
globalThis.Node = window.Node;
globalThis.Element = window.Element;
globalThis.HTMLElement = window.HTMLElement;
globalThis.CustomEvent = window.CustomEvent;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.getComputedStyle = window.getComputedStyle;
window.matchMedia ||= (q) => ({
  matches: false, media: q,
  addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {}
});

/* ---------- stub Supabase client (in-memory, supports .eq chains) -------- */

const USER = { id: 'u1', email: 'Owner@Example.com' }; // mixed case on purpose

const fixtures = {
  cards: [
    { id: 'c1', user_id: 'u1', name: 'Rahim Uddin', company: 'Acme Ltd', designation: 'CEO',
      phone: '+880 1712-345678', email: 'rahim@acme.com', created_at: '2026-08-01T00:00:00Z',
      org_id: 'o1', card_image_path: null, raw_text: '' },
    { id: 'c2', user_id: 'u2', name: 'Rahim Uddin', company: 'Acme Ltd', designation: '',
      phone: '8801712345678', email: '', created_at: '2026-08-02T00:00:00Z',
      org_id: 'o1', card_image_path: null, raw_text: '' },
    { id: 'c3', user_id: 'u1', name: 'Soleman Ali', company: '', designation: '',
      phone: '', email: '', created_at: '2026-08-03T00:00:00Z',
      org_id: null, card_image_path: null, raw_text: '' }
  ],
  org_members: [
    { org_id: 'o1', user_id: 'u1', role: 'owner', email: 'owner@example.com', name: 'Alice', joined_at: '2026-01-01T00:00:00Z',
      organizations: { id: 'o1', name: 'Apex Team', owner_id: 'u1', created_at: '2026-01-01T00:00:00Z' } },
    { org_id: 'o1', user_id: 'u2', role: 'member', email: 'bob@example.com', name: 'Bob', joined_at: '2026-01-02T00:00:00Z',
      organizations: { id: 'o1', name: 'Apex Team', owner_id: 'u1', created_at: '2026-01-01T00:00:00Z' } }
  ],
  org_invites: [
    { id: 'inv1', email: 'owner@example.com',
      organizations: { id: 'o9', name: 'Other Co', owner_id: 'u9' } }
  ]
};

const EQ_FILTERABLE = new Set(['id', 'user_id', 'org_id', 'email']);

function makeBuilder(table) {
  const eqs = [];
  const settle = () => {
    let rows = (fixtures[table] || []).map((r) => ({ ...r }));
    for (const [col, val] of eqs) {
      if (EQ_FILTERABLE.has(col)) rows = rows.filter((r) => String(r[col]) === String(val));
    }
    return { data: rows, error: null };
  };
  const core = {
    then(onOk, onErr) { return Promise.resolve(settle()).then(onOk, onErr); },
    catch(onErr) { return Promise.resolve(settle()).catch(onErr); }
  };
  return new Proxy(core, {
    get(target, prop, recv) {
      if (prop in target) return Reflect.get(target, prop, recv);
      return (...args) => {
        if (prop === 'eq') eqs.push([args[0], args[1]]);
        return recv;
      };
    }
  });
}

window.supabase = {
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: USER } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    },
    from: (t) => makeBuilder(t),
    storage: { from: () => makeBuilder('x') }
  })
};

/* ---------- helpers ------------------------------------------------------ */

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ FAIL: ${label}`); }
};
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

/* ---------- boot the real app -------------------------------------------- */

await import('../js/app.js');
await tick(80);

console.log('• boot (cloud session via stub)');

ok($('#searchInput'), 'app rendered main view');
ok(document.body.textContent.includes('CardVault'), 'brand present');
ok($('[data-action="teams"]'), 'header shows Teams button in cloud mode');
ok($$('.tile').length === 3, `personal vault lists 3 visible cards (own + shared) — got ${$$('.tile').length}`);

/* ---------- teams sheet ---------------------------------------------------- */

console.log('• teams sheet');
click($('[data-action="teams"]'));
await tick(80);

ok($('#teamsBody'), 'teams sheet opened');
ok($('#teamsBody').textContent.includes('Apex Team'), 'team listed');
ok($('#teamsBody').textContent.includes('Other Co'), 'pending invitation listed');

// Manage → members + invite row + insights + delete (owner view)
click($('[data-action="team-manage"]'));
await tick(80);
const manageTxt = $('#teamsBody')?.textContent || '';
ok(manageTxt.includes('Members (2)'), 'manage shows member count');
ok(manageTxt.includes('bob@example.com'), 'member emails listed');
ok(manageTxt.includes('Invite'), 'owner sees invite box');
ok(manageTxt.includes('Delete team'), 'owner sees delete team');

/* ---------- open team vault ----------------------------------------------- */

console.log('• team vault view');
click($('[data-action="team-open"]'));
await tick(100);

ok($('#teamBanner') && $('#teamBanner').textContent.includes('Apex Team'), 'team banner visible');
ok($$('.tile').length === 2, `team vault shows 2 shared cards — got ${$$('.tile').length}`);
ok(document.body.textContent.includes('by Bob'), 'attribution on teammate card tile');
ok(!$('.fab'), 'capture FAB hidden in team view');

// detail of a teammate's card → read-only
click($('[data-action="open-detail"][data-id="c2"]'));
await tick(60);
const detailTxt = document.body.textContent;
ok(detailTxt.includes('Added by Bob'), 'detail shows "Added by Bob"');
ok(!$('[data-action="edit"]'), 'edit hidden for teammate card');
ok(!$('[data-action="delete"]'), 'delete hidden for teammate card');
click($('[data-action="close-modal"]')); // confirm dialog may stack — close everything
await tick(30);
while ($('.modal-backdrop')) { click(document.querySelector('[data-action="close-modal"]')); await tick(20); }

/* ---------- analytics ------------------------------------------------------ */

console.log('• team insights');
click($('[data-action="team-analytics"]'));
await tick(120);

ok($('#teamAnalyticsBody'), 'analytics sheet opened');
const ana = $('#teamAnalyticsBody')?.textContent || '';
ok(ana.includes('Who knows whom'), 'who-knows-whom section (shared Acme contact)');
ok(ana.includes('Alice') && ana.includes('Bob'), 'both members named');
ok(ana.includes('Rahim Uddin'), 'cross-member duplicate detected');
ok(ana.includes('Acme Ltd'), 'top companies includes Acme');
click(document.querySelector('#teamAnalyticsBody')?.closest('.sheet')?.querySelector('[data-action="close-modal"]') || $('[data-action="close-modal"]'));
await tick(30);
while ($('.modal-backdrop')) { click(document.querySelector('.sheet [data-action="close-modal"]') || $('[data-action="close-modal"]')); await tick(20); }

/* ---------- exit team view + share affordances ----------------------------- */

console.log('• exit + share affordances');
ok($('#teamBanner'), 'banner still up before exit');
click($('[data-action="team-exit"]'));
await tick(100);

ok(!$('#teamBanner')?.textContent?.trim(), 'banner cleared after exit');
ok($('.fab'), 'FAB back in personal view');
ok($$('.tile').length === 3, 'personal vault restored');

// my unshared card → Share to team…
click($('[data-action="open-detail"][data-id="c3"]'));
await tick(60);
ok($('[data-action="share-to-team"]'), 'unshared own card offers "Share to team…"');
ok(!$('[data-action="unshare-card"]'), 'no unshare on private card');
while ($('.modal-backdrop')) { click(document.querySelector('.sheet [data-action="close-modal"]') || $('[data-action="close-modal"]')); await tick(20); }

// my shared card → Shared with team + Unshare
click($('[data-action="open-detail"][data-id="c1"]'));
await tick(60);
ok(document.body.textContent.includes('Shared with Apex Team'), 'shared card shows team name');
ok($('[data-action="unshare-card"]'), 'unshare button present');
while ($('.modal-backdrop')) { click(document.querySelector('.sheet [data-action="close-modal"]') || $('[data-action="close-modal"]')); await tick(20); }

/* ---------- share chooser ---------------------------------------------------- */

console.log('• share chooser');
click($('[data-action="open-detail"][data-id="c3"]'));
await tick(50);
click($('[data-action="share-to-team"]'));
await tick(50);
ok($('[data-action="do-share"]'), 'chooser lists Apex Team to share with');
ok(document.body.textContent.includes('Share to team'), 'chooser sheet open');
while ($('.modal-backdrop')) { click(document.querySelector('.sheet [data-action="close-modal"]') || $('[data-action="close-modal"]')); await tick(20); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
