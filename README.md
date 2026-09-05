<div align="center">

<img src="icons/icon-192.png" width="96" alt="CardVault logo" />

# CardVault

**Scan business cards with your camera. Find any contact in seconds.**

A free, open-source, installable web app (PWA) that turns a pile of
visiting cards into a searchable contact library — with **on-device OCR**,
cloud sync, and **vCard export** to your phone's contacts.

[![License: MIT](https://img.shields.io/badge/License-MIT-4f46e5.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-0891b2.svg)](CONTRIBUTING)
![No build step](https://img.shields.io/badge/no--build--step-vanilla--JS-16a34a)
[![Live demo](https://img.shields.io/badge/live-demo-16a34a)](https://cardvault-app.surge.sh)

</div>

<p align="center">
  <img src="docs/screenshots/grid.png" width="620" alt="CardVault grid with search by name, company and designation">
</p>

<p align="center">
  <img src="docs/screenshots/scan.png" width="230" alt="Scanning a business card with on-device OCR" valign="top">
  &nbsp;
  <img src="docs/screenshots/detail.png" width="230" alt="Contact detail sheet with call, email, save contact actions" valign="top">
</p>

---

## ✨ Features

| | |
|---|---|
| 📷 **Camera capture** | Live viewfinder with a card guide frame, front/back flip, and flashlight — or pick a photo from your gallery |
| 🔍 **On-device OCR** | Tesseract.js reads the card *on your phone* — no server, no API key, no per-scan cost. Details are pre-filled for you to confirm |
| 🧠 **Smart field parsing** | Name, designation, company, phone, email, website and address are auto-detected from the scanned text |
| ⚡ **Instant search** | Search by **name, company, designation**, email, phone or notes — phone numbers match even without `+` or spaces |
| ☁️ **Cloud sync** | Free Supabase backend: create an account and your cards follow you to any device. Row-Level Security means *only you* can see your cards |
| 🧪 **Demo mode** | Try the whole app with zero setup — data stays on the device, and can be imported into your cloud account later |
| 👤 **Save to contacts** | One tap downloads a standard **vCard (.vcf)** — with the card photo embedded — that opens straight in your phone's contacts app |
| 📤 **Bulk export** | Export every contact as one `.vcf` file, or a JSON backup |
| 📴 **Offline-first PWA** | Install it to your home screen; the app shell and OCR engine keep working without a network |
| 🌙 **Dark mode** | Follows your system theme automatically |
| 🔐 **Private by design** | Images live in a *private* storage bucket served via short-lived signed URLs; the anon key is public-safe behind RLS |

## 🌐 Live demo

Try it right now at **https://cardvault-app.surge.sh** — tap **“Try demo mode”**
(no signup needed; demo cards stay on your device).

## 🚀 Quick start

```bash
git clone https://github.com/YOUR_USERNAME/cardvault.git
cd cardvault

# 1. connect your free Supabase project (2 minutes) → docs/SETUP.md
#    then edit js/config.js with your URL + anon key

# 2. serve locally (a server is required — ES modules don't run from file://)
npm start          # or: python3 -m http.server 3000
```

Open http://localhost:3000 — you can hit **“Try demo mode”** immediately,
even before configuring Supabase.

> Full walkthrough: **[docs/SETUP.md](docs/SETUP.md)** · Publishing to GitHub + free hosting: **[docs/PUBLISH.md](docs/PUBLISH.md)**

## 🏗️ How it works

```
 📷 Camera  ─▶  🖼️ JPEG (downscaled ≤1600px)  ─▶  🔍 Tesseract.js OCR (in-browser)
                                                        │
                     ✏️ you confirm/edit           ◀─  🧠 heuristic field parser
                           │                              (name / title / company /
                           ▼                                phone / email / web / address)
                    ☁️ Supabase Postgres + Storage  ─▶  ⚡ client-side search
                                                       📤 vCard export
```

**Stack** — vanilla JS (no framework, no build step) · Supabase (auth + Postgres + storage, free tier) · Tesseract.js via CDN · IndexedDB for demo mode · hand-rolled service worker.

## 📁 Project structure

```
cardvault/
├── index.html               # app shell (single page)
├── manifest.webmanifest     # PWA manifest (installable, shortcut)
├── sw.js                    # service worker — offline app shell + CDN cache
├── css/style.css            # all styling (light + dark)
├── js/
│   ├── config.js            # ⚙️ the only file you must edit (Supabase keys)
│   ├── app.js               # views, camera, review flow, search, settings
│   ├── db.js                # data layer: Supabase cloud + IndexedDB demo mode
│   ├── ocr.js               # Tesseract wrapper + field parser (unit-tested)
│   ├── vcard.js             # vCard 3.0 generation
│   └── util.js              # DOM/format/file helpers
├── supabase/schema.sql      # tables + RLS + storage bucket (run once)
├── samples/sample-card.png  # try OCR on this!
├── test/parser.test.mjs     # npm test
├── docs/SETUP.md            # Supabase + configuration guide
└── docs/PUBLISH.md          # GitHub + free hosting guide
```

## 🧪 Tests

```bash
npm test          # 29 parser assertions against realistic card layouts

# optional full UI smoke test (real browser, demo mode, real OCR):
npm i -D playwright-core && npx playwright-core install chromium
npm run test:ui   # 15 end-to-end steps: capture → OCR → save → search → edit → delete → export
```

## 🔐 Security model

- The **anon key** in `js/config.js` is *designed to be public* — like a username, not a password.
- **Row Level Security** on `cards` restricts every query to `auth.uid() = user_id`.
- Card photos sit in a **private** bucket; the app reads them via 7-day **signed URLs**.
- **Never** commit the `service_role` key — it bypasses RLS. (It isn't needed anywhere in this app.)

## 🗺️ Roadmap

- [ ] Batch scan (capture several cards in a row)
- [ ] More OCR languages (Bengali, Hindi, Arabic…)
- [ ] Duplicate detection
- [ ] Tags & follow-up reminders
- [ ] CSV export

Contributions are welcome — open an issue or a PR!

## 📄 License

[MIT](LICENSE) — free for personal and commercial use.
