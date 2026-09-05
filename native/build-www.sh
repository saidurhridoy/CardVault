#!/usr/bin/env bash
# Builds the web bundle (native/www/) for the Android APK from the repo root.
# - copies the web app (single source of truth)
# - bundles the CDN libraries (supabase-js, tesseract.js) locally so the app
#   boots without any CDN dependency
# - sets window.CARDVAULT_NATIVE (disables service-worker registration)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
WWW="$HERE/www"

rm -rf "$WWW"
mkdir -p "$WWW"
cd "$ROOT"
tar cf - \
  --exclude=.git --exclude=node_modules --exclude=test \
  --exclude='package*.json' --exclude=.gitignore \
  --exclude=android --exclude=native --exclude=docs \
  --exclude=samples --exclude=supabase --exclude=.well-known \
  --exclude=.surgeignore --exclude=README.md --exclude=LICENSE \
  --exclude=CNAME \
  . | (cd "$WWW" && tar xf -)

mkdir -p "$WWW/js/vendor"
curl -sSL -o "$WWW/js/vendor/supabase.min.js" \
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"
curl -sSL -o "$WWW/js/vendor/tesseract.min.js" \
  "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"

# Point index.html at the bundled libraries instead of the CDN
sed -i 's#https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2#js/vendor/supabase.min.js#' "$WWW/index.html"
sed -i 's#https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js#js/vendor/tesseract.min.js#' "$WWW/index.html"

# Native-mode flag (read by js/app.js)
sed -i '0,/<head>/s##<head><script>window.CARDVAULT_NATIVE = true;</script>#' "$WWW/index.html"

echo "www/ built:"
du -sh "$WWW"
ls "$WWW"
