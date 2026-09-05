/* ============================================================================
   CardVault — app controller (vanilla JS, no framework, no build step)

   Views: setup → auth → main (grid + search) with overlay sheets for
   capture, OCR review, card detail, edit, and settings.
   ========================================================================== */

import { IS_CONFIGURED, APP_NAME, APP_VERSION, OAUTH_PROVIDERS, OCR_LANGS } from './config.js';
import * as db from './db.js';
import { recognizeCard, parseCardText, mergeCardParses } from './ocr.js';
import { buildVCard, buildVCardCollection, vcardFileName } from './vcard.js';
import {
  $, esc, debounce, toast, uid, formatDate, initials, gradientFor,
  copyText, fileToDataUrl, downscaleDataUrl, dataUrlToBlob, smallPhotoBase64,
  downloadText, downloadBlob, safeStore, titleCaseIfShouting
} from './util.js';

/* ---------------------------------------------------------------- icons -- */

const I = (paths, extra = '') =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}${extra}</svg>`;

const SVG = {
  camera: I('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'),
  search: I('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
  x: I('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  phone: I('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>'),
  mail: I('<rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,6 12,13 2,6"/>'),
  globe: I('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
  map: I('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
  download: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  share: I('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>'),
  edit: I('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
  trash: I('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  plus: I('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  flip: I('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>'),
  zap: I('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
  image: I('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'),
  sliders: I('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>'),
  logout: I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
  upload: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
  check: I('<polyline points="20 6 9 17 4 12"/>'),
  alert: I('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  info: I('<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'),
  user: I('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  lock: I('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
  file: I('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'),
  cards: I('<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 8h7M7 11h10"/><path d="M7 15h4"/>'),
  keyboard: I('<rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="10"/><line x1="10" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="14" y2="10"/><line x1="18" y1="10" x2="18" y2="10"/><line x1="7" y1="14" x2="17" y2="14"/>'),
  google: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.27 14.29A7.16 7.16 0 0 1 4.89 12c0-.79.14-1.57.38-2.29V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"/></svg>',
  apple: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 20.28c-.98.95-2.05.86-3.08.38-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.38C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.12-.9 3.4-.82.98.07 1.81.42 2.47 1.03-2.28 1.37-2.93 4.66-.66 6.93.62.62 1.35 1.06 2.24 1.33-.43 1.19-1.05 2.27-1.53 2.7zM12.09 7.1c-.15-2.2 1.66-4.1 3.68-4.1.32 2.31-2.05 4.35-3.68 4.1z"/></svg>'
};

const SPINNER = '<span class="spinner"></span>';
const SPINNER_DARK = '<span class="spinner spinner-dark"></span>';

const SAMPLE_CARDS = [
  { name: 'Nusrat Jahan', designation: 'Product Manager', company: 'Bengal Solutions Ltd.', phone: '+880 1811-998877', email: 'nusrat@bengalsolutions.com', website: 'www.bengalsolutions.com', address: 'Level 4, House 22, Road 11, Banani, Dhaka 1213', notes: 'Met at the Tech Summit' },
  { name: 'Tanvir Ahmed', designation: 'Sales Director', company: 'Padma Foods Ltd.', phone: '+880 1711-223344, 02-5566778', email: 'tanvir@padmafoods.com', website: '', address: 'Sector 7, Uttara, Dhaka 1230', notes: '' },
  { name: 'Sharmin Akter', designation: 'HR Consultant', company: 'Dhaka HR Hub', phone: '+880 1912-556677', email: 'sharmin@dhakahrhub.com', website: '', address: '', notes: 'Referral from Rahim' }
];

/* ---------------------------------------------------------------- state -- */

const state = {
  mode: null,          // 'cloud' | 'local'
  user: null,
  cards: [],
  query: '',
  sort: 'newest',
  loading: false,
  offline: false
};

const store = {
  list: () => (state.mode === 'local' ? db.listCardsLocal() : db.listCards()),
  add: (fields, image, rawText) =>
    state.mode === 'local' ? db.addCardLocal(fields, image, rawText) : db.addCard(fields, image, rawText),
  update: (id, patch) =>
    state.mode === 'local' ? db.updateCardLocal(id, patch) : db.updateCard(id, patch),
  remove: (card) =>
    state.mode === 'local' ? db.deleteCardLocal(card) : db.deleteCard(card),
  imageUrl: (card) =>
    state.mode === 'local' ? db.getImageUrlLocal(card) : db.getImageUrl(card)
};

let deferredInstall = null;

/* ============================================================ modal stack --
   One "sentinel" history entry is pushed when the first overlay opens, so the
   phone's back button closes overlays instead of leaving the app. UI closes
   consume the entry via history.back(); an expected-popstate counter keeps
   late-arriving popstate events from closing a *newly* opened overlay.        */

const modalStack = [];
let ownsHistoryEntry = false;   // current history entry is our modal sentinel
let expectedPopstates = 0;      // popstates triggered by our own history.back()

function pushOverlay(el, { onClose = null, guard = null } = {}) {
  const entry = { el, onClose, guard };
  const wasEmpty = modalStack.length === 0;
  modalStack.push(entry);
  if (wasEmpty) {
    try {
      history.pushState({ cvModal: true }, '');
      ownsHistoryEntry = true;
    } catch { /* sandboxed context — back-button integration unavailable */ }
  }
  return entry;
}

function closeTopEntry() {
  const entry = modalStack.pop();
  if (!entry) return;
  entry.el.remove();
  if (entry.onClose) entry.onClose();
}

function consumeHistoryEntry() {
  if (!ownsHistoryEntry) return;
  ownsHistoryEntry = false;
  expectedPopstates++;
  try { history.back(); } catch { expectedPopstates--; }
}

function requestCloseTop(force = false) {
  const entry = modalStack[modalStack.length - 1];
  if (!entry) return;
  if (!force && entry.guard && entry.guard() === false) return;
  closeTopEntry();
  if (modalStack.length === 0) consumeHistoryEntry();
}

function closeAllOverlays() {
  if (!modalStack.length) return;
  while (modalStack.length) closeTopEntry();
  consumeHistoryEntry();
}

window.addEventListener('popstate', () => {
  if (ownsHistoryEntry) ownsHistoryEntry = false;
  if (expectedPopstates > 0) { expectedPopstates--; return; }
  closeTopEntry(); // genuine user "back" press → close top overlay
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') requestCloseTop();
});

/** Standard bottom-sheet dialog. Returns the backdrop element. */
function openSheet(innerHtml, { wide = false, onClose = null, guard = null, backdropClose = true } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet' + (wide ? ' sheet-wide' : '');
  sheet.innerHTML = '<div class="grabber" aria-hidden="true"></div>' + innerHtml;
  backdrop.appendChild(sheet);
  document.getElementById('modal-root').appendChild(backdrop);
  pushOverlay(backdrop, { onClose, guard });
  if (backdropClose) {
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) requestCloseTop(); });
  }
  return backdrop;
}

function sheetHead(title, extra = '') {
  return `
    <div class="sheet-head">
      <h3 class="sheet-title">${esc(title)}</h3>
      ${extra}
      <button class="icon-btn" data-action="close-modal" aria-label="Close">${SVG.x}</button>
    </div>`;
}

/** Promise-based confirm dialog (no native confirm — blocked in sandboxed iframes). */
function confirmDialog(message, confirmLabel = 'Confirm', { danger = true } = {}) {
  return new Promise((resolve) => {
    const backdrop = openSheet(`
      ${sheetHead('Are you sure?')}
      <div class="sheet-body">
        <p style="margin:0 0 6px;font-size:15px">${esc(message)}</p>
        <div class="menu-end">
          <button class="btn btn-ghost" data-x="cancel" style="flex:1">Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-x="ok" style="flex:1">${esc(confirmLabel)}</button>
        </div>
      </div>`, { backdropClose: false });
    backdrop.querySelector('[data-x="cancel"]').onclick = () => { resolve(false); closeTopEntry(); };
    backdrop.querySelector('[data-x="ok"]').onclick = () => { resolve(true); closeTopEntry(); };
  });
}

/* ================================================================= boot  -- */

async function init() {
  bindGlobalEvents();
  registerServiceWorker();

  const params = new URLSearchParams(location.search);

  if (!IS_CONFIGURED) return renderSetup();
  if (!db.hasCloudSdk()) return renderSetup({ sdkOffline: true });

  try {
    db.initCloud();
    db.onAuthChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        state.mode = null; state.user = null; state.cards = [];
        renderAuth();
      } else if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        // OAuth callback finishes asynchronously — this is the entry point for it
        enterApp();
      }
    });
    const session = await db.getSession();
    if (session?.user) {
      enterApp();
      if (params.get('reset') === '1') openPasswordModal();
      else if (params.get('action') === 'capture') openCapture();
    } else if (/[?&](code|error)=/.test(location.search) || location.hash.includes('access_token')) {
      // Returning from Google/Apple — the SDK is exchanging the code; keep the
      // splash briefly while onAuthStateChange brings us in.
      const errText = params.get('error_description') || params.get('error');
      if (errText) toast(decodeURIComponent(errText).replace(/\+/g, ' '), 'error', 5000);
      setTimeout(() => { if (!state.user) renderAuth(); }, 4000);
    } else {
      renderAuth();
    }
  } catch (err) {
    console.error(err);
    renderSetup({ sdkOffline: true });
  }
}

function registerServiceWorker() {
  // Native Android build (Capacitor): the app shell ships inside the APK —
  // a service worker adds nothing and can serve stale caches across updates.
  if (window.CARDVAULT_NATIVE) return;
  if (!('serviceWorker' in navigator)) return;
  const secure = location.protocol === 'https:' ||
    ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!secure) return;
  navigator.serviceWorker.register('./sw.js').catch(() => { /* non-fatal */ });
}

function bindGlobalEvents() {
  document.addEventListener('click', onGlobalClick);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
  });
}

/* ================================================================ setup  -- */

function renderSetup({ sdkOffline = false } = {}) {
  closeAllOverlays();
  $('#app').innerHTML = `
    <div class="center-page">
      <div class="auth-card">
        <div class="auth-logo">${SVG.cards}</div>
        <h1 class="auth-title">${APP_NAME}</h1>
        <p class="auth-sub">Your pocket business-card wallet</p>
        ${sdkOffline
          ? `<div class="notice notice-warn">${SVG.alert}<span><b>Couldn't load the Supabase SDK.</b><br>Check your internet connection and refresh the page.</span></div>`
          : ''}
        <div class="notice notice-info">${SVG.info}<span><b>One step left:</b> connect your free Supabase project to enable cloud accounts &amp; sync.</span></div>
        <ol class="setup-steps">
          <li>Create a free project at <b>supabase.com</b></li>
          <li>Run <code>supabase/schema.sql</code> in its SQL editor</li>
          <li>Paste your URL + anon key into <code>js/config.js</code></li>
        </ol>
        <a class="btn btn-primary btn-block btn-lg" href="docs/SETUP.md" target="_blank" rel="noopener">${SVG.file} Open the setup guide</a>
        <div class="auth-alt">
          No account needed — <button class="link-btn" data-action="demo-mode">try demo mode</button> (data stays on this device)
        </div>
      </div>
    </div>`;
}

/* ================================================================= auth  -- */

let authTab = 'in';

function renderAuth() {
  closeAllOverlays();
  authTab = 'in';
  const socialButtons = OAUTH_PROVIDERS.map((p) =>
    p === 'apple'
      ? `<button class="btn btn-social btn-block" data-action="oauth" data-provider="apple">${SVG.apple}<span>Continue with Apple</span></button>`
      : `<button class="btn btn-social btn-block" data-action="oauth" data-provider="google">${SVG.google}<span>Continue with Google</span></button>`
  ).join('');
  $('#app').innerHTML = `
    <div class="center-page">
      <div class="auth-card">
        <div class="auth-logo">${SVG.cards}</div>
        <h1 class="auth-title">${APP_NAME}</h1>
        <p class="auth-sub">Sign in to save &amp; sync your cards</p>
        ${socialButtons}
        ${socialButtons ? '<div class="auth-divider"><span>or use email</span></div>' : ''}
        <div class="tabs">
          <button class="tab active" id="tabIn" type="button">Sign in</button>
          <button class="tab" id="tabUp" type="button">Create account</button>
        </div>
        <form id="authForm" novalidate>
          <div class="field">
            <label for="authEmail">Email</label>
            <input class="input" id="authEmail" type="email" autocomplete="username" placeholder="you@example.com" required>
          </div>
          <div class="field">
            <label for="authPassword">Password</label>
            <input class="input" id="authPassword" type="password" autocomplete="current-password" minlength="6" placeholder="At least 6 characters" required>
          </div>
          <button class="btn btn-primary btn-block btn-lg" id="authSubmit" type="submit">Sign in</button>
          <div class="auth-alt"><button class="link-btn" id="forgotLink" type="button">Forgot password?</button></div>
        </form>
      </div>
    </div>`;

  const form = $('#authForm');
  const tabIn = $('#tabIn'), tabUp = $('#tabUp'), submit = $('#authSubmit'), pw = $('#authPassword');

  const setTab = (t) => {
    authTab = t;
    tabIn.classList.toggle('active', t === 'in');
    tabUp.classList.toggle('active', t === 'up');
    submit.textContent = t === 'in' ? 'Sign in' : 'Create account';
    pw.autocomplete = t === 'in' ? 'current-password' : 'new-password';
  };
  tabIn.onclick = () => setTab('in');
  tabUp.onclick = () => setTab('up');

  $('#forgotLink').onclick = () => {
    const email = $('#authEmail').value.trim();
    openSheet(`
      ${sheetHead('Reset password')}
      <div class="sheet-body">
        <p style="margin:0 0 14px;color:var(--muted);font-size:14px">We'll email you a secure link to set a new password.</p>
        <div class="field">
          <label for="resetEmail">Email</label>
          <input class="input" id="resetEmail" type="email" value="${esc(email)}" placeholder="you@example.com">
        </div>
        <button class="btn btn-primary btn-block" id="resetSend">${SVG.mail} Send reset link</button>
      </div>`);
    $('#resetSend').onclick = async () => {
      const em = $('#resetEmail').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(em)) return toast('Enter a valid email', 'error');
      const btn = $('#resetSend');
      btn.disabled = true; btn.innerHTML = SPINNER + 'Sending…';
      try {
        await db.resetPassword(em);
        closeTopEntry();
        toast('Reset link sent — check your inbox ✓', 'ok', 4200);
      } catch (err) {
        toast(friendlyAuthError(err.message), 'error');
        btn.disabled = false; btn.textContent = 'Send reset link';
      }
    };
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#authEmail').value.trim();
    const password = pw.value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Enter a valid email', 'error');
    if (password.length < 6) return toast('Password must be at least 6 characters', 'error');

    submit.disabled = true;
    submit.innerHTML = authTab === 'in' ? SPINNER + 'Signing in…' : SPINNER + 'Creating account…';
    try {
      if (authTab === 'in') {
        await db.signIn(email, password);
        enterApp();
      } else {
        const data = await db.signUp(email, password);
        if (data.session) {
          enterApp();
        } else {
          toast('Account created — check your inbox to confirm, then sign in.', 'info', 5200);
          setTab('in');
        }
      }
    } catch (err) {
      toast(friendlyAuthError(err.message), 'error');
    } finally {
      submit.disabled = false;
      submit.textContent = authTab === 'in' ? 'Sign in' : 'Create account';
    }
  };
}

function friendlyAuthError(msg) {
  const m = String(msg || '');
  if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/already registered/i.test(m)) return 'That email already has an account — try signing in.';
  if (/at least 6/i.test(m)) return 'Password must be at least 6 characters.';
  if (/rate limit/i.test(m)) return 'Too many attempts — please wait a moment.';
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Network error — check your connection.';
  if (/email not confirmed/i.test(m)) return 'Please confirm your email first (check your inbox).';
  return m || 'Something went wrong.';
}

/* ============================================================ main view  -- */

function enterApp() {
  if (state.user && state.mode) return; // guard: getSession + OAuth event may both fire
  state.mode = db.mode();
  state.user = db.user();
  renderMain();
  loadCards();
  if (state.mode === 'cloud') maybeOfferDemoImport();
}

async function enterDemo() {
  db.enterLocalMode();
  enterApp();
  const persistent = await db.LocalStore.isPersistent();
  if (!persistent) {
    toast('Preview storage is temporary — cards reset on reload', 'info', 4500);
  }
}

function renderMain() {
  closeAllOverlays();
  $('#app').innerHTML = `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand">
          <div class="brand-logo">${SVG.cards}</div>
          <span class="brand-name">Card<span>Vault</span></span>
          ${state.mode === 'local' ? '<span class="chip chip-demo">Demo · this device</span>' : ''}
        </div>
        <div class="topbar-actions">
          <button class="icon-btn" data-action="settings" aria-label="Settings" title="Settings">${SVG.sliders}</button>
        </div>
      </div>
    </header>
    <main class="main">
      <div class="toolbar">
        <div class="search">
          ${SVG.search}
          <input id="searchInput" type="search" placeholder="Search name, company, designation…" autocomplete="off" spellcheck="false" aria-label="Search cards">
          <button class="search-clear" data-action="clear-search" aria-label="Clear search" hidden>${SVG.x.replace('class="icon"', 'class="icon" style="width:.9em;height:.9em"')}</button>
        </div>
        <select id="sortSelect" class="select" aria-label="Sort cards">
          <option value="newest">Newest</option>
          <option value="name">Name A–Z</option>
          <option value="company">Company A–Z</option>
        </select>
      </div>
      <div class="offline-banner" id="offlineBanner" hidden>${SVG.alert} Offline — showing your last saved copy.</div>
      <p class="count-line" id="countLine"></p>
      <div id="grid" class="grid" aria-live="polite"></div>
    </main>
    <button class="fab" data-action="capture" aria-label="Scan a new card" title="Scan a card">${SVG.camera}</button>`;

  const si = $('#searchInput');
  si.addEventListener('input', debounce(() => {
    state.query = si.value;
    $('.search-clear').hidden = !si.value;
    renderGrid();
  }, 110));
  $('#sortSelect').addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderGrid();
  });
}

async function loadCards() {
  state.loading = true;
  renderGrid();
  try {
    state.cards = await store.list();
    state.offline = false;
    if (state.mode === 'cloud') {
      try { safeStore.set('cv_cards_cache', JSON.stringify(state.cards)); } catch { /* quota */ }
    }
  } catch (err) {
    console.error(err);
    state.offline = true;
    state.cards = [];
    if (state.mode === 'cloud') {
      try { state.cards = JSON.parse(safeStore.get('cv_cards_cache') || '[]'); } catch { /* ignore */ }
    }
    toast('Could not reach the cloud — showing cached copy', 'error');
  }
  state.loading = false;
  renderGrid();
  if (state.mode === 'cloud') hydrateImages();
}

/** Resolve image URLs for cloud cards progressively (signed URLs). */
async function hydrateImages() {
  const queue = state.cards.filter((c) => c.card_image_path && c._imgUrl === undefined);
  if (!queue.length) return;
  const worker = async () => {
    while (queue.length) {
      const c = queue.shift();
      c._imgUrl = await store.imageUrl(c).catch(() => null);
      const img = document.querySelector(`[data-img="${c.id}"]`);
      if (img && c._imgUrl) img.src = c._imgUrl;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  renderGrid();
}

function getFiltered() {
  const q = state.query.trim().toLowerCase();
  let list = state.cards;
  if (q) {
    const digits = q.replace(/\D/g, '');
    list = list.filter((c) => {
      const hay = [c.name, c.company, c.designation, c.email, c.phone, c.address, c.notes]
        .filter(Boolean).join(' ').toLowerCase();
      if (hay.includes(q)) return true;
      if (digits.length >= 3 && String(c.phone || '').replace(/\D/g, '').includes(digits)) return true;
      return false;
    });
  }
  const byKey = (k) => (a, b) => String(a[k] || '\uffff').localeCompare(String(b[k] || '\uffff'), undefined, { sensitivity: 'base' });
  if (state.sort === 'name') list = [...list].sort(byKey('name'));
  else if (state.sort === 'company') list = [...list].sort(byKey('company'));
  else list = [...list].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return list;
}

function avatarHtml(label, extraStyle = '') {
  const text = label || '?';
  return `<div class="avatar" style="background:${gradientFor(text)};${extraStyle}">${esc(initials(text))}</div>`;
}

function tileHtml(c) {
  const label = c.name || c.company || 'Untitled';
  const imgUrl = state.mode === 'local' ? (c.image_data || null) : (c._imgUrl || null);
  const sub = [c.designation, c.company].filter(Boolean).join(' · ') || c.email || c.phone || '';
  return `
    <article class="tile" data-action="open-detail" data-id="${esc(c.id)}" tabindex="0" role="button" aria-label="${esc(label)}">
      <div class="tile-img">
        ${imgUrl ? `<img loading="lazy" data-img="${esc(c.id)}" src="${esc(imgUrl)}" alt="Business card of ${esc(label)}">` : avatarHtml(label)}
      </div>
      <div class="tile-body">
        <h3 class="tile-name">${esc(label)}</h3>
        <p class="tile-sub">${esc(sub)}</p>
      </div>
    </article>`;
}

function renderGrid() {
  const grid = $('#grid');
  if (!grid) return;

  const banner = $('#offlineBanner');
  if (banner) banner.hidden = !state.offline;

  if (state.loading) {
    grid.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton"></div>').join('');
    setCountLine('');
    return;
  }

  if (!state.cards.length) {
    grid.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        ${SVG.cards}
        <h3>No cards yet</h3>
        <p>Capture a business card with your camera — CardVault reads the details for you and keeps them one tap away.</p>
        <button class="btn btn-primary btn-lg" data-action="capture">${SVG.camera} Scan your first card</button>
        ${'contacts' in navigator ? `<div style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-action="import-contacts">${SVG.user} Import from contacts</button></div>` : ''}
        ${state.mode === 'local' ? '<div style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-action="add-samples">Add 3 sample cards</button></div>' : ''}
      </div>`;
    setCountLine('');
    return;
  }

  const list = getFiltered();
  if (!list.length) {
    grid.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        ${SVG.search}
        <h3>No matches</h3>
        <p>Nothing found for “${esc(state.query)}”. Try a name, company, designation, phone or email.</p>
      </div>`;
  } else {
    grid.innerHTML = list.map(tileHtml).join('');
  }
  setCountLine(state.query
    ? `${list.length} of ${state.cards.length} cards`
    : `${state.cards.length} card${state.cards.length === 1 ? '' : 's'}`);
}

function setCountLine(text) {
  const el = $('#countLine');
  if (el) el.textContent = text;
}

/* ============================================================ capture    -- */

const cam = { stream: null, facing: 'environment', torch: false, video: null, torchTrack: null, onCaptured: null };

async function openCapture(onCaptured) {
  const isBack = typeof onCaptured === 'function';
  cam.onCaptured = isBack ? onCaptured : null;
  const el = document.createElement('div');
  el.className = 'cam-overlay';
  el.innerHTML = `
    <video class="cam-video" id="camVideo" playsinline autoplay muted></video>
    <div class="cam-frame"><div class="cam-frame-box"><i></i><i></i><i></i><i></i></div></div>
    <p class="cam-hint">${isBack ? 'Fit the <b>back</b> of the card inside the frame' : 'Fit the business card inside the frame'}</p>
    <div class="cam-top">
      <button class="cam-btn" id="camClose" aria-label="Close">${SVG.x}</button>
      <div class="cam-title">${isBack ? 'Scan back side' : 'Scan card'}</div>
      <button class="cam-btn" id="camFlip" aria-label="Flip camera" title="Flip camera">${SVG.flip}</button>
    </div>
    <div class="cam-error" id="camError" hidden>
      ${SVG.alert}
      <h3>Camera unavailable</h3>
      <p>Your browser blocked the camera, or this device has none. You can still upload a photo of the card, or type the details yourself.</p>
      <button class="btn btn-primary" id="camErrGallery">${SVG.image} Upload a photo</button>
    </div>
    <div class="cam-bottom">
      <button class="cam-alt" id="camGallery">${SVG.image}<span>Gallery</span></button>
      <button class="cam-shutter" id="camShutter" aria-label="Capture">${SVG.camera}</button>
      <button class="cam-alt" id="camManual">${SVG.keyboard}<span>Manual</span></button>
    </div>
    <input type="file" id="camFile" accept="image/*" hidden>`;
  document.getElementById('modal-root').appendChild(el);
  pushOverlay(el, { onClose: stopCamera });

  cam.facing = 'environment';
  cam.torch = false;

  const fileInput = el.querySelector('#camFile');

  el.querySelector('#camClose').onclick = () => requestCloseTop();
  el.querySelector('#camFlip').onclick = async () => {
    cam.facing = cam.facing === 'environment' ? 'user' : 'environment';
    stopCamera();
    await startCamera(el);
  };
  el.querySelector('#camShutter').onclick = () => captureFrame(el);
  el.querySelector('#camGallery').onclick = () => fileInput.click();
  el.querySelector('#camErrGallery').onclick = () => fileInput.click();
  el.querySelector('#camManual').onclick = () => { requestCloseTop(true); openReview(null); };

  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const raw = await fileToDataUrl(file);
      const dataUrl = await downscaleDataUrl(raw, 1600, 0.85);
      const cb = cam.onCaptured;
      cam.onCaptured = null;
      requestCloseTop(true);
      cb ? cb(dataUrl) : openReview(dataUrl);
    } catch (err) {
      toast('Could not read that image', 'error');
    }
  };

  await startCamera(el);
}

async function startCamera(el) {
  const video = el.querySelector('#camVideo');
  const errBox = el.querySelector('#camError');
  cam.video = video;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('getUserMedia unsupported');
    cam.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: cam.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    video.srcObject = cam.stream;
    await video.play().catch(() => {});
    errBox.hidden = true;
    const track = cam.stream.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() || {};
    if (caps.torch) {
      cam.torchTrack = track;
      addTorchButton(el);
    }
  } catch (err) {
    console.warn('Camera failed:', err);
    video.style.display = 'none';
    el.querySelector('.cam-frame').style.display = 'none';
    el.querySelector('.cam-hint').style.display = 'none';
    errBox.hidden = false;
  }
}

function addTorchButton(el) {
  if (el.querySelector('#camTorch')) return;
  const btn = document.createElement('button');
  btn.className = 'cam-btn';
  btn.id = 'camTorch';
  btn.setAttribute('aria-label', 'Toggle flashlight');
  btn.title = 'Flashlight';
  btn.innerHTML = SVG.zap;
  btn.onclick = async () => {
    if (!cam.torchTrack) return;
    cam.torch = !cam.torch;
    try {
      await cam.torchTrack.applyConstraints({ advanced: [{ torch: cam.torch }] });
      btn.style.background = cam.torch ? 'rgba(255,255,255,.85)' : '';
      btn.style.color = cam.torch ? '#111' : '';
    } catch { toast('Flashlight not available', 'error'); }
  };
  el.querySelector('.cam-top').appendChild(btn);
}

function stopCamera() {
  if (cam.stream) {
    cam.stream.getTracks().forEach((t) => t.stop());
    cam.stream = null;
  }
  cam.video = null;
  cam.torchTrack = null;
  cam.onCaptured = null;
}

function captureFrame(el) {
  const video = cam.video;
  if (!video || !video.videoWidth) return toast('Camera not ready', 'error');
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0);
  const raw = c.toDataURL('image/jpeg', 0.92);
  const cb = cam.onCaptured;
  cam.onCaptured = null;
  requestCloseTop(true); // also stops the camera via onClose
  downscaleDataUrl(raw, 1600, 0.85)
    .then((dataUrl) => (cb ? cb(dataUrl) : openReview(dataUrl)))
    .catch(() => (cb ? cb(raw) : openReview(raw)));
}

/** Stack front + back photos into one image (stored as the card photo). */
function loadImgEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

async function composeCardImage(frontUrl, backUrl) {
  const [f, b] = await Promise.all([loadImgEl(frontUrl), loadImgEl(backUrl)]);
  const W = Math.max(f.naturalWidth, b.naturalWidth);
  const fh = Math.round((f.naturalHeight * W) / f.naturalWidth);
  const bh = Math.round((b.naturalHeight * W) / b.naturalWidth);
  const gap = Math.max(10, Math.round(W * 0.02));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = fh + gap + bh;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(f, 0, 0, W, fh);
  ctx.drawImage(b, 0, fh + gap, W, bh);
  return c.toDataURL('image/jpeg', 0.85);
}

/* ============================================================ review     -- */

let reviewForceClose = false;

function cardFormHtml(f = {}) {
  return `
    <div class="form-grid">
      <div class="field span-2">
        <label for="f-name">Name</label>
        <input class="input" id="f-name" name="name" autocomplete="off" value="${esc(f.name || '')}" placeholder="e.g. Nusrat Jahan">
      </div>
      <div class="field">
        <label for="f-designation">Designation</label>
        <input class="input" id="f-designation" name="designation" autocomplete="off" value="${esc(f.designation || '')}" placeholder="e.g. Product Manager">
      </div>
      <div class="field">
        <label for="f-company">Company</label>
        <input class="input" id="f-company" name="company" autocomplete="off" value="${esc(f.company || '')}" placeholder="e.g. Bengal Solutions Ltd.">
      </div>
      <div class="field">
        <label for="f-phone">Phone</label>
        <input class="input" id="f-phone" name="phone" type="tel" autocomplete="off" value="${esc(f.phone || '')}" placeholder="+880 17xx-xxxxxx">
      </div>
      <div class="field">
        <label for="f-email">Email</label>
        <input class="input" id="f-email" name="email" type="email" autocomplete="off" value="${esc(f.email || '')}" placeholder="name@company.com">
      </div>
      <div class="field">
        <label for="f-website">Website</label>
        <input class="input" id="f-website" name="website" autocomplete="off" value="${esc(f.website || '')}" placeholder="www.company.com">
      </div>
      <div class="field">
        <label for="f-address">Address</label>
        <input class="input" id="f-address" name="address" autocomplete="off" value="${esc(f.address || '')}" placeholder="Street, area, city">
      </div>
      <div class="field span-2">
        <label for="f-notes">Notes</label>
        <textarea class="textarea" id="f-notes" name="notes" placeholder="Where you met, follow-up reminders…">${esc(f.notes || '')}</textarea>
      </div>
    </div>`;
}

function readCardForm(root) {
  const get = (n) => root.querySelector(`[name="${n}"]`)?.value.trim() || '';
  return {
    name: get('name'), designation: get('designation'), company: get('company'),
    phone: get('phone'), email: get('email'), website: get('website'),
    address: get('address'), notes: get('notes')
  };
}

function formIsDirty(root) {
  return Object.values(readCardForm(root)).some(Boolean);
}

const OCR_STATUS_MSG = {
  'loading tesseract core': 'Loading OCR engine…',
  'initializing tesseract': 'Starting OCR…',
  'loading language traineddata': 'Loading language data…',
  'initializing api': 'Preparing…',
  'recognizing text': 'Reading the card…'
};

function openReview(dataUrl) {
  let rawText = '';
  const sides = { front: dataUrl || null, back: null };
  let mergedFields = null;
  let ocrChain = Promise.resolve(); // keeps front → back OCR order deterministic
  const backdrop = openSheet(`
    ${sheetHead(dataUrl ? 'New card' : 'New card (manual)')}
    <div class="sheet-body">
      <div class="review-grid">
        ${dataUrl ? `
        <figure class="review-photo" style="margin:0">
          <img src="${esc(dataUrl)}" alt="Captured business card">
          <div id="scanOverlay" class="scanline" style="position:absolute;top:8%;left:6%;right:6%"></div>
          <div class="ocr-box">
            <div class="ocr-status" id="ocrStatus">${SPINNER_DARK} <span>Preparing OCR…</span></div>
            <div class="progress"><div class="progress-bar" id="ocrBar"></div></div>
            <p class="form-hint" style="margin:8px 0 0">First scan downloads the OCR engine (~5&nbsp;MB, English + Bengali), then it works offline.</p>
            <div id="backSideBox" style="margin-top:12px"></div>
          </div>
        </figure>` : `
        <div class="notice notice-info">${SVG.info}<span>No photo — you can add the details by hand, or paste the card text below and let CardVault parse it.</span></div>`}
        <form id="cardForm" novalidate>
          ${cardFormHtml({})}
          <details class="rawtext">
            <summary>${SVG.keyboard} Paste card text instead of OCR</summary>
            <textarea class="textarea" id="pasteBox" style="margin-top:8px" placeholder="Paste or type everything written on the card…"></textarea>
            <button type="button" class="btn btn-outline btn-sm" id="pasteParse" style="margin-top:8px">${SVG.check} Auto-fill from this text</button>
          </details>
        </form>
      </div>
    </div>`, { wide: true, backdropClose: false, guard: reviewGuard });

  const form = backdrop.querySelector('#cardForm');
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary';
  saveBtn.innerHTML = `${SVG.check} Save card`;
  backdrop.querySelector('.sheet-head').insertBefore(saveBtn, backdrop.querySelector('[data-action="close-modal"]'));

  const fillForm = (fields) => {
    Object.entries(fields).forEach(([k, v]) => {
      const input = form.querySelector(`[name="${k}"]`);
      if (input && !input.value && v) input.value = v; // don't clobber user edits
    });
  };

  /* ---- back side (logo / extra details) ---- */
  function renderBackSide() {
    const box = backdrop.querySelector('#backSideBox');
    if (!box || !sides.front) return;
    if (!sides.back) {
      box.innerHTML = `
        <button type="button" class="btn btn-outline btn-sm" id="addBackBtn" style="width:100%">
          ${SVG.image} Add back side <span style="font-weight:400">(logo / more details)</span>
        </button>`;
      box.querySelector('#addBackBtn').onclick = () => openCapture(attachBackSide);
    } else {
      box.innerHTML = `
        <div style="display:flex;gap:10px;align-items:center">
          <img src="${esc(sides.back)}" alt="Back of card" style="width:88px;height:58px;object-fit:cover;border-radius:8px;border:1px solid rgba(0,0,0,.18)">
          <div style="flex:1;font-size:.85rem;color:#5b616e">Back side captured — extra details will be merged.</div>
          <button type="button" class="btn btn-outline btn-sm" id="retakeBackBtn">Retake</button>
          <button type="button" class="btn btn-outline btn-sm" id="removeBackBtn" aria-label="Remove back side">✕</button>
        </div>`;
      box.querySelector('#retakeBackBtn').onclick = () => openCapture(attachBackSide);
      box.querySelector('#removeBackBtn').onclick = () => {
        sides.back = null;
        renderBackSide();
        toast('Back side removed');
      };
    }
  }

  function attachBackSide(backUrl) {
    sides.back = backUrl;
    renderBackSide();
    const status = backdrop.querySelector('#ocrStatus');
    const bar = backdrop.querySelector('#ocrBar');
    const show = (html) => { if (status) { status.classList.remove('ocr-done'); status.innerHTML = html; } };
    show(`${SPINNER_DARK} <span>Scanning back side…</span>`);
    if (bar) bar.style.width = '4%';
    ocrChain = ocrChain.then(async () => {
      const r = await recognizeCard(backUrl, (m) => {
        const msg = OCR_STATUS_MSG[m.status] || m.status;
        show(`${SPINNER_DARK} <span>Back side: ${esc(msg)}</span>`);
        if (typeof m.progress === 'number' && bar) bar.style.width = Math.round(m.progress * 100) + '%';
      }, { langs: OCR_LANGS });
      rawText = rawText ? rawText + '\n\n— back side —\n\n' + r.text : r.text;
      mergedFields = mergedFields ? mergeCardParses(mergedFields, r.fields) : r.fields;
      fillForm(mergedFields);
      if (bar) bar.style.width = '100%';
      if (status) {
        status.classList.add('ocr-done');
        status.innerHTML = `${SVG.check} <span>Back side scanned — extra details merged</span>`;
      }
    }).catch((err) => {
      console.warn(err);
      if (status) status.innerHTML = `${SVG.alert} <span>${esc(err.message || 'Back-side OCR failed')}</span>`;
    });
  }

  renderBackSide();

  backdrop.querySelector('#pasteParse')?.addEventListener('click', () => {
    const text = backdrop.querySelector('#pasteBox').value;
    if (!text.trim()) return toast('Paste some text first', 'error');
    fillForm(parseCardText(text));
    toast('Fields filled — please verify ✓');
  });

  // Run OCR (dual-pass: sparse + block, merged — see js/ocr.js)
  if (dataUrl) {
    ocrChain = ocrChain.then(() => recognizeCard(dataUrl, (m) => {
      const status = backdrop.querySelector('#ocrStatus');
      const bar = backdrop.querySelector('#ocrBar');
      if (!status || !bar) return;
      const msg = OCR_STATUS_MSG[m.status] || m.status;
      status.innerHTML = `${SPINNER_DARK} <span>${esc(msg)}</span>`;
      if (typeof m.progress === 'number') bar.style.width = Math.round(m.progress * 100) + '%';
    }, { langs: OCR_LANGS })).then(({ text, fields }) => {
      rawText = text;
      mergedFields = fields;
      fillForm(fields);
      const status = backdrop.querySelector('#ocrStatus');
      const bar = backdrop.querySelector('#ocrBar');
      const scan = backdrop.querySelector('#scanOverlay');
      if (scan) scan.remove();
      if (bar) bar.style.width = '100%';
      if (status) {
        status.classList.add('ocr-done');
        status.innerHTML = `${SVG.check} <span>Details extracted — please verify &amp; edit if needed</span>`;
      }
    }).catch((err) => {
      console.warn(err);
      const status = backdrop.querySelector('#ocrStatus');
      const scan = backdrop.querySelector('#scanOverlay');
      if (scan) scan.remove();
      if (status) {
        status.innerHTML = `${SVG.alert} <span>${esc(err.message || 'OCR failed')}</span>`;
      }
    });
  }

  saveBtn.onclick = async () => {
    const fields = readCardForm(form);
    if (!fields.name && !fields.company) {
      form.querySelector('[name="name"]').classList.add('field-error');
      form.querySelector('[name="company"]').classList.add('field-error');
      return toast('Add at least a name or a company', 'error');
    }
    saveBtn.disabled = true;
    saveBtn.innerHTML = SPINNER + 'Saving…';
    try {
      let imageUrl = dataUrl;
      if (dataUrl && sides.back) {
        try { imageUrl = await composeCardImage(dataUrl, sides.back); }
        catch (e) { console.warn('Could not stitch sides, saving front only', e); }
      }
      const image = imageUrl
        ? (state.mode === 'local' ? imageUrl : await dataUrlToBlob(imageUrl))
        : null;
      const card = await store.add(fields, image, rawText);
      if (imageUrl) card._imgUrl = imageUrl; // show the photo immediately
      state.cards.unshift(card);
      state.offline = false;
      renderGrid();
      reviewForceClose = true;
      requestCloseTop();
      reviewForceClose = false;
      toast('Card saved ✓');
      if (state.mode === 'cloud' && imageUrl && !card.card_image_path) {
        toast('Photo could not be uploaded — details saved', 'info', 4000);
      }
    } catch (err) {
      console.error(err);
      toast(err.message || 'Could not save the card', 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = `${SVG.check} Save card`;
    }
  };

  form.onsubmit = (e) => { e.preventDefault(); saveBtn.onclick(); };
}

function reviewGuard() {
  if (reviewForceClose) return true;
  const form = modalStack[modalStack.length - 1]?.el?.querySelector('#cardForm');
  if (!form || !formIsDirty(form)) return true;
  confirmDialog('Discard this card? The photo and details will be lost.', 'Discard')
    .then((ok) => {
      if (ok) {
        reviewForceClose = true;
        requestCloseTop();
        reviewForceClose = false;
      }
    });
  return false;
}

/* ============================================================ detail     -- */

function openDetail(id) {
  const c = state.cards.find((x) => x.id === id);
  if (!c) return;

  const phones = String(c.phone || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const emails = String(c.email || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const phone1 = phones[0] || '';
  const web = c.website ? (/^https?:\/\//i.test(c.website) ? c.website : 'https://' + c.website) : '';
  const maps = c.address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.address) : '';
  const imgUrl = state.mode === 'local' ? (c.image_data || null) : (c._imgUrl || null);

  const row = (icon, label, value, href) => `
    <div class="detail-row">
      ${SVG[icon]}
      <div style="min-width:0">
        <div class="detail-row-label">${esc(label)}</div>
        <div class="detail-row-value">${href
          ? `<a href="${esc(href)}">${esc(value)}</a>`
          : esc(value)}</div>
      </div>
    </div>`;

  const rows = [
    ...phones.map((p, i) => row('phone', phones.length > 1 ? `Phone ${i + 1}` : 'Phone', p, 'tel:' + p)),
    ...emails.map((e, i) => row('mail', emails.length > 1 ? `Email ${i + 1}` : 'Email', e, 'mailto:' + e)),
    c.website && row('globe', 'Website', c.website, web),
    c.address && row('map', 'Address', c.address, maps),
    c.notes && row('file', 'Notes', c.notes, null)
  ].filter(Boolean).join('');

  openSheet(`
    ${sheetHead('Contact')}
    <div class="sheet-body nopad">
      <div class="detail-hero" ${imgUrl ? `data-action="zoom-image" data-src="${esc(imgUrl)}" title="Tap to enlarge"` : ''}>
        ${imgUrl ? `<img data-img="${esc(c.id)}" src="${esc(imgUrl)}" alt="Business card photo">` : avatarHtml(c.name || c.company || '?')}
      </div>
      <div class="detail-head">
        <h2 class="detail-name">${esc(c.name || c.company || 'Untitled')}</h2>
        ${c.designation ? `<p class="detail-role">${esc(c.designation)}</p>` : ''}
        ${c.company && c.name ? `<p class="detail-org">${esc(c.company)}</p>` : ''}
      </div>
      <div class="detail-actions">
        ${phone1 ? `<a class="act act-primary" href="tel:${esc(phone1)}">${SVG.phone} Call</a>` : ''}
        ${emails[0] ? `<a class="act" href="mailto:${esc(emails[0])}">${SVG.mail} Email</a>` : ''}
        ${web ? `<a class="act" href="${esc(web)}" target="_blank" rel="noopener">${SVG.globe} Website</a>` : ''}
        ${maps ? `<a class="act" href="${esc(maps)}" target="_blank" rel="noopener">${SVG.map} Map</a>` : ''}
        <button class="act" data-action="vcard" data-id="${esc(c.id)}">${SVG.download} Save contact</button>
        <button class="act" data-action="share" data-id="${esc(c.id)}">${SVG.share} Share</button>
        <button class="act" data-action="edit" data-id="${esc(c.id)}">${SVG.edit} Edit</button>
        <button class="act act-danger" data-action="delete" data-id="${esc(c.id)}">${SVG.trash} Delete</button>
      </div>
      ${rows ? `<div class="detail-fields">${rows}</div>` : ''}
      ${c.raw_text ? `<details class="rawtext" style="margin:0 18px 14px"><summary>Scanned text</summary><pre>${esc(c.raw_text)}</pre></details>` : ''}
      <p class="detail-meta">Added ${esc(formatDate(c.created_at))} · ${state.mode === 'local' ? 'demo mode' : 'cloud sync'}</p>
    </div>`);

  // Resolve image asynchronously if not cached yet (cloud)
  if (state.mode === 'cloud' && c.card_image_path && !c._imgUrl) {
    store.imageUrl(c).then((url) => {
      c._imgUrl = url;
      const img = document.querySelector(`.modal-backdrop [data-img="${c.id}"]`);
      const hero = document.querySelector('.modal-backdrop .detail-hero');
      if (url && img) {
        img.src = url;
        if (hero) {
          hero.setAttribute('data-action', 'zoom-image');
          hero.setAttribute('data-src', url);
        }
      } else if (img) {
        const label = c.name || c.company || '?';
        img.outerHTML = avatarHtml(label);
      }
    });
  }
}

function openZoom(src) {
  const el = document.createElement('div');
  el.className = 'zoom-overlay';
  el.innerHTML = `<img src="${esc(src)}" alt="Business card photo">`;
  el.onclick = () => requestCloseTop();
  document.getElementById('modal-root').appendChild(el);
  pushOverlay(el);
}

/* ============================================================ edit       -- */

function openEdit(id) {
  const c = state.cards.find((x) => x.id === id);
  if (!c) return;
  const backdrop = openSheet(`
    ${sheetHead('Edit card')}
    <div class="sheet-body">
      <form id="editForm" novalidate>
        ${cardFormHtml(c)}
        <div class="menu-end">
          <button type="button" class="btn btn-ghost" data-action="close-modal" style="flex:1">Cancel</button>
          <button type="submit" class="btn btn-primary" id="editSave" style="flex:1">${SVG.check} Save changes</button>
        </div>
      </form>
    </div>`, { wide: true });

  backdrop.querySelector('#editForm').onsubmit = async (e) => {
    e.preventDefault();
    const fields = readCardForm(e.target);
    if (!fields.name && !fields.company) return toast('Add at least a name or a company', 'error');
    const btn = backdrop.querySelector('#editSave');
    btn.disabled = true; btn.innerHTML = SPINNER + 'Saving…';
    try {
      const updated = await store.update(id, fields);
      const i = state.cards.findIndex((x) => x.id === id);
      if (i > -1) state.cards[i] = { ...state.cards[i], ...updated, _imgUrl: state.cards[i]._imgUrl };
      renderGrid();
      closeAllOverlays();
      toast('Card updated ✓');
    } catch (err) {
      toast(err.message || 'Could not update', 'error');
      btn.disabled = false; btn.innerHTML = `${SVG.check} Save changes`;
    }
  };
}

/* ============================================================ delete     -- */

async function deleteCardFlow(id) {
  const c = state.cards.find((x) => x.id === id);
  if (!c) return;
  const ok = await confirmDialog(`Delete “${c.name || c.company || 'this card'}”? This cannot be undone.`, 'Delete');
  if (!ok) return;
  try {
    await store.remove(c);
    state.cards = state.cards.filter((x) => x.id !== id);
    renderGrid();
    closeAllOverlays();
    toast('Card deleted');
  } catch (err) {
    toast(err.message || 'Could not delete', 'error');
  }
}

/* ============================================================ vcard etc -- */

async function photoBase64For(card) {
  try {
    const url = state.mode === 'local' ? card.image_data : (card._imgUrl || await store.imageUrl(card));
    if (!url) return null;
    const blob = await (await fetch(url)).blob();
    const dataUrl = await fileToDataUrl(blob);
    return await smallPhotoBase64(dataUrl);
  } catch {
    return null;
  }
}

async function saveVCardFile(id) {
  const c = state.cards.find((x) => x.id === id);
  if (!c) return;
  toast('Preparing contact…', 'info', 1500);
  const photo = await photoBase64For(c);
  const vcf = buildVCard(c, photo);
  downloadText(vcf, vcardFileName(c), 'text/vcard');
  toast('Contact file downloaded — open it to add to your phone\'s contacts ✓', 'ok', 4200);
}

async function shareCard(id) {
  const c = state.cards.find((x) => x.id === id);
  if (!c) return;
  const photo = await photoBase64For(c);
  const vcf = buildVCard(c, photo);
  const file = new File([vcf], vcardFileName(c), { type: 'text/vcard' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: c.name || c.company || 'Contact' });
      return;
    } catch { /* user cancelled or failed — fall through to copy */ }
  }
  const ok = await copyText(vcf);
  toast(ok ? 'Contact copied to clipboard' : 'Could not share on this device', ok ? 'ok' : 'error');
}

function exportAllVcf() {
  if (!state.cards.length) return toast('No cards to export yet', 'error');
  const vcf = buildVCardCollection(state.cards);
  const d = new Date().toISOString().slice(0, 10);
  downloadText(vcf, `cardvault-contacts-${d}.vcf`, 'text/vcard');
  toast(`Exported ${state.cards.length} contact${state.cards.length === 1 ? '' : 's'} ✓`);
}

function exportJson() {
  if (!state.cards.length) return toast('Nothing to export yet', 'error');
  const payload = {
    app: 'cardvault',
    version: APP_VERSION,
    exported_at: new Date().toISOString(),
    cards: state.cards.map(({ _imgUrl, image_data, ...c }) => c)
  };
  const d = new Date().toISOString().slice(0, 10);
  downloadText(JSON.stringify(payload, null, 2), `cardvault-backup-${d}.json`, 'application/json');
  toast('Backup downloaded ✓');
}

/* ============================================================ settings   -- */

function openSettings() {
  const isCloud = state.mode === 'cloud';
  openSheet(`
    ${sheetHead('Settings')}
    <div class="sheet-body">
      <div class="notice notice-info" style="margin:0 0 8px">
        ${isCloud ? SVG.user : SVG.info}
        <span>${isCloud
          ? `Signed in as <b>${esc(state.user?.email || '')}</b> — cards sync privately to your cloud.`
          : `<b>Demo mode</b> — cards are stored only in this browser. Set up Supabase (free) for accounts &amp; cloud sync.`}</span>
      </div>
      <div class="menu-list">
        ${'contacts' in navigator ? `<button class="menu-item" data-action="import-contacts">${SVG.user}<span>Import from device contacts<span class="menu-item-sub">Pick people from your phone's address book</span></span></button>` : ''}
        <button class="menu-item" data-action="export-vcf">${SVG.download}<span>Export all contacts (.vcf)<span class="menu-item-sub">Import into Google/Apple contacts</span></span></button>
        <button class="menu-item" data-action="export-json">${SVG.file}<span>Export backup (JSON)<span class="menu-item-sub">Fields only — keep it somewhere safe</span></span></button>
        ${isCloud ? `
          <button class="menu-item" data-action="change-password">${SVG.lock}<span>Change password</span></button>
          <button class="menu-item" id="importDemoBtn" hidden>${SVG.upload}<span>Import demo cards<span class="menu-item-sub" id="importDemoSub"></span></span></button>` : ''}
        ${deferredInstall ? `<button class="menu-item" id="installBtn">${SVG.download}<span>Install app<span class="menu-item-sub">Add CardVault to your home screen</span></span></button>` : ''}
        <button class="menu-item menu-item-danger" data-action="${isCloud ? 'signout' : 'exit-demo'}">${SVG.logout}<span>${isCloud ? 'Sign out' : 'Exit demo mode'}</span></button>
      </div>
      <p class="detail-meta" style="padding:14px 4px 0;text-align:center">
        ${APP_NAME} v${APP_VERSION} · open source (MIT) · OCR runs on your device
      </p>
    </div>`);

  const importBtn = document.getElementById('importDemoBtn');
  if (importBtn) {
    db.LocalStore.getAll().then(async (demo) => {
      const imported = await db.LocalStore.meta('imported');
      if (demo.length && !imported) {
        importBtn.hidden = false;
        document.getElementById('importDemoSub').textContent = `${demo.length} card(s) found on this device`;
        importBtn.onclick = () => importDemoCards();
      }
    });
  }

  const installBtn = document.getElementById('installBtn');
  if (installBtn) {
    installBtn.onclick = async () => {
      deferredInstall.prompt();
      const { outcome } = await deferredInstall.userChoice;
      if (outcome === 'accepted') { deferredInstall = null; closeTopEntry(); }
    };
  }
}

function openPasswordModal() {
  openSheet(`
    ${sheetHead('Set a new password')}
    <div class="sheet-body">
      <div class="field">
        <label for="newPw">New password</label>
        <input class="input" id="newPw" type="password" autocomplete="new-password" minlength="6" placeholder="At least 6 characters">
      </div>
      <button class="btn btn-primary btn-block" id="newPwSave">${SVG.lock} Update password</button>
    </div>`);
  document.getElementById('newPwSave').onclick = async () => {
    const pw = document.getElementById('newPw').value;
    if (pw.length < 6) return toast('Password must be at least 6 characters', 'error');
    const btn = document.getElementById('newPwSave');
    btn.disabled = true; btn.innerHTML = SPINNER + 'Updating…';
    try {
      await db.updatePassword(pw);
      closeTopEntry();
      toast('Password updated ✓');
    } catch (err) {
      toast(friendlyAuthError(err.message), 'error');
      btn.disabled = false; btn.innerHTML = `${SVG.lock} Update password`;
    }
  };
}

/* ============================================================ social + contacts -- */

async function doOAuthSignIn(provider) {
  if (!provider) return;
  const btn = document.querySelector(`[data-action="oauth"][data-provider="${provider}"]`);
  const label = provider === 'apple' ? 'Continue with Apple' : 'Continue with Google';
  if (btn) { btn.disabled = true; btn.innerHTML = SPINNER + 'Connecting…'; }
  try {
    await db.signInWithProvider(provider); // navigates away on success
  } catch (err) {
    toast(friendlyAuthError(err.message), 'error', 4200);
    if (btn) { btn.disabled = false; btn.innerHTML = (provider === 'apple' ? SVG.apple : SVG.google) + `<span>${label}</span>`; }
  }
}

/** Import people from the device's contact list (Contact Picker API). */
async function importFromContacts() {
  if (!('contacts' in navigator)) {
    return toast("This browser can't pick device contacts", 'error');
  }
  let picked;
  try {
    picked = await navigator.contacts.select(['name', 'email', 'tel', 'address'], { multiple: true });
  } catch (err) {
    if (err?.name === 'AbortError') return; // user cancelled the picker
    return toast('Contact access was blocked on this device', 'error');
  }
  if (!picked?.length) return;
  let n = 0;
  for (const c of picked) {
    const a = Array.isArray(c.address) && c.address[0]
      ? [c.address[0].street, c.address[0].city, c.address[0].region, c.address[0].country].filter(Boolean).join(', ')
      : '';
    const fields = {
      name: (c.name || [])[0] || '',
      designation: '',
      company: '',
      phone: (c.tel || []).filter(Boolean).join(', '),
      email: (c.email || [])[0] || '',
      website: '',
      address: a,
      notes: 'Imported from device contacts'
    };
    if (!fields.name && !fields.phone && !fields.email) continue;
    try { await store.add(fields, null, ''); n++; } catch { /* skip broken entry */ }
  }
  await loadCards();
  toast(`Imported ${n} contact${n === 1 ? '' : 's'} ✓`);
}

/* ============================================================ demo flows -- */

async function addSampleCards() {
  try {
    for (const s of SAMPLE_CARDS) await db.addCardLocal(s, null, '');
    await loadCards();
    toast('3 sample cards added — try searching “manager” or “foods” ✓');
  } catch (err) {
    toast('Could not add samples', 'error');
  }
}

async function maybeOfferDemoImport() {
  try {
    const demo = await db.LocalStore.getAll();
    if (!demo.length) return;
    if (await db.LocalStore.meta('imported')) return;
    const ok = await confirmDialog(
      `Import ${demo.length} demo card(s) from this device into your cloud account?`,
      'Import', { danger: false }
    );
    if (ok) await importDemoCards();
    else await db.LocalStore.setMeta('imported', true); // don't nag again
  } catch { /* ignore */ }
}

async function importDemoCards() {
  const demo = await db.LocalStore.getAll();
  if (!demo.length) return toast('No demo cards found on this device', 'info');
  toast(`Importing ${demo.length} card(s)…`, 'info', 2000);
  let n = 0;
  for (const c of demo) {
    try {
      let blob = null;
      if (c.image_data) blob = await dataUrlToBlob(c.image_data);
      await db.addCard(
        {
          name: c.name, designation: c.designation, company: c.company, phone: c.phone,
          email: c.email, website: c.website, address: c.address, notes: c.notes
        },
        blob, c.raw_text
      );
      n++;
    } catch { /* skip broken card */ }
  }
  await db.LocalStore.setMeta('imported', true);
  await loadCards();
  toast(`Imported ${n} card(s) to your cloud ✓`);
}

/* ============================================================ events     -- */

function onGlobalClick(e) {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const action = t.dataset.action;
  const id = t.dataset.id;

  switch (action) {
    case 'open-detail': openDetail(id); break;
    case 'capture': openCapture(); break;
    case 'clear-search': {
      const si = $('#searchInput');
      if (si) { si.value = ''; si.focus(); }
      state.query = '';
      const cb = $('.search-clear');
      if (cb) cb.hidden = true;
      renderGrid();
      break;
    }
    case 'settings': openSettings(); break;
    case 'close-modal': requestCloseTop(); break;
    case 'zoom-image': if (t.dataset.src) openZoom(t.dataset.src); break;
    case 'vcard': saveVCardFile(id); break;
    case 'share': shareCard(id); break;
    case 'edit': openEdit(id); break;
    case 'delete': deleteCardFlow(id); break;
    case 'export-vcf': exportAllVcf(); break;
    case 'export-json': exportJson(); break;
    case 'change-password': openPasswordModal(); break;
    case 'signout':
      db.signOutCloud().catch(() => {});
      closeAllOverlays();
      break;
    case 'exit-demo':
      closeAllOverlays();
      state.mode = null; state.user = null; state.cards = [];
      if (IS_CONFIGURED && db.hasCloudSdk()) renderAuth();
      else renderSetup();
      break;
    case 'demo-mode': enterDemo(); break;
    case 'oauth': doOAuthSignIn(t.dataset.provider); break;
    case 'import-contacts': importFromContacts(); break;
    case 'add-samples': addSampleCards(); break;
  }
}

// Enter/Space activates tiles (they have role="button")
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target?.matches?.('.tile')) {
    e.preventDefault();
    openDetail(e.target.dataset.id);
  }
});

init();
