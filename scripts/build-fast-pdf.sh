#!/usr/bin/env bash
# Regenerate public/downloads/fast.pdf from the deployed FAST download page.
# Requires Chrome installed at the standard Windows path. Adjust CHROME if needed.

set -e

CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
URL="${URL:-https://ai-in-the-park.vercel.app/downloads/fast}"
OUT="downloads/fast.pdf"

mkdir -p "$(dirname "$OUT")"

"$CHROME" \
  --headless=new \
  --disable-gpu \
  --no-sandbox \
  --hide-scrollbars \
  --virtual-time-budget=10000 \
  --run-all-compositor-stages-before-draw \
  --no-pdf-header-footer \
  --print-to-pdf="$OUT" \
  "$URL"

echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
