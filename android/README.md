# CardVault — Android APK (Trusted Web Activity)

This Gradle project wraps the live CardVault PWA (`https://cardvault-app.surge.sh`)
into a signed, installable Android APK using Google's official
[androidbrowserhelper](https://github.com/GoogleChromeLabs/android-browser-helper)
library — the same approach `bubblewrap`/PWABuilder use.

**This is not a re-implementation.** The APK launches the real web app in a
fullscreen Chrome Trusted Web Activity, so camera scanning, OCR, accounts and
cloud sync behave exactly like the site, and every deploy to surge.sh is
instantly reflected in the app — no APK update needed.

## Key facts

| Item | Value |
|---|---|
| Application ID | `com.saidurhridoy.cardvault` |
| Version | 1.2.0 (versionCode 12000) |
| minSdk / targetSdk | 21 (Android 5.0) / 34 |
| Launch URL | https://cardvault-app.surge.sh |
| Signing key | `android/keystore/cardvault.release.keystore` (git-ignored, workspace-only) |
| Site-side verification | `.well-known/assetlinks.json` on the live site |

Fullscreen (no browser URL bar) requires Digital Asset Links verification:
the SHA-256 fingerprint of the APK signing certificate is published at
`https://cardvault-app.surge.sh/.well-known/assetlinks.json`. **If you ever
create a new keystore, update that file and redeploy the site**, or the app
will show an address bar.

## Rebuilding the APK

Prereqs: JDK 17, Android SDK (platform 34 + build-tools 34.0.0), Gradle 8.7.

```bash
# in this directory
echo "sdk.dir=/path/to/android-sdk" > local.properties
gradle assembleRelease
# -> app/build/outputs/apk/release/app-release.apk (already signed with the release key)
```

Version bumps: edit `versionCode` / `versionName` in `app/build.gradle`.
For a new version keep the same keystore (Android refuses updates signed
with a different key) and bump `versionCode` only.

## Play Store (optional, future)

The same keystore + project can produce an AAB (`gradle bundleRelease`).
You'd need a $25 Google Play developer account; upload signing can stay with
this key or use Play App Signing.

## Security notes

- `keystore/` and `keystore.properties` are git-ignored on purpose. Losing the
  keystore means a future Play Store listing would need a new one.
- The Supabase key in `js/config.js` is a public publishable key — RLS on the
  backend is the real security layer.
