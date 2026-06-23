#!/usr/bin/env python3
"""
Auto-update scorers.json (the Golden Boot / top-scorers list) for the
World Cup 2026 site. Runs in GitHub Actions on the same schedule as the score
updater. Fetches the top scorers from football-data.org and writes scorers.json
in the exact {n, t, g, a} shape the front-end's SCORERS list uses.

Uses the SAME token as update_scores.py (GitHub Secret FOOTBALL_DATA_TOKEN);
the /scorers endpoint returns player name, team, goals and assists.

--- ALTERNATIVE API (if football-data.org's free tier doesn't expose WC scorers) ---
Use API-Football (https://www.api-football.com, free 100 req/day):
  GET /players/topscorers?league=1&season=2026
read response["response"][i]["player"]["name"], ["statistics"][0]["team"]["name"]
and ["statistics"][0]["goals"]["total"] / ["assists"]. The parse/mapping logic
below stays the same.

The pure helpers (build_team_display / parse_scorers) are import-safe so they can
be unit-tested without a token or network. The script body runs only under
`python update_scorers.py` via the __main__ guard.
"""
import json, os, sys, urllib.request

# Reuse the single source of truth for team-name normalisation/aliases.
from update_scores import canon

# How many players to keep in the Golden Boot list.
LIMIT = 20


def build_team_display(fixtures):
    """Map a canonicalised team name -> the exact spelling the site renders.

    The site's tn()/fl() lookups key off these display names (e.g. "USA",
    "South Korea", "Bosnia & Herzegovina"), so an API team like "United States"
    or "Korea Republic" must be resolved back to the site's spelling.
    """
    disp = {}
    for fx in fixtures:
        for side in ("h", "a"):
            name = fx.get(side)
            if name:
                disp.setdefault(canon(name), name)
    return disp


def parse_scorers(api_json, team_display, limit=LIMIT):
    """Turn the API's scorers payload into the site's [{n,t,g,a}] list.

    Pure: no IO, no network. Skips entries with no goals, maps team spellings to
    the site's display names, and sorts by goals (then assists, then name).
    """
    out = []
    for s in (api_json or {}).get("scorers", []) or []:
        player = (s.get("player") or {}).get("name")
        team_api = (s.get("team") or {}).get("name", "")
        if not player:
            continue
        goals = s.get("goals") or 0
        assists = s.get("assists") or 0
        try:
            goals = int(goals)
            assists = int(assists)
        except (TypeError, ValueError):
            continue
        if goals <= 0:
            continue
        team = team_display.get(canon(team_api), team_api)
        out.append({"n": player, "t": team, "g": goals, "a": assists})
    out.sort(key=lambda r: (-r["g"], -r["a"], r["n"]))
    return out[:limit]


def main():
    token = os.environ.get("FOOTBALL_DATA_TOKEN", "").strip()
    if not token:
        print("No FOOTBALL_DATA_TOKEN set — skipping scorers update."); return 0

    try:
        fixtures = json.load(open("fixtures.json", encoding="utf-8"))
    except Exception as e:
        print("Cannot read fixtures.json:", e); return 1

    team_display = build_team_display(fixtures)

    req = urllib.request.Request(
        f"https://api.football-data.org/v4/competitions/WC/scorers?limit={LIMIT}",
        headers={"X-Auth-Token": token})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            data = json.load(r)
    except Exception as e:
        print("Scorers API request failed:", e); return 1

    scorers = parse_scorers(data, team_display)
    if not scorers:
        print("API returned no scorers — leaving scorers.json unchanged."); return 0

    out = json.dumps(scorers, ensure_ascii=False, indent=2)
    open("scorers.json", "w", encoding="utf-8").write(out + "\n")
    print(f"Wrote scorers.json with {len(scorers)} scorers "
          f"(top: {scorers[0]['n']} {scorers[0]['g']}g).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
