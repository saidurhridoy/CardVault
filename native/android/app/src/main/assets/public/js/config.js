/* ============================================================================
   CardVault configuration — THE ONLY FILE YOU NEED TO EDIT
   ----------------------------------------------------------------------------
   1. Create a free project at https://supabase.com (see docs/SETUP.md)
   2. Run supabase/schema.sql in the Supabase SQL editor
   3. Paste your project URL + anon (public) key below

   The anon key is meant to be public — database security is enforced by
   Row Level Security, so each user can only ever read/write their own cards.
   NEVER put the service_role key here.
   ========================================================================== */

export const SUPABASE_URL = 'https://parxbunzpvtmynzelvoc.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_IdAbFCTer57ZR6Gfeyibxg_SOU62eoj';

export const APP_NAME = 'CardVault';
export const APP_VERSION = '1.1.0';

/* Social sign-in buttons shown on the login screen.
   Each works once the matching provider is enabled in your Supabase
   dashboard (Authentication → Providers) — see docs/SETUP.md.
   Remove a name from this list to hide its button.
   Apple is hidden for now — re-add it once you have an Apple Developer
   account and have enabled the provider in Supabase:
   export const OAUTH_PROVIDERS = ['google', 'apple'];                */
export const OAUTH_PROVIDERS = ['google'];

/* True once you've filled in real credentials.
   Anon keys are JWTs ("eyJ…") — or the newer "sb_publishable_…" format. */
export const IS_CONFIGURED =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) &&
  /^(ey[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+){0,2}|sb_publishable_[A-Za-z0-9_-]+)$/.test(SUPABASE_ANON_KEY);
