#!/usr/bin/env bash
# Reproducible full crawl of salesreplyai.codexanta.bond (used for REA_ANALYSIS.md).
# Downloads every public page + JS/CSS asset into ./clone-output/
set -euo pipefail

BASE="https://salesreplyai.codexanta.bond"
OUT="$(dirname "$0")/../clone-output"
mkdir -p "$OUT/pages" "$OUT/assets"

PAGES=(
  "" "pricing" "blog" "documentation" "login" "register" "forgot-password"
  "privacy-policy" "terms" "data-deletion"
  "blog/facebook-messenger-ai-chatbot"
  "blog/facebook-page-auto-reply-bangla-ai-chatbot"
)

for p in "${PAGES[@]}"; do
  name="${p:-home}"
  name="${name//\//_}"
  echo "Fetching /$p"
  curl -sL -A "Mozilla/5.0" "$BASE/$p" -o "$OUT/pages/$name.html"
done

curl -sL -A "Mozilla/5.0" "$BASE/assets/common/css/common.css" -o "$OUT/assets/common.css"
curl -sL -A "Mozilla/5.0" "$BASE/assets/common/css/light.css"  -o "$OUT/assets/light.css"
curl -sL -A "Mozilla/5.0" "$BASE/assets/common/js/light.js"    -o "$OUT/assets/light.js"
curl -sL -A "Mozilla/5.0" "$BASE/js/widget.js"                 -o "$OUT/assets/widget.js"
curl -sL -A "Mozilla/5.0" "$BASE/robots.txt"                   -o "$OUT/robots.txt"
curl -sL -A "Mozilla/5.0" "$BASE/sitemap.xml"                  -o "$OUT/sitemap.xml"

echo "Done -> $OUT"
echo "Widget API endpoints found:"
grep -oE "/api/widget/[a-z]+" "$OUT/assets/widget.js" | sort -u
