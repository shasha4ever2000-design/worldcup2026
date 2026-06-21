"""Unit tests for the pure helpers in update_scores.py (no token/network)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from update_scores import norm, canon, parse_iso, build_lookup, match_scores, apply_overrides


def test_norm_strips_accents_punctuation_and_case():
    assert norm("Côte d'Ivoire") == "cote d ivoire"
    assert norm("Bosnia & Herzegovina") == "bosnia herzegovina"
    assert norm("  CURAÇAO ") == "curacao"
    assert norm(None) == ""


def test_canon_resolves_aliases():
    assert canon("Türkiye") == "turkey"
    assert canon("Korea Republic") == "south korea"
    assert canon("United States of America") == "usa"
    assert canon("Congo DR") == "dr congo"
    assert canon("Brazil") == "brazil"  # passthrough


def test_parse_iso_handles_z_and_offset():
    assert parse_iso("2026-06-11T20:00:00Z").tzinfo is not None
    assert parse_iso("2026-06-12T01:00:00+01:00").hour == 1


FIXTURES = [
    {"g": "A", "dt": "2026-06-11T20:00:00Z", "h": "Mexico", "a": "South Korea"},
    {"g": "A", "dt": "2026-06-15T20:00:00Z", "h": "South Korea", "a": "Mexico"},
]


def _api(status, home, away, gh, ga, utc):
    return {
        "status": status,
        "score": {"fullTime": {"home": gh, "away": ga}},
        "homeTeam": {"name": home},
        "awayTeam": {"name": away},
        "utcDate": utc,
    }


def test_match_scores_orients_to_site_home_away():
    scores = {}
    # API reports Korea Republic 1-3 Mexico; site fixture is Mexico (home) vs South Korea
    api = [_api("FINISHED", "Korea Republic", "Mexico", 1, 3, "2026-06-11T20:00:00Z")]
    changed, matched, unmatched = match_scores(api, build_lookup(FIXTURES), scores)
    assert changed == 1 and matched == 1 and unmatched == []
    # Oriented to Mexico-home: 3-1
    assert scores["2026-06-11T20:00:00Z|Mexico|South Korea"] == "3-1"


def test_match_scores_disambiguates_repeated_pairing_by_date():
    scores = {}
    api = [_api("FINISHED", "Mexico", "South Korea", 2, 2, "2026-06-15T20:00:00Z")]
    match_scores(api, build_lookup(FIXTURES), scores)
    # Closest fixture by date is the 06-15 leg (South Korea home), oriented 2-2
    assert "2026-06-15T20:00:00Z|South Korea|Mexico" in scores


def test_match_scores_skips_unfinished_and_unmatched():
    scores = {}
    api = [
        _api("SCHEDULED", "Mexico", "South Korea", None, None, "2026-06-11T20:00:00Z"),
        _api("FINISHED", "Narnia", "Atlantis", 1, 0, "2026-06-11T20:00:00Z"),
    ]
    changed, matched, unmatched = match_scores(api, build_lookup(FIXTURES), scores)
    assert changed == 0 and matched == 0
    assert unmatched == ["Narnia vs Atlantis"]
    assert scores == {}


def test_match_scores_is_idempotent():
    scores = {}
    lookup = build_lookup(FIXTURES)
    api = [_api("FINISHED", "Mexico", "South Korea", 1, 0, "2026-06-11T20:00:00Z")]
    match_scores(api, lookup, scores)
    changed_again, _, _ = match_scores(api, lookup, scores)
    assert changed_again == 0  # no new write on identical re-run


def test_apply_overrides_wins_over_feed():
    # Feed wrote a wrong score; the manual override must correct it.
    scores = {"2026-06-11T20:00:00Z|Mexico|South Korea": "5-0"}
    applied = apply_overrides(scores, {"2026-06-11T20:00:00Z|Mexico|South Korea": "4-0"})
    assert applied == 1
    assert scores["2026-06-11T20:00:00Z|Mexico|South Korea"] == "4-0"


def test_apply_overrides_idempotent_and_tolerates_empty():
    scores = {"k": "4-0"}
    assert apply_overrides(scores, {"k": "4-0"}) == 0  # already correct, no rewrite
    assert apply_overrides(scores, {}) == 0
    assert apply_overrides(scores, None) == 0
