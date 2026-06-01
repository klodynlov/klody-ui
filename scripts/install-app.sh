#!/usr/bin/env bash
#
# install-app.sh — construit le bundle natif et l'installe dans /Applications.
#
# `tauri build` produit le .app sous src-tauri/target/ mais ne le copie PAS
# dans /Applications : l'app que l'on double-clique reste donc l'ancienne tant
# qu'on ne recopie pas le bundle. Ce script enchaîne build + installation pour
# qu'un changement de code soit réellement visible dans l'app que l'on ouvre.
#
# Usage :  npm run install:app   (ou  bash scripts/install-app.sh)

set -euo pipefail

# Racine du repo (le script vit dans scripts/).
cd "$(dirname "$0")/.."

APP="klody-ui.app"
SRC="src-tauri/target/release/bundle/macos/${APP}"
DST="/Applications/${APP}"

echo "▸ Build (vite + Rust release, bundle .app uniquement)…"
npm run tauri build -- --bundles app

if [[ ! -d "$SRC" ]]; then
  echo "✗ Bundle introuvable : $SRC — le build a-t-il échoué ?" >&2
  exit 1
fi

# Le bundle est copié au démarrage de l'app ; si elle tourne, il faut la relancer.
if pgrep -f "${APP}/Contents/MacOS/klody-ui" >/dev/null 2>&1; then
  echo "⚠ Klody est ouvert — quitte-le puis rouvre-le pour charger la nouvelle version."
fi

echo "▸ Installation → ${DST}"
rm -rf "$DST"
ditto "$SRC" "$DST"

VER="$(/usr/bin/plutil -extract CFBundleShortVersionString raw "${DST}/Contents/Info.plist" 2>/dev/null || echo '?')"
echo "✓ Installé : ${DST} (v${VER}) — rouvre Klody pour voir les changements."
