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

The pure helpers (norm/canon/build_lookup/match_scores) are import-safe so they
can be unit-tested without a token or network access. The script body runs only
under `python update_scores.py` via the __main__ guard.
"""
import json, os, sys, unicodedata, urllib.request
from datetime import datetime, timezone

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

def build_lookup(fixtures):
    """Index fixtures by the unordered, canonicalised team pair."""
    lookup = {}
    for fx in fixtures:
        key = frozenset({canon(fx["h"]), canon(fx["a"])})
        udate = parse_iso(fx["dt"]).astimezone(timezone.utc).date()
        lookup.setdefault(key, []).append((udate, fx))
    return lookup

def match_scores(api_matches, lookup, scores):
    """
    Apply finished/in-play API results onto the scores dict (mutated in place).
    Returns (changed, matched, unmatched). Pure: no IO, no network.
    """
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
    return changed, matched, unmatched

def apply_overrides(scores, overrides):
    """
    Apply manual score corrections on top of the feed (mutated in place).
    The free football-data.org feed is occasionally wrong (e.g. a VAR-disallowed
    goal left in the full-time tally). overrides.json lets us pin the correct
    result so the auto-updater can't clobber it back. Returns the count applied.
    Pure: no IO, no network.
    """
    applied = 0
    for k, v in (overrides or {}).items():
        if scores.get(k) != v:
            scores[k] = v; applied += 1; print(f"  OVERRIDE {k} = {v}")
    return applied

def main():
    token = os.environ.get("FOOTBALL_DATA_TOKEN", "").strip()
    if not token:
        print("No FOOTBALL_DATA_TOKEN set — skipping."); return 0

    try: fixtures = json.load(open("fixtures.json", encoding="utf-8"))
    except Exception as e: print("Cannot read fixtures.json:", e); return 1
    try: scores = json.load(open("scores.json", encoding="utf-8"))
    except Exception: scores = {}

    lookup = build_lookup(fixtures)

    req = urllib.request.Request(
        "https://api.football-data.org/v4/competitions/WC/matches",
        headers={"X-Auth-Token": token})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            data = json.load(r)
    except Exception as e:
        print("API request failed:", e); return 1

    api_matches = data.get("matches", [])
    print(f"API returned {len(api_matches)} matches.")

    changed, matched, unmatched = match_scores(api_matches, lookup, scores)

    print(f"Matched {matched} | updated {changed} | unmatched {len(unmatched)}")
    if unmatched: print("Unmatched (add to ALIAS if real):", unmatched[:20])

    # Manual corrections win over the (occasionally wrong) free feed.
    try: overrides = json.load(open("overrides.json", encoding="utf-8"))
    except Exception: overrides = {}
    changed += apply_overrides(scores, overrides)

    # Write sorted for clean diffs
    out = json.dumps(dict(sorted(scores.items())), ensure_ascii=False, indent=2)
    open("scores.json","w",encoding="utf-8").write(out + "\n")
    print(f"Wrote scores.json with {len(scores)} results.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
