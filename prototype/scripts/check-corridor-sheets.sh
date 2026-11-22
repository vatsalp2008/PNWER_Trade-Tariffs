#!/bin/bash
# Checks that every corridor fact sheet (corridors with >= US$250M two-way trade) renders as exactly 2 pages.
# Needs the site running: npm run build && npm run preview
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
BASE="${BASE:-http://localhost:4173}"
DATA="$(dirname "$0")/../public/data/corridors"
PAIRS=$(python3 - "$DATA" <<'PY'
import json, sys, pathlib
d = pathlib.Path(sys.argv[1])
v = json.loads((d / "latest.json").read_text())["version"]
ix = json.loads((d / "versions" / v / "index.json").read_text())
fx, last = ix["fx"], len(ix["months"]) - 1
def usd12(key):
    s = ix["series"].get(key) or []
    return sum((s[i] or 0) * 1000 / fx[i] for i in range(last - 11, last + 1)) / 1e6
for p in ix["provinces"]:
    for s in ix["states"]:
        if usd12(f"{p}|{s}|exp|total") + usd12(f"{p}|{s}|imp|total") >= 250:
            print(f"{p}/{s}")
PY
)
fail=0; n=0
for pair in $PAIRS; do
  n=$((n+1))
  out=$("$CHROME" --headless=new --disable-gpu --window-size=1000,900 --virtual-time-budget=15000 \
    --enable-logging=stderr --v=0 --dump-dom "$BASE/corridor/$pair" 2>&1)
  pages=$(echo "$out" | grep -c 'class="sheet-page"')
  over=$(echo "$out" | grep -o 'overflows by [0-9]*px' | tr '\n' ' ')
  if [ "$pages" != "2" ] || [ -n "$over" ]; then echo "FAIL $pair pages=$pages $over"; fail=$((fail+1)); fi
done
echo "Checked $n corridor sheets: $fail problem(s)."
[ "$fail" -eq 0 ]
