"""Unit tests for the pure helpers in update_scorers.py (no token/network)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from update_scorers import build_team_display, parse_scorers

FIXTURES = [
    {"h": "USA", "a": "Paraguay", "dt": "2026-06-13T22:00:00+01:00"},
    {"h": "South Korea", "a": "Czech Republic", "dt": "2026-06-12T22:00:00+01:00"},
    {"h": "Ivory Coast", "a": "Ecuador", "dt": "2026-06-15T00:00:00+01:00"},
    {"h": "Argentina", "a": "Algeria", "dt": "2026-06-17T02:00:00+01:00"},
]


def test_build_team_display_keys_on_canonical_name():
    disp = build_team_display(FIXTURES)
    assert disp["usa"] == "USA"
    assert disp["south korea"] == "South Korea"
    assert disp["ivory coast"] == "Ivory Coast"


def _api(scorers):
    return {"count": len(scorers), "scorers": scorers}


def test_parse_scorers_maps_api_team_to_site_spelling():
    disp = build_team_display(FIXTURES)
    data = _api([
        {"player": {"name": "Christian Pulisic"},
         "team": {"name": "United States"}, "goals": 3, "assists": 1},
        {"player": {"name": "Son Heung-min"},
         "team": {"name": "Korea Republic"}, "goals": 2, "assists": 0},
    ])
    out = parse_scorers(data, disp)
    assert out[0] == {"n": "Christian Pulisic", "t": "USA", "g": 3, "a": 1}
    # "Korea Republic" must resolve to the site's "South Korea"
    assert out[1]["t"] == "South Korea"


def test_parse_scorers_sorts_by_goals_then_assists_and_drops_zero():
    disp = build_team_display(FIXTURES)
    data = _api([
        {"player": {"name": "Low"}, "team": {"name": "Argentina"}, "goals": 1, "assists": 0},
        {"player": {"name": "Top"}, "team": {"name": "Argentina"}, "goals": 4, "assists": 0},
        {"player": {"name": "MidB"}, "team": {"name": "Argentina"}, "goals": 2, "assists": 1},
        {"player": {"name": "MidA"}, "team": {"name": "Argentina"}, "goals": 2, "assists": 3},
        {"player": {"name": "NoGoal"}, "team": {"name": "Argentina"}, "goals": 0, "assists": 5},
    ])
    out = parse_scorers(data, disp)
    assert [r["n"] for r in out] == ["Top", "MidA", "MidB", "Low"]
    assert all(r["g"] > 0 for r in out)  # zero-goal entries are dropped


def test_parse_scorers_handles_null_assists_and_unknown_team():
    disp = build_team_display(FIXTURES)
    data = _api([
        {"player": {"name": "X"}, "team": {"name": "Atlantis"}, "goals": 2, "assists": None},
    ])
    out = parse_scorers(data, disp)
    assert out[0] == {"n": "X", "t": "Atlantis", "g": 2, "a": 0}


def test_parse_scorers_respects_limit():
    disp = build_team_display(FIXTURES)
    data = _api([
        {"player": {"name": f"P{i}"}, "team": {"name": "Argentina"}, "goals": 30 - i, "assists": 0}
        for i in range(30)
    ])
    out = parse_scorers(data, disp, limit=5)
    assert len(out) == 5
    assert out[0]["n"] == "P0"


def test_parse_scorers_empty_payload_is_empty_list():
    assert parse_scorers({}, {}) == []
    assert parse_scorers({"scorers": None}, {}) == []
