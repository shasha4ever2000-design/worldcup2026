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
