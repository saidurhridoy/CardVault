# Publish CardVault — GitHub repo + free hosting

CardVault is a **static site** (no build step, no server to run), so publishing
is push-button simple. Everything below is 100% free.

---

## 1. Put the project on GitHub

If you haven't yet:

```bash
cd cardvault
git init                      # (already done if you cloned)
git add .
git commit -m "CardVault v1.0.0 — business card scanner PWA"
```

1. Go to **https://github.com/new**
2. Repository name: `cardvault` · Visibility: **Public** · Do **not** add a README (we have one)
3. Click **Create repository**, then copy the commands GitHub shows you:

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/cardvault.git
git push -u origin main
```

Done — your project is live on GitHub. 🎉

> Don't forget to update the `repository.url` in `package.json` and the clone
> URL in `README.md` to your real username.

## 2. Host it — pick any free option

All four options give you **HTTPS** (required for camera + PWA install) on a
free tier. No build settings are needed anywhere — it's plain static files.

### Option A · Netlify (easiest)

1. **https://app.netlify.com** → sign in with GitHub
2. **Add new site → Import an existing project → GitHub** → pick `cardvault`
3. Build command: *(leave empty)* · Publish directory: `.`
4. **Deploy site** — done. You get `https://cardvault.netlify.app` and every
   `git push` auto-deploys.

*Even faster:* drag-and-drop the folder at **https://app.netlify.com/drop**.

### Option B · Vercel

```bash
npm i -g vercel
vercel            # inside the cardvault folder → follow prompts
```

### Option C · GitHub Pages

1. On your repo: **Settings → Pages**
2. Source: **Deploy from a branch** → Branch: `main` / `/ (root)` → **Save**
3. Your app appears at `https://YOUR_USERNAME.github.io/cardvault/` in ~1 minute.

The app uses relative paths throughout, so the `/cardvault/` sub-path just works.

### Option D · Cloudflare Pages

1. **https://dash.cloudflare.com** → Workers & Pages → Create → Pages → Connect to Git
2. Pick the repo, leave build settings empty, deploy.

## 3. Tell Supabase about your URL (one setting)

In the Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://your-deployment.netlify.app`
- Add `http://localhost:3000` to **Redirect URLs** for local testing

This makes confirmation and password-reset links land correctly.

## 4. Share it / install it

- Send people your URL — on phones they can **Add to Home Screen**
  (Android Chrome shows an install prompt automatically).
- Suggest first-time visitors tap **“Try demo mode”** — no account needed to feel
  how it works, and demo cards can be imported into a real account later.

## Updating later

```bash
git add . && git commit -m "describe your change" && git push
```

Netlify/Vercel/GitHub Pages redeploy automatically.

> If you changed any cached app file (`index.html`, `css/`, `js/`, icons),
> bump `CACHE_VERSION` at the top of `sw.js` (e.g. `cardvault-v1` → `cardvault-v2`)
> so returning users get the update immediately.

## Custom domain (optional)

Netlify/Vercel/Cloudflare all offer free SSL for a domain you own
(domain itself costs ~$10/year). Add it in your host's **Domain settings**.
