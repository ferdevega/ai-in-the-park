#!/usr/bin/env bash
# Regenerate public/downloads/fast.pdf from the deployed FAST download page.
# Requires Chrome installed at the standard Windows path. Adjust CHROME if needed.

set -e

CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
URL="${URL:-https://ai-in-the-park.vercel.app/downloads/fast}"

# Chrome writes relative to its own working directory, so pass an absolute path
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd -W 2>/dev/null || cd "$(dirname "$0")/.." && pwd)"
OUT="$REPO_ROOT/downloads/fast.pdf"

mkdir -p "$(dirname "$OUT")"

set +e
"$CHROME" \
  --headless=new \
  --disable-gpu \
  --no-sandbox \
  --hide-scrollbars \
  --virtual-time-budget=10000 \
  --run-all-compositor-stages-before-draw \
  --no-pdf-header-footer \
  --print-to-pdf="$OUT" \
  "$URL" 2>&1 | grep -Ei "written|Failed to write"
set -e

if [ -f "$OUT" ]; then
  echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
else
  echo "PDF was not written — check that the URL is deployed and reachable."
  exit 1
fi
