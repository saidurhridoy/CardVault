/* ============================================================================
   Data layer — two interchangeable backends behind one small interface:

   • Cloud  : Supabase (free tier) — auth + Postgres + private storage.
              Row Level Security guarantees users only see their own cards.
   • Local  : IndexedDB "demo mode" — zero setup, data stays on the device.

   The rest of the app only talks to the functions exported here.
   ========================================================================== */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { uid } from './util.js';

let sb = null;                 // Supabase client
let currentMode = null;        // 'cloud' | 'local'
let currentUser = null;        // { id, email }

export function mode() { return currentMode; }
export function user() { return currentUser; }
export function hasCloudSdk() { return typeof window !== 'undefined' && !!window.supabase?.createClient; }
export function client() { return sb; }

export function initCloud() {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return sb;
}

export function enterLocalMode() {
  currentMode = 'local';
  currentUser = { id: 'local-demo', email: 'demo@this.device' };
}

/* ---------------------------------------------------------------------------
   Cloud: auth
   ------------------------------------------------------------------------- */

export async function getSession() {
  const { data } = await sb.auth.getSession();
  if (data?.session?.user) {
    currentUser = { id: data.session.user.id, email: data.session.user.email };
    currentMode = 'cloud';
  }
  return data?.session ?? null;
}

export function onAuthChange(cb) {
  sb.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      currentUser = { id: session.user.id, email: session.user.email };
      currentMode = 'cloud';
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentMode = null;
    }
    cb(event, session);
  });
}

export async function signUp(email, password) {
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: location.origin }
  });
  if (error) throw error;
  if (data.session?.user) {
    currentUser = { id: data.session.user.id, email: data.session.user.email };
    currentMode = 'cloud';
  }
  return data; // data.session === null when email confirmation is enabled
}

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentUser = { id: data.user?.id, email: data.user?.email };
  currentMode = 'cloud';
  return data;
}

/**
 * Social sign-in (Google / Apple). Checks that the provider is actually
 * enabled first — otherwise the browser would land on a raw JSON error page.
 */
export async function signInWithProvider(provider) {
  const redirectTo = new URL('./', location.href).href;
  const { data, error } = await sb.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true }
  });
  if (error) throw error;
  try {
    const res = await fetch(data.url, { redirect: 'manual' });
    if (res.type !== 'opaqueredirect') {
      let msg = '';
      try { msg = (await res.json()).msg || ''; } catch { /* not JSON */ }
      throw new Error(`Sign-in with ${provider} isn't enabled yet${msg ? ` (${msg})` : ''}`);
    }
  } catch (e) {
    if (/isn't enabled yet/i.test(e.message)) throw e;
    // network/CORS quirk — fall through and redirect anyway
  }
  window.location.assign(data.url);
}

export async function signOutCloud() {
  await sb.auth.signOut();
}

export async function resetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: new URL('?reset=1', location.href).href
  });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/* ---------------------------------------------------------------------------
   Cloud: cards CRUD (RLS scopes everything to the signed-in user)
   ------------------------------------------------------------------------- */

export async function listCards() {
  currentMode = 'cloud';
  const { data, error } = await sb.from('cards').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function addCard(fields, imageBlob, rawText = '') {
  currentMode = 'cloud';
  const id = uid();
  const card = {
    id,
    user_id: currentUser.id,
    name: fields.name || null,
    designation: fields.designation || null,
    company: fields.company || null,
    phone: fields.phone || null,
    email: fields.email || null,
    website: fields.website || null,
    address: fields.address || null,
    notes: fields.notes || null,
    raw_text: rawText || null,
    card_image_path: null
  };
  if (imageBlob) {
    const path = `${currentUser.id}/${id}.jpg`;
    const { error: upErr } = await sb.storage
      .from('card-images')
      .upload(path, imageBlob, { contentType: 'image/jpeg', upsert: true });
    if (!upErr) card.card_image_path = path;
    else console.warn('Image upload failed, saving card without photo:', upErr.message);
  }
  const { data, error } = await sb.from('cards').insert(card).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateCard(id, patch) {
  const { data, error } = await sb.from('cards').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteCard(card) {
  if (card.card_image_path) {
    try { await sb.storage.from('card-images').remove([card.card_image_path]); } catch { /* best effort */ }
  }
  const { error } = await sb.from('cards').delete().eq('id', card.id);
  if (error) throw new Error(error.message);
}

const signedUrlCache = new Map();

export async function getImageUrl(card) {
  if (!card.card_image_path) return null;
  if (signedUrlCache.has(card.card_image_path)) return signedUrlCache.get(card.card_image_path);
  const { data, error } = await sb.storage
    .from('card-images')
    .createSignedUrl(card.card_image_path, 60 * 60 * 24 * 7);
  if (error || !data?.signedUrl) return null;
  signedUrlCache.set(card.card_image_path, data.signedUrl);
  return data.signedUrl;
}

/* ---------------------------------------------------------------------------
   Team vaults (cloud only — requires supabase/teams.sql to have been run)
   ------------------------------------------------------------------------- */

function teamsNotReady(err) {
  const msg = String(err?.message || err?.details || err || '');
  if (/relation .* does not exist|column .* does not exist|code.*42P0?1/i.test(msg)) {
    return new Error('Team vaults are not set up yet — run supabase/teams.sql in your Supabase SQL editor, then reload.');
  }
  return err;
}

export async function listMyOrgs() {
  const uid = currentUser?.id;
  if (!uid) return [];
  const { data, error } = await sb
    .from('org_members')
    .select('role, joined_at, email, name, organizations ( id, name, owner_id, created_at )')
    .eq('user_id', uid);
  if (error) throw teamsNotReady(error);
  return (data || [])
    .filter((r) => r.organizations)
    .map((r) => ({ ...r.organizations, role: r.role, member_name: r.name, member_email: r.email }));
}

export async function createOrg(name) {
  const uid = currentUser?.id;
  const clean = String(name || '').trim().slice(0, 80);
  if (!uid) throw new Error('Sign in first.');
  if (!clean) throw new Error('Give the team a name.');
  const { data: org, error } = await sb
    .from('organizations')
    .insert({ name: clean, owner_id: uid })
    .select()
    .single();
  if (error) throw teamsNotReady(error);
  const { error: mErr } = await sb.from('org_members').insert({
    org_id: org.id, user_id: uid, role: 'owner',
    email: currentUser?.email || '', name: (currentUser?.user_metadata?.full_name || currentUser?.email || '').split('@')[0]
  });
  if (mErr) {
    // don't leave an orphan org behind
    await sb.from('organizations').delete().eq('id', org.id).catch(() => {});
    throw teamsNotReady(mErr);
  }
  return org;
}

export async function listMembers(orgId) {
  const { data, error } = await sb
    .from('org_members')
    .select('user_id, role, email, name, joined_at')
    .eq('org_id', orgId)
    .order('joined_at');
  if (error) throw teamsNotReady(error);
  return data || [];
}

export async function inviteMember(orgId, email) {
  const clean = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new Error('Enter a valid email address.');
  const { error } = await sb.from('org_invites')
    .insert({ org_id: orgId, email: clean, invited_by: currentUser?.id });
  if (error) {
    if (/duplicate key/i.test(error.message)) throw new Error('That person is already invited.');
    throw teamsNotReady(error);
  }
  return true;
}

export async function removeMember(orgId, userId) {
  const { error } = await sb.from('org_members')
    .delete().eq('org_id', orgId).eq('user_id', userId);
  if (error) throw teamsNotReady(error);
}

export async function leaveOrg(orgId) {
  return removeMember(orgId, currentUser?.id);
}

export async function deleteOrg(orgId) {
  const { error } = await sb.from('organizations').delete().eq('id', orgId);
  if (error) throw teamsNotReady(error);
}

export async function myPendingInvites() {
  const email = String(currentUser?.email || '').toLowerCase();
  if (!email) return [];
  const { data, error } = await sb
    .from('org_invites')
    .select('id, email, organizations ( id, name, owner_id )')
    .eq('email', email);
  if (error) throw teamsNotReady(error);
  return (data || []).filter((r) => r.organizations)
    .map((r) => ({ id: r.id, org: r.organizations }));
}

export async function acceptInvite(inviteId) {
  const email = String(currentUser?.email || '').toLowerCase();
  const { data: inv, error: qErr } = await sb.from('org_invites')
    .select('id, org_id').eq('id', inviteId).eq('email', email).single();
  if (qErr || !inv) throw new Error('That invitation is no longer available.');
  const { error } = await sb.from('org_members').insert({
    org_id: inv.org_id, user_id: currentUser.id, role: 'member', email,
    name: (currentUser?.user_metadata?.full_name || currentUser?.email || '').split('@')[0]
  });
  if (error) throw teamsNotReady(error);
  await sb.from('org_invites').delete().eq('id', inviteId).catch(() => {});
}

export async function declineInvite(inviteId) {
  const { error } = await sb.from('org_invites')
    .delete().eq('id', inviteId).eq('email', String(currentUser?.email || '').toLowerCase());
  if (error) throw teamsNotReady(error);
}

export async function shareCardToOrg(cardId, orgId) {
  const { error } = await sb.from('cards').update({ org_id: orgId }).eq('id', cardId);
  if (error) throw teamsNotReady(error);
}

export async function unshareCard(cardId) {
  const { error } = await sb.from('cards').update({ org_id: null }).eq('id', cardId);
  if (error) throw teamsNotReady(error);
}

export async function listOrgCards(orgId) {
  const { data, error } = await sb
    .from('cards')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw teamsNotReady(error);
  return data || [];
}

/* ---------------------------------------------------------------------------
   Local: IndexedDB demo store (graceful fallback to memory in sandboxed iframes)
   ------------------------------------------------------------------------- */

const DB_NAME = 'cardvault';
const STORE_CARDS = 'cards';
const STORE_META = 'meta';
let idbPromise = null;
const memoryCards = new Map();
const memoryMeta = new Map();

function openIdb() {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    try {
      if (!globalThis.indexedDB) throw new Error('no indexedDB');
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_CARDS)) db.createObjectStore(STORE_CARDS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('indexedDB unavailable'));
      setTimeout(() => reject(new Error('indexedDB timeout')), 3000);
    } catch (e) {
      reject(e);
    }
  }).catch((e) => {
    console.warn('Falling back to in-memory demo store:', e.message);
    return null;
  });
  return idbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
  });
}

export const LocalStore = {
  async getAll() {
    const db = await openIdb();
    if (!db) return [...memoryCards.values()];
    return tx(db, STORE_CARDS, 'readonly', (s) => s.getAll());
  },
  async put(card) {
    const db = await openIdb();
    if (!db) { memoryCards.set(card.id, card); return card; }
    return tx(db, STORE_CARDS, 'readwrite', (s) => s.put(card));
  },
  async remove(id) {
    const db = await openIdb();
    if (!db) { memoryCards.delete(id); return; }
    return tx(db, STORE_CARDS, 'readwrite', (s) => s.delete(id));
  },
  async meta(key) {
    const db = await openIdb();
    if (!db) return memoryMeta.get(key) ?? null;
    return tx(db, STORE_META, 'readonly', (s) => s.get(key));
  },
  async setMeta(key, value) {
    const db = await openIdb();
    if (!db) { memoryMeta.set(key, value); return; }
    return tx(db, STORE_META, 'readwrite', (s) => s.put(value, key));
  },
  /** true when data actually persists (false inside sandboxed previews) */
  async isPersistent() { return !!(await openIdb()); }
};

/* ---------------------------------------------------------------------------
   Local: cards CRUD (same shape as the cloud functions)
   ------------------------------------------------------------------------- */

export async function listCardsLocal() {
  currentMode = 'local';
  const all = await LocalStore.getAll();
  return all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export async function addCardLocal(fields, imageBlob, rawText = '') {
  currentMode = 'local';
  const card = {
    id: uid(),
    name: fields.name || null,
    designation: fields.designation || null,
    company: fields.company || null,
    phone: fields.phone || null,
    email: fields.email || null,
    website: fields.website || null,
    address: fields.address || null,
    notes: fields.notes || null,
    raw_text: rawText || null,
    image_data: imageBlob || null,   // data URL string in local mode
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  await LocalStore.put(card);
  return card;
}

export async function updateCardLocal(id, patch) {
  const all = await LocalStore.getAll();
  const card = all.find((c) => c.id === id);
  if (!card) throw new Error('Card not found');
  Object.assign(card, patch, { updated_at: new Date().toISOString() });
  await LocalStore.put(card);
  return card;
}

export async function deleteCardLocal(card) {
  await LocalStore.remove(card.id);
}

export async function getImageUrlLocal(card) {
  return card?.image_data || null;
}
