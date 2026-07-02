#!/usr/bin/env python3
"""
Auto-update knockouts.json — the REAL knockout-bracket matchups for the
World Cup 2026 site. Runs in GitHub Actions alongside the score updater.

Once the group stage ends and the draw is set, football-data.org's /matches
endpoint returns the actual Round-of-32 (and later) fixtures with real team
names — already reflecting FIFA's official allocation of group winners,
runners-up and the eight best third-placed teams. We read those and write a
mapping our front-end overlays onto the bracket, so we never need to encode
FIFA's 495-combination third-place table by hand.

Output (knockouts.json): { "<g>|<dt>|<h>|<a>": {"h": "<team>", "a": "<team>"} }
keyed by our placeholder fixture (e.g. "R32|2026-...|2A|2B") so the front-end
can match each knockout fixture to its resolved teams.

Same token as the score updater (FOOTBALL_DATA_TOKEN). The pure helper
parse_knockouts() is import-safe and unit-tested without a token or network.
"""
import json, os, sys, urllib.request

from update_scores import canon
from update_scorers import build_team_display

# football-data.org stage name (various spellings) -> (our `g` label, round rank)
STAGE = {
    "LAST_32": ("R32", 1), "ROUND_OF_32": ("R32", 1),
    "LAST_16": ("R16", 2), "ROUND_OF_16": ("R16", 2),
    "QUARTER_FINALS": ("QF", 3), "QUARTER_FINAL": ("QF", 3),
    "SEMI_FINALS": ("SF", 4), "SEMI_FINAL": ("SF", 4),
    "THIRD_PLACE": ("3rd", 5), "3RD_PLACE_FINAL": ("3rd", 5),
    "PLAY_OFF_FOR_THIRD_PLACE": ("3rd", 5),
    "FINAL": ("Final", 6),
}
GRANK = {"R32": 1, "R16": 2, "QF": 3, "SF": 4, "3rd": 5, "Final": 6}


def parse_knockouts(api_json, fixtures, team_display):
    """Map our placeholder knockout fixtures to their real teams from the feed.

    Aligns per round: within each round both lists are sorted by kickoff, then
    paired by position (FIFA plays them in match-number order). Only emits a
    fixture once BOTH teams are known and resolve to site team names. Pure.
    """
    our_by_g = {}
    for fx in fixtures:
        if fx.get("g") in GRANK:
            our_by_g.setdefault(fx["g"], []).append(fx)

    feed_by_rank = {}
    for m in (api_json or {}).get("matches", []):
        st = STAGE.get((m.get("stage") or "").upper())
        if not st:
            continue
        feed_by_rank.setdefault(st[1], []).append(m)

    out = {}
    for g, rank in GRANK.items():
        ours = sorted(our_by_g.get(g, []), key=lambda x: x["dt"])
        feed = sorted(feed_by_rank.get(rank, []), key=lambda m: m.get("utcDate", ""))
        for i, fx in enumerate(ours):
            if i >= len(feed):
                break
            m = feed[i]
            hn = (m.get("homeTeam") or {}).get("name")
            an = (m.get("awayTeam") or {}).get("name")
            if not hn or not an:
                continue
            h = team_display.get(canon(hn))
            a = team_display.get(canon(an))
            if not h or not a:
                continue
            entry = {"h": h, "a": a}
            # Capture the score, the winner (which covers penalty shootouts, where
            # full-time is level), and the shootout score for display.
            score = m.get("score") or {}
            ft = score.get("fullTime") or {}
            gh, ga = ft.get("home"), ft.get("away")
            status = m.get("status")
            if status in ("IN_PLAY", "PAUSED", "FINISHED") and gh is not None and ga is not None:
                entry["s"] = f"{gh}-{ga}"
            win = score.get("winner")
            if status == "FINISHED" and win in ("HOME_TEAM", "AWAY_TEAM"):
                entry["w"] = "h" if win == "HOME_TEAM" else "a"
            pen = score.get("penalties") or {}
            # Only surface a shootout score when full-time was level (i.e. penalties
            # actually decided it) — some feeds attach stray penalty data otherwise.
            if (pen.get("home") is not None and pen.get("away") is not None
                    and gh is not None and gh == ga):
                entry["p"] = f"{pen['home']}-{pen['away']}"
            key = f'{fx["g"]}|{fx["dt"]}|{fx["h"]}|{fx["a"]}'
            out[key] = entry
    return out


def main():
    token = os.environ.get("FOOTBALL_DATA_TOKEN", "").strip()
    if not token:
        print("No FOOTBALL_DATA_TOKEN set — skipping knockouts update."); return 0

    try:
        fixtures = json.load(open("fixtures.json", encoding="utf-8"))
    except Exception as e:
        print("Cannot read fixtures.json:", e); return 1

    team_display = build_team_display(fixtures)

    req = urllib.request.Request(
        "https://api.football-data.org/v4/competitions/WC/matches",
        headers={"X-Auth-Token": token})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            data = json.load(r)
    except Exception as e:
        print("Knockouts API request failed:", e); return 1

    resolved = parse_knockouts(data, fixtures, team_display)

    # Merge onto any existing file so a transient empty feed never wipes the bracket.
    try:
        current = json.load(open("knockouts.json", encoding="utf-8"))
    except Exception:
        current = {}
    current.update(resolved)

    out = json.dumps(dict(sorted(current.items())), ensure_ascii=False, indent=2)
    open("knockouts.json", "w", encoding="utf-8").write(out + "\n")
    print(f"Wrote knockouts.json with {len(current)} resolved knockout fixtures "
          f"({len(resolved)} from this run).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
