#!/bin/bash
# Checks that fact sheets render as exactly 2 pages and nothing spills off a page.
# Needs the site running: npm run build && npm run preview
# Usage: scripts/check-factsheets.sh ["WA BC ..."] ["all ag dairy ..."]
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
BASE="${BASE:-http://localhost:4173}"
JURS="${1:-WA OR ID MT AK BC AB SK YT NT}"
SCOPES="${2:-all ag energy mfg forest metals chem}"
fail=0; n=0
for j in $JURS; do for s in $SCOPES; do
  n=$((n+1))
  out=$("$CHROME" --headless=new --disable-gpu --window-size=1000,900 --virtual-time-budget=4000 \
    --enable-logging=stderr --v=0 --dump-dom "$BASE/factsheet/$j/$s" 2>&1)
  pages=$(echo "$out" | grep -c 'class="sheet-page"')
  over=$(echo "$out" | grep -o 'overflows by [0-9]*px' | tr '\n' ' ')
  if [ "$pages" != "2" ] || [ -n "$over" ]; then echo "FAIL $j/$s pages=$pages $over"; fail=$((fail+1)); fi
done; done
echo "Checked $n fact sheets: $fail problem(s)."
[ "$fail" -eq 0 ]
