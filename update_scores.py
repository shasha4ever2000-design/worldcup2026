#!/usr/bin/env python3
"""
Auto-update scores.json for the World Cup 2026 site.
Runs in GitHub Actions on a schedule. Reads fixtures.json (your match list),
fetches results from football-data.org, and writes scores.json.

The API key lives in GitHub Secrets (FOOTBALL_DATA_TOKEN) and is NEVER exposed
to site visitors. Get a free token at https://www.football-data.org/client/register

--- ALTERNATIVE API (if football-data.org doesn't expose the World Cup) ---
Use API-Football (https://www.api-football.com, free 100 req/day). Swap the
fetch() block below for their /fixtures?league=1&season=2026 endpoint and read
fixture.goals.home / fixture.goals.away. The matching logic stays the same.
"""
import json, os, sys, unicodedata, urllib.request
from datetime import datetime, timezone

TOKEN = os.environ.get("FOOTBALL_DATA_TOKEN", "").strip()
if not TOKEN:
    print("No FOOTBALL_DATA_TOKEN set — skipping."); sys.exit(0)

# Map the API's team spellings -> the spelling used on the site (normalised form)
ALIAS = {
 "turkiye":"turkey",
 "korea republic":"south korea","republic of korea":"south korea",
 "ir iran":"iran","iran islamic republic":"iran",
 "united states":"usa","united states of america":"usa",
 "czechia":"czech republic",
 "cote d ivoire":"ivory coast","cote divoire":"ivory coast",
 "cabo verde":"cape verde","cape verde islands":"cape verde",
 "bosnia and herzegovina":"bosnia herzegovina",
 "congo dr":"dr congo","democratic republic of congo":"dr congo","congo democratic republic":"dr congo",
}
def norm(x):
    x = unicodedata.normalize("NFKD", x or "").encode("ascii","ignore").decode().lower()
    for ch in "&.'`-/": x = x.replace(ch, " ")
    return " ".join(x.split())
def canon(name):
    n = norm(name); return ALIAS.get(n, n)

def parse_iso(s):
    return datetime.fromisoformat(s.replace("Z","+00:00"))

# Load the fixture map and current scores
try: fixtures = json.load(open("fixtures.json", encoding="utf-8"))
except Exception as e: print("Cannot read fixtures.json:", e); sys.exit(1)
try: scores = json.load(open("scores.json", encoding="utf-8"))
except Exception: scores = {}

# Index fixtures by the unordered team pair
lookup = {}
for fx in fixtures:
    key = frozenset({canon(fx["h"]), canon(fx["a"])})
    udate = parse_iso(fx["dt"]).astimezone(timezone.utc).date()
    lookup.setdefault(key, []).append((udate, fx))

# Fetch from football-data.org
req = urllib.request.Request(
    "https://api.football-data.org/v4/competitions/WC/matches",
    headers={"X-Auth-Token": TOKEN})
try:
    with urllib.request.urlopen(req, timeout=40) as r:
        data = json.load(r)
except Exception as e:
    print("API request failed:", e); sys.exit(1)

api_matches = data.get("matches", [])
print(f"API returned {len(api_matches)} matches.")

changed = 0; matched = 0; unmatched = []
for m in api_matches:
    status = m.get("status")
    ft = (m.get("score") or {}).get("fullTime") or {}
    gh, ga = ft.get("home"), ft.get("away")
    if status not in ("FINISHED","IN_PLAY","PAUSED") or gh is None or ga is None:
        continue
    hn = (m.get("homeTeam") or {}).get("name","")
    an = (m.get("awayTeam") or {}).get("name","")
    key = frozenset({canon(hn), canon(an)})
    cands = lookup.get(key)
    if not cands:
        unmatched.append(f"{hn} vs {an}"); continue
    apidate = parse_iso(m.get("utcDate","2026-01-01T00:00:00Z")).date()
    _, fx = min(cands, key=lambda c: abs((c[0]-apidate).days))
    # orient score to the site's home/away
    sc = f"{gh}-{ga}" if canon(fx["h"]) == canon(hn) else f"{ga}-{gh}"
    fk = f'{fx["dt"]}|{fx["h"]}|{fx["a"]}'
    matched += 1
    if scores.get(fk) != sc:
        scores[fk] = sc; changed += 1; print(f"  {fk} = {sc} ({status})")

print(f"Matched {matched} | updated {changed} | unmatched {len(unmatched)}")
if unmatched: print("Unmatched (add to ALIAS if real):", unmatched[:20])

# Write sorted for clean diffs
out = json.dumps(dict(sorted(scores.items())), ensure_ascii=False, indent=2)
open("scores.json","w",encoding="utf-8").write(out + "\n")
print(f"Wrote scores.json with {len(scores)} results.")
