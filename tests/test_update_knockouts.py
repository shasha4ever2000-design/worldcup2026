"""Unit tests for the pure helper in update_knockouts.py (no token/network)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from update_knockouts import parse_knockouts
from update_scorers import build_team_display

FIXTURES = [
    # group games (give build_team_display the site spellings)
    {"g": "G", "dt": "2026-06-27T03:00:00+01:00", "h": "Egypt", "a": "Iran"},
    {"g": "D", "dt": "2026-06-26T03:00:00+01:00", "h": "USA", "a": "Australia"},
    {"g": "A", "dt": "2026-06-25T02:00:00+01:00", "h": "Mexico", "a": "South Korea"},
    {"g": "B", "dt": "2026-06-24T20:00:00+01:00", "h": "Switzerland", "a": "Canada"},
    # knockout placeholders
    {"g": "R32", "dt": "2026-07-03T19:00:00+01:00", "h": "2D", "a": "2G"},
    {"g": "R32", "dt": "2026-06-28T20:00:00+01:00", "h": "2A", "a": "2B"},
    {"g": "Final", "dt": "2026-07-19T20:00:00+01:00", "h": "W101", "a": "W102"},
]
DISPLAY = build_team_display(FIXTURES)


def feed(*matches):
    return {"matches": list(matches)}


def m(stage, utc, home, away):
    return {
        "stage": stage, "utcDate": utc,
        "homeTeam": {"name": home} if home else None,
        "awayTeam": {"name": away} if away else None,
    }


def mS(stage, utc, home, away, status, ft=None, winner=None, pens=None):
    d = m(stage, utc, home, away)
    d["status"] = status
    d["score"] = {}
    if ft is not None:
        d["score"]["fullTime"] = {"home": ft[0], "away": ft[1]}
    if winner is not None:
        d["score"]["winner"] = winner
    if pens is not None:
        d["score"]["penalties"] = {"home": pens[0], "away": pens[1]}
    return d


def test_maps_feed_teams_onto_our_placeholder_fixtures():
    api = feed(
        m("LAST_32", "2026-06-28T19:00:00Z", "Mexico", "Switzerland"),   # earlier R32
        m("LAST_32", "2026-07-03T18:00:00Z", "Australia", "Egypt"),      # later R32
    )
    out = parse_knockouts(api, FIXTURES, DISPLAY)
    # earliest R32 placeholder (2A v 2B, Jun 28) → first feed R32 by date
    assert out["R32|2026-06-28T20:00:00+01:00|2A|2B"] == {"h": "Mexico", "a": "Switzerland"}
    # later R32 placeholder (2D v 2G, Jul 3) → second feed R32 by date
    assert out["R32|2026-07-03T19:00:00+01:00|2D|2G"] == {"h": "Australia", "a": "Egypt"}


def test_captures_score_and_winner_for_a_finished_knockout():
    api = feed(mS("LAST_32", "2026-06-28T19:00:00Z", "Mexico", "Switzerland",
                  "FINISHED", ft=(2, 1), winner="HOME_TEAM"))
    out = parse_knockouts(api, FIXTURES, DISPLAY)
    e = out["R32|2026-06-28T20:00:00+01:00|2A|2B"]
    assert e["s"] == "2-1" and e["w"] == "h"


def test_winner_covers_penalty_shootout_on_level_score():
    api = feed(mS("LAST_32", "2026-06-28T19:00:00Z", "Mexico", "Switzerland",
                  "FINISHED", ft=(1, 1), winner="AWAY_TEAM", pens=(3, 5)))
    out = parse_knockouts(api, FIXTURES, DISPLAY)
    e = out["R32|2026-06-28T20:00:00+01:00|2A|2B"]
    assert e["s"] == "1-1" and e["w"] == "a" and e["p"] == "3-5"


def test_penalties_only_shown_when_full_time_is_level():
    # non-level full-time with stray penalty data → no "p"
    api = feed(mS("LAST_32", "2026-06-28T19:00:00Z", "Mexico", "Switzerland",
                  "FINISHED", ft=(4, 5), winner="AWAY_TEAM", pens=(3, 4)))
    out = parse_knockouts(api, FIXTURES, DISPLAY)
    e = out["R32|2026-06-28T20:00:00+01:00|2A|2B"]
    assert e["s"] == "4-5" and e["w"] == "a" and "p" not in e


def test_in_play_gets_score_but_no_winner_yet():
    api = feed(mS("LAST_32", "2026-06-28T19:00:00Z", "Mexico", "Switzerland",
                  "IN_PLAY", ft=(1, 0)))
    out = parse_knockouts(api, FIXTURES, DISPLAY)
    e = out["R32|2026-06-28T20:00:00+01:00|2A|2B"]
    assert e["s"] == "1-0" and "w" not in e


def test_scheduled_knockout_has_teams_but_no_score():
    api = feed(mS("LAST_32", "2026-06-28T19:00:00Z", "Mexico", "Switzerland", "SCHEDULED"))
    out = parse_knockouts(api, FIXTURES, DISPLAY)
    e = out["R32|2026-06-28T20:00:00+01:00|2A|2B"]
    assert e == {"h": "Mexico", "a": "Switzerland"}


def test_normalises_api_team_spellings_to_site_names():
    api = feed(m("ROUND_OF_32", "2026-06-28T19:00:00Z", "United States", "Korea Republic"))
    out = parse_knockouts(api, FIXTURES, DISPLAY)
    teams = out["R32|2026-06-28T20:00:00+01:00|2A|2B"]
    assert teams["h"] == "USA" and teams["a"] == "South Korea"


def test_skips_fixtures_with_unknown_or_missing_teams():
    api = feed(
        m("LAST_32", "2026-06-28T19:00:00Z", None, None),          # TBD → skip
        m("FINAL", "2026-07-19T19:00:00Z", "Egypt", "Atlantis"),    # unknown team → skip
    )
    out = parse_knockouts(api, FIXTURES, DISPLAY)
    assert out == {}


def test_ignores_group_stage_matches():
    api = feed(m("GROUP_STAGE", "2026-06-12T00:00:00Z", "Mexico", "South Korea"))
    assert parse_knockouts(api, FIXTURES, DISPLAY) == {}
