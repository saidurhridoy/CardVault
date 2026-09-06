# Setup guide — connect your free Supabase project

CardVault uses [Supabase](https://supabase.com) (open-source Firebase alternative)
for **accounts**, the **card database**, and **image storage**. The free tier is
generous (500 MB database, 1 GB storage, 50,000 monthly active users) and no
credit card is required.

> ⏱️ Total time: about 5 minutes. You can also skip all of this and use
> **demo mode** in the app (data stays on the device).

---

## A. Create the Supabase project

1. Go to **https://supabase.com** → **Start your project** → sign in with GitHub.
2. Click **New project**.
3. Fill in:
   - **Name:** `cardvault` (anything you like)
   - **Database Password:** pick a strong one and save it somewhere (you won't need it in the app)
   - **Region:** choose the one closest to you (e.g. Singapore for Bangladesh/India)
4. Click **Create new project** and wait ~2 minutes for provisioning.

## B. Create the database + storage (paste one SQL file)

1. In your project dashboard open **SQL Editor** → **New query**.
2. Open [`supabase/schema.sql`](../supabase/schema.sql) from this repo, **copy everything**, paste it into the editor.
3. Click **Run**. You should see `Success. No rows returned`.

**Optional — team vaults (v1.5.0):** repeat the same steps with
[`supabase/teams.sql`](../supabase/teams.sql) to enable shared team vaults
(organizations, invitations, sharing). The script is idempotent — safe to
re-run. Without it, the Teams button simply says the feature isn't set up yet.

That single script creates:

| Object | Purpose |
|---|---|
| `public.cards` table | one row per scanned card |
| Row Level Security policies | users can only read/write **their own** cards |
| `card-images` storage bucket | **private** bucket for card photos |
| Storage policies | each user only sees files in their own folder |
| indexes + `updated_at` trigger | fast listings, tidy timestamps |

## C. Point the app at your project

1. In the dashboard go to **Project Settings → API** (⚙️ icon bottom-left).
2. Copy two values:
   - **Project URL** — looks like `https://abcdefgh12345.supabase.co`
   - **anon public** key — a long `eyJ…` token
3. Open **`js/config.js`** in the repo and paste them in:

```js
export const SUPABASE_URL = 'https://abcdefgh12345.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....';
```

That's it — you're configured. ✅

> **Is the anon key safe to commit?**
> Yes. It's a *public* key by design — like a username. All security is enforced
> by Row Level Security inside your database. Just never put the
> `service_role` key in the app (it isn't needed anywhere).

## C2. Social login — Google & Apple

CardVault shows **Continue with Google / Apple** buttons (see
`OAUTH_PROVIDERS` in `js/config.js`). Each becomes active once you enable the
matching provider in Supabase:

1. In the dashboard go to **Authentication → URL Configuration** and set
   - **Site URL:** your deployed URL (e.g. `https://cardvault-app.surge.sh`)
   - **Redirect URLs:** add your deployed URL **and** `http://localhost:3000`
2. **Google** (free):
   - Go to [console.cloud.google.com](https://console.cloud.google.com) → create a project →
     **APIs & Services → OAuth consent screen** (External, add yourself as test user) →
     **Credentials → Create OAuth client ID** (Web application)
   - Authorized redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
   - Copy the **Client ID** and **Client secret** → Supabase →
     **Authentication → Providers → Google** → enable + paste → Save
3. **Apple** (requires a paid Apple Developer account, $99/yr):
   - Create a **Services ID** with "Sign in with Apple" enabled, a **Key**, and note your
     **Team ID** → paste all three into Supabase → **Authentication → Providers → Apple**
   - No Apple account yet? Just remove `'apple'` from `OAUTH_PROVIDERS` — the button hides.

## D. Run it locally

```bash
npm start                # → http://localhost:3000
# or
python3 -m http.server 3000
```

You need a local server (opening `index.html` directly from disk won't load
ES modules). Sign up with an email + password and scan
[`samples/sample-card.png`](../samples/sample-card.png) to watch the OCR work.

> **Email confirmations:** new sign-ups receive a confirmation email by default
> (Authentication → Providers → Email). For quick local testing you can disable
> *"Confirm email"* — in production, leave it on.
> Also set **Authentication → URL Configuration → Site URL** to your deployed
> URL so confirmation / password-reset links land correctly.

## E. Deploy it (free)

See **[docs/PUBLISH.md](PUBLISH.md)** for GitHub Pages, Netlify, Vercel and
Cloudflare Pages — all have free tiers and zero build configuration.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| App shows the “connect Supabase” screen | `js/config.js` still has placeholders, or the SDK CDN was blocked — check the values and your connection |
| `Sign-in failed / Invalid API key` on login | Wrong URL or you pasted the `service_role` key instead of the anon key |
| Cards list is empty right after signup | Run `supabase/schema.sql` (section B) — the `cards` table is probably missing |
| Teams button says teams aren't set up | Run `supabase/teams.sql` in the SQL editor (see section B) |
| Card photos never load | Re-run the storage policies part of `schema.sql`; the bucket must be private with the four policies |
| Camera doesn't open | Browsers only allow camera on `https://` (or `localhost`) — deploy with HTTPS or test locally |
| First OCR scan is slow | The engine (~4 MB) downloads once, then is cached by the service worker and works offline |
| Reset-password emails link to localhost | Set **Authentication → URL Configuration → Site URL** to your production domain |
