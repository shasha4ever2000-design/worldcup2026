import { describe, it, expect } from "vitest";
import {
  normTeam,
  mId,
  mSt,
  fuzzy,
  icsDate,
  teamForm,
  predict,
  calcStandings,
  bracketResolve,
  qualScenarios,
  cleanSheetsByTeam,
  compactVotes,
  expandVotes,
  encodePicks,
  decodePicks,
  actualWinner,
  scoreVotes,
  buildMatchSchema,
  pickFeaturedMatch,
  tournamentStats,
  parseInitialTab,
  anyLiveNow,
  pickScore,
  teamTournament,
} from "../src/logic.mjs";

describe("bracketResolve", () => {
  const GROUPS = { A: ["A1", "A2", "A3", "A4"], B: ["B1", "B2", "B3", "B4"] };
  // Round-robin so each group can be "complete" (6 games each).
  const groupGames = (g) => {
    const [t1, t2, t3, t4] = GROUPS[g];
    return [
      { g, h: t1, a: t2 },
      { g, h: t3, a: t4 },
      { g, h: t1, a: t3 },
      { g, h: t2, a: t4 },
      { g, h: t1, a: t4 },
      { g, h: t2, a: t3 },
    ];
  };

  it("resolves group winners and runners-up only once a group is complete", () => {
    const M = [...groupGames("A"), ...groupGames("B")];
    M.forEach((m) => (m.s = "1-0")); // home always wins
    M.push({ g: "R32", ph: 1, h: "1A", a: "2B" });
    const r = bracketResolve(M, GROUPS);
    const ko = M[M.length - 1];
    // A1 wins all → winner; B-runner-up is the team with the 2nd-most points.
    expect(r.get(ko).h).toBe("A1");
    expect(typeof r.get(ko).a).toBe("string");
    expect(r.get(ko).num).toBe(73);
  });

  it("leaves a slot unresolved while its group is still in progress", () => {
    const M = [...groupGames("A").map((m, i) => ({ ...m, s: i === 0 ? null : "1-0" }))];
    M.push({ g: "R32", ph: 1, h: "1A", a: "2A" });
    const r = bracketResolve(M, GROUPS);
    expect(r.get(M[M.length - 1]).h).toBeNull(); // group A not complete
  });

  it("resolves W/L slots recursively from knockout results", () => {
    const M = [...groupGames("A"), ...groupGames("B")];
    M.forEach((m) => (m.s = "1-0"));
    const r32a = { g: "R16", ph: 1, h: "1A", a: "2B", s: "2-1" }; // #73
    const r32b = { g: "R16", ph: 1, h: "1B", a: "2A", s: "0-3" }; // #74
    const final = { g: "Final", ph: 1, h: "W73", a: "W74" }; // #75
    M.push(r32a, r32b, final);
    const r = bracketResolve(M, GROUPS);
    expect(r.get(r32a).num).toBe(73);
    expect(r.get(final).h).toBe(r.get(r32a).h); // home of #73 won 2-1
    expect(r.get(final).a).toBe(r.get(r32b).a); // away of #74 won 0-3
  });

  it("overlays real teams from the live knockout feed (koMap wins)", () => {
    const M = [...groupGames("A"), ...groupGames("B")];
    M.forEach((m) => (m.s = "1-0"));
    const r32 = { g: "R32", ph: 1, dt: "2026-06-28T20:00:00+01:00", h: "1A", a: "2B" };
    M.push(r32);
    const koMap = { "R32|2026-06-28T20:00:00+01:00|1A|2B": { h: "Egypt", a: "Australia" } };
    const r = bracketResolve(M, GROUPS, koMap);
    expect(r.get(r32).h).toBe("Egypt"); // feed overrides placeholder resolution
    expect(r.get(r32).a).toBe("Australia");
    expect(r.thirdsProvisional).toBe(false); // feed present → no longer provisional
  });

  it("advances the winner flag on a level knockout (penalty shootout)", () => {
    const M = [...groupGames("A"), ...groupGames("B")];
    M.forEach((m) => (m.s = "1-0"));
    const r32 = { g: "R32", ph: 1, dt: "2026-06-28T20:00:00+01:00", h: "1A", a: "2B", s: "1-1", w: "a" };
    const next = { g: "Final", ph: 1, dt: "2026-07-19T20:00:00+01:00", h: "W73", a: "1B" };
    M.push(r32, next);
    const r = bracketResolve(M, GROUPS);
    // even though full-time is level, the feed winner flag (away) advances
    expect(r.get(next).h).toBe(r.get(r32).a);
  });

  it("does not crash on a level knockout score (penalties undeterminable)", () => {
    const M = [...groupGames("A"), ...groupGames("B")];
    M.forEach((m) => (m.s = "1-0"));
    const r32 = { g: "R16", ph: 1, h: "1A", a: "2B", s: "1-1" };
    const next = { g: "Final", ph: 1, h: "W73", a: "1B" };
    M.push(r32, next);
    const r = bracketResolve(M, GROUPS);
    expect(r.get(next).h).toBeNull(); // winner unknown on a draw
  });
});

describe("qualScenarios", () => {
  const G = { A: ["A1", "A2", "A3", "A4"] };

  it("returns null before a group starts or after it ends", () => {
    const none = [
      { g: "A", h: "A1", a: "A2" },
      { g: "A", h: "A3", a: "A4" },
    ];
    expect(qualScenarios("A", G, none)).toBeNull(); // nothing played
  });

  it("marks a runaway team as qualified and a winless team as out", () => {
    // Round 1 + 2 played: A1 and A2 win both; A3/A4 lose both. One round left.
    const M = [
      { g: "A", h: "A1", a: "A3", s: "3-0" },
      { g: "A", h: "A2", a: "A4", s: "3-0" },
      { g: "A", h: "A1", a: "A4", s: "3-0" },
      { g: "A", h: "A2", a: "A3", s: "3-0" },
      // remaining: A1 v A2, A3 v A4
      { g: "A", h: "A1", a: "A2" },
      { g: "A", h: "A3", a: "A4" },
    ];
    const r = qualScenarios("A", G, M);
    expect(r.status.A1).toBe("q"); // 6 pts, can't drop out of top 2
    expect(r.status.A2).toBe("q");
    expect(r.status.A3).toBe("out"); // 0 pts, max 3 — can't catch A1/A2 on 6+
    expect(r.status.A4).toBe("out");
    expect(r.remaining).toBe(2);
  });

  it("gives a next-match hint for a team still in contention", () => {
    // Tighter group: after 2 rounds several teams alive.
    const M = [
      { g: "A", h: "A1", a: "A2", s: "1-0" },
      { g: "A", h: "A3", a: "A4", s: "1-0" },
      { g: "A", h: "A1", a: "A3", s: "0-0" },
      { g: "A", h: "A2", a: "A4", s: "0-0" },
      { g: "A", h: "A1", a: "A4" },
      { g: "A", h: "A2", a: "A3" },
    ];
    const r = qualScenarios("A", G, M);
    expect(["q", "live"]).toContain(r.status.A1);
    // every team's hint is null or one of the expected guarantees
    Object.values(r.hint).forEach((hn) => expect([null, "win", "draw"]).toContain(hn));
  });
});

describe("cleanSheetsByTeam", () => {
  it("counts shut-outs, credits both teams on a 0-0, and ignores placeholders/unplayed", () => {
    const M = [
      { h: "A", a: "B", s: "2-0" }, // A clean sheet
      { h: "C", a: "A", s: "0-0" }, // both clean sheets
      { h: "A", a: "D", s: "3-1" }, // no clean sheet
      { h: "B", a: "C", s: "1-2" }, // none
      { h: "E", a: "F", ph: 1, s: "1-0" }, // placeholder → ignored
      { h: "G", a: "H" }, // unplayed → ignored
    ];
    const r = cleanSheetsByTeam(M);
    const map = Object.fromEntries(r.map((x) => [x.t, x.cs]));
    expect(map.A).toBe(2); // shut out B, then 0-0 vs C
    expect(map.C).toBe(1); // the 0-0
    expect(map.B).toBeUndefined(); // never kept a clean sheet
    expect(r[0].t).toBe("A"); // sorted by count desc
  });

  it("returns an empty list when nothing has been played", () => {
    expect(cleanSheetsByTeam([{ h: "A", a: "B" }])).toEqual([]);
  });
});

describe("normTeam", () => {
  it("lowercases, strips accents and collapses whitespace", () => {
    expect(normTeam("  Côte  d'Ivoire ")).toBe("ivory coast"); // accent + alias + punctuation
    expect(normTeam("CURAÇAO")).toBe("curacao");
  });
  it("resolves known aliases", () => {
    expect(normTeam("Türkiye")).toBe("turkey");
    expect(normTeam("Korea Republic")).toBe("south korea");
    expect(normTeam("United States of America")).toBe("usa");
    expect(normTeam("Czechia")).toBe("czech republic");
    expect(normTeam("Congo DR")).toBe("dr congo");
  });
  it("is idempotent and null-safe", () => {
    expect(normTeam(normTeam("Bosnia & Herzegovina"))).toBe("bosnia herzegovina");
    expect(normTeam(null)).toBe("");
    expect(normTeam(undefined)).toBe("");
  });
});

describe("mId", () => {
  it("builds a stable pipe-joined id", () => {
    expect(mId({ dt: "2026-06-11T20:00:00Z", h: "Mexico", a: "South Korea" })).toBe(
      "2026-06-11T20:00:00Z|Mexico|South Korea",
    );
  });
});

describe("mSt", () => {
  const kickoff = new Date("2026-06-11T20:00:00Z");
  const at = (mins) => kickoff.getTime() + mins * 60000;
  it("reports upcoming before kickoff", () => {
    expect(mSt(kickoff, at(-1))).toBe("up");
  });
  it("reports live within the 115-minute window", () => {
    expect(mSt(kickoff, at(0))).toBe("now");
    expect(mSt(kickoff, at(114))).toBe("now");
  });
  it("reports full-time after the window", () => {
    expect(mSt(kickoff, at(115))).toBe("ft");
  });
});

describe("pickScore", () => {
  it("prefers the live feed while a match is in play (beats stale scores.json)", () => {
    // Regression: a stale committed "1-0" must not freeze a live "3-1".
    expect(pickScore("now", "1-0", "3-1")).toBe("3-1");
  });
  it("falls back to the server file when there is no live value mid-match", () => {
    expect(pickScore("now", "2-2", null)).toBe("2-2");
  });
  it("treats the committed file as authoritative once the match is final", () => {
    expect(pickScore("ft", "2-1", "2-0")).toBe("2-1");
  });
  it("uses the live value at full-time only when the file has none yet", () => {
    expect(pickScore("ft", null, "0-0")).toBe("0-0");
  });
  it("returns null when neither source has a score (keep current)", () => {
    expect(pickScore("now", null, null)).toBe(null);
    expect(pickScore("up", null, null)).toBe(null);
  });
});

describe("fuzzy", () => {
  it("matches substrings and subsequences case-insensitively", () => {
    expect(fuzzy("bra", "Brazil")).toBe(true);
    expect(fuzzy("bzl", "Brazil")).toBe(true); // subsequence
    expect(fuzzy("xyz", "Brazil")).toBe(false);
  });
});

describe("icsDate", () => {
  it("renders a compact UTC ICS timestamp", () => {
    expect(icsDate("2026-06-11T20:00:00Z")).toBe("20260611T200000Z");
  });
});

describe("teamForm", () => {
  const M = [
    { dt: "2026-06-01T00:00:00Z", h: "A", a: "B", s: "2-0", g: "X" },
    { dt: "2026-06-02T00:00:00Z", h: "C", a: "A", s: "1-1", g: "X" },
    { dt: "2026-06-03T00:00:00Z", h: "A", a: "D", s: "0-3", g: "X" },
    { dt: "2026-06-04T00:00:00Z", h: "A", a: "E" }, // unplayed, ignored
  ];
  it("derives W/D/L oldest→newest honouring home/away", () => {
    expect(teamForm("A", M)).toEqual(["W", "D", "L"]);
  });
  it("returns empty when a team has no played matches", () => {
    expect(teamForm("Z", M)).toEqual([]);
  });
});

describe("calcStandings", () => {
  const GROUPS = { A: ["W", "X", "Y", "Z"] };
  it("orders by points, then goal difference, then goals for", () => {
    const M = [
      { g: "A", h: "W", a: "X", s: "1-0" }, // W +3
      { g: "A", h: "Y", a: "Z", s: "3-0" }, // Y +3, big GD
      { g: "A", h: "W", a: "Y", s: "2-2" }, // both +1
      { g: "A", h: "X", a: "Z", s: "0-0" }, // both +1
    ];
    const table = calcStandings("A", GROUPS, M);
    expect(table.map((r) => r.t)).toEqual(["Y", "W", "X", "Z"]);
    expect(table[0]).toMatchObject({ t: "Y", pts: 4, gf: 5, ga: 2 });
    expect(table[1]).toMatchObject({ t: "W", pts: 4, gf: 3, ga: 2 });
  });
  it("ignores unplayed fixtures", () => {
    const M = [{ g: "A", h: "W", a: "X" }];
    const table = calcStandings("A", GROUPS, M);
    expect(table.every((r) => r.mp === 0 && r.pts === 0)).toBe(true);
  });
});

describe("predict", () => {
  const TEAM_INFO = { Strong: { rank: 1 }, Weak: { rank: 100 } };
  const M = [];
  it("returns three integers that sum to 100", () => {
    const [h, d, a] = predict("Strong", "Weak", TEAM_INFO, M);
    expect(h + d + a).toBe(100);
    [h, d, a].forEach((p) => expect(p).toBeGreaterThanOrEqual(0));
  });
  it("favours the higher-ranked side", () => {
    const [h, , a] = predict("Strong", "Weak", TEAM_INFO, M);
    expect(h).toBeGreaterThan(a);
  });
  it("is symmetric for evenly matched, formless teams", () => {
    const even = { P: { rank: 20 }, Q: { rank: 20 } };
    const [h, d, a] = predict("P", "Q", even, M);
    expect(h).toBe(a);
    expect(h + d + a).toBe(100);
  });
});

describe("pick'em encode/decode round-trip", () => {
  const M = [
    { dt: "2026-06-11T20:00:00Z", h: "Mexico", a: "South Korea" },
    { dt: "2026-06-12T20:00:00Z", h: "Canada", a: "Qatar" },
    { dt: "2026-06-13T20:00:00Z", h: "Brazil", a: "Morocco" },
  ];
  it("compactVotes/expandVotes round-trips", () => {
    const votes = { [mId(M[0])]: "h", [mId(M[2])]: "a" };
    const compact = compactVotes(votes, M);
    expect(compact).toBe("1-3");
    expect(expandVotes(compact, M)).toEqual(votes);
  });
  it("encodePicks/decodePicks preserves name, picks and favs", () => {
    const votes = { [mId(M[0])]: "h", [mId(M[1])]: "d" };
    const code = encodePicks({ votes, name: "Ahmed", favs: ["Egypt", "Brazil"] }, M);
    const decoded = decodePicks(code);
    expect(decoded).toMatchObject({ v: 1, n: "Ahmed", p: "12-", f: ["Egypt", "Brazil"] });
    expect(expandVotes(decoded.p, M)).toEqual(votes);
  });
  it("clamps name to 20 chars and favs to 9 entries", () => {
    const decoded = decodePicks(
      encodePicks({ votes: {}, name: "x".repeat(40), favs: Array(20).fill("T") }, M),
    );
    expect(decoded.n).toHaveLength(20);
    expect(decoded.f).toHaveLength(9);
  });
  it("decodePicks rejects malformed or unsupported payloads", () => {
    expect(decodePicks("not-base64!!")).toBeNull();
    expect(decodePicks(btoa(JSON.stringify({ v: 2 })))).toBeNull();
    expect(decodePicks("")).toBeNull();
  });
  it("expandVotes ignores junk characters and over-long input", () => {
    expect(expandVotes("9x-", M)).toEqual({});
    expect(expandVotes("111111", M)).toEqual({
      [mId(M[0])]: "h",
      [mId(M[1])]: "h",
      [mId(M[2])]: "h",
    });
  });
});

describe("actualWinner / scoreVotes", () => {
  const M = [
    { dt: "d1", h: "A", a: "B", s: "2-0" }, // home win
    { dt: "d2", h: "C", a: "D", s: "0-1" }, // away win
    { dt: "d3", h: "E", a: "F", s: "1-1" }, // draw
    { dt: "d4", h: "G", a: "H" }, // unplayed
  ];
  it("classifies played matches", () => {
    expect(actualWinner(M[0])).toBe("h");
    expect(actualWinner(M[1])).toBe("a");
    expect(actualWinner(M[2])).toBe("d");
    expect(actualWinner(M[3])).toBeNull();
  });
  it("scores only decided picks", () => {
    const votes = {
      [mId(M[0])]: "h", // correct
      [mId(M[1])]: "h", // wrong
      [mId(M[2])]: "d", // correct
      [mId(M[3])]: "h", // not yet decided
    };
    expect(scoreVotes(votes, M)).toEqual({ pts: 2, total: 4, decided: 3 });
  });
});

describe("buildMatchSchema", () => {
  const M = [
    { dt: "2026-06-11T20:00:00Z", h: "Mexico", a: "South Korea", c: "Mexico City" },
    { dt: "2026-07-19T20:00:00Z", h: "W101", a: "W102", c: "New Jersey", ph: true }, // placeholder
  ];
  const VENUES = { "Mexico City": ["Estadio Azteca", "87,523"] };

  it("emits a valid schema.org ItemList of SportsEvents, skipping placeholders", () => {
    const schema = buildMatchSchema(M, VENUES);
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("ItemList");
    expect(schema.numberOfItems).toBe(1); // placeholder excluded
    expect(schema.itemListElement).toHaveLength(1);
  });

  it("maps team names, venue and start date onto each event", () => {
    const { item, position } = buildMatchSchema(M, VENUES).itemListElement[0];
    expect(position).toBe(1);
    expect(item["@type"]).toBe("SportsEvent");
    expect(item.name).toBe("Mexico vs South Korea");
    expect(item.startDate).toBe("2026-06-11T20:00:00Z");
    expect(item.location.name).toBe("Estadio Azteca, Mexico City");
    expect(item.competitor.map((c) => c.name)).toEqual(["Mexico", "South Korea"]);
  });

  it("produces JSON-serialisable output (used as JSON-LD)", () => {
    expect(() => JSON.stringify(buildMatchSchema(M, VENUES))).not.toThrow();
  });
});

describe("pickFeaturedMatch", () => {
  const now = new Date("2026-06-15T00:00:00Z").getTime();
  const TEAM_INFO = { Brazil: { rank: 5 }, Spain: { rank: 8 }, Haiti: { rank: 90 }, Panama: { rank: 80 } };
  const M = [
    { g: "C", dt: "2026-06-10T20:00:00Z", h: "Brazil", a: "Spain" }, // past — ignored
    { g: "C", dt: "2026-06-16T20:00:00Z", h: "Brazil", a: "Spain" }, // soon + elite
    { g: "L", dt: "2026-06-16T20:00:00Z", h: "Haiti", a: "Panama" }, // soon + weak
    { g: "L", dt: "2026-07-01T20:00:00Z", h: "Brazil", a: "Spain", ph: false }, // far
    { g: "R32", dt: "2026-06-30T20:00:00Z", h: "W1", a: "W2", ph: true }, // placeholder
  ];

  it("prefers a soon, high-quality match over weak or distant ones", () => {
    const m = pickFeaturedMatch(M, TEAM_INFO, now);
    expect(m).toMatchObject({ h: "Brazil", a: "Spain", dt: "2026-06-16T20:00:00Z" });
  });

  it("ignores past matches and placeholders", () => {
    const onlyPastAndPlaceholder = [
      { g: "C", dt: "2026-06-10T20:00:00Z", h: "Brazil", a: "Spain" },
      { g: "R32", dt: "2026-06-30T20:00:00Z", h: "W1", a: "W2", ph: true },
    ];
    expect(pickFeaturedMatch(onlyPastAndPlaceholder, TEAM_INFO, now)).toBeNull();
  });

  it("returns null when there are no matches", () => {
    expect(pickFeaturedMatch([], TEAM_INFO, now)).toBeNull();
  });
});

describe("tournamentStats", () => {
  const M = [
    { g: "A", h: "A", a: "B", s: "2-0" }, // home win, clean sheet, tot 2, diff 2
    { g: "A", h: "C", a: "D", s: "1-1" }, // draw, tot 2
    { g: "B", h: "E", a: "F", s: "0-3" }, // away win, clean sheet, tot 3, diff 3
    { g: "B", h: "G", a: "H" }, // unplayed, ignored
  ];
  it("aggregates counts, goals and averages over played matches", () => {
    const s = tournamentStats(M);
    expect(s.count).toBe(3);
    expect(s.goals).toBe(7);
    expect(s.avg).toBeCloseTo(2.33, 2);
    expect(s).toMatchObject({ homeWins: 1, draws: 1, awayWins: 1, clean: 2 });
  });
  it("identifies the highest-scoring and biggest-win matches", () => {
    const s = tournamentStats(M);
    expect(s.high.tot).toBe(3);
    expect(s.high.m.s).toBe("0-3");
    expect(s.big.diff).toBe(3);
  });
  it("is all-zero with no played matches", () => {
    expect(tournamentStats([{ g: "A", h: "A", a: "B" }])).toMatchObject({
      count: 0,
      goals: 0,
      avg: 0,
      homeWins: 0,
      draws: 0,
      awayWins: 0,
      high: null,
      big: null,
    });
  });
});

describe("anyLiveNow", () => {
  const base = new Date("2026-06-15T20:00:00Z").getTime();
  const M = [{ dt: "2026-06-15T20:00:00Z", h: "A", a: "B" }];
  it("is true while a real match is in its live window", () => {
    expect(anyLiveNow(M, base + 10 * 60000)).toBe(true);
    expect(anyLiveNow(M, base + 114 * 60000)).toBe(true);
  });
  it("is false before kickoff, after full-time, and for placeholders", () => {
    expect(anyLiveNow(M, base - 60000)).toBe(false);
    expect(anyLiveNow(M, base + 120 * 60000)).toBe(false);
    expect(anyLiveNow([{ dt: "2026-06-15T20:00:00Z", h: "W1", a: "W2", ph: true }], base + 10 * 60000)).toBe(false);
  });
});

describe("parseInitialTab", () => {
  const valid = ["schedule", "groups", "bracket", "stats", "league"];
  it("prefers ?tab= over the hash", () => {
    expect(parseInitialTab("?tab=bracket", "#groups", valid)).toBe("bracket");
  });
  it("falls back to the hash", () => {
    expect(parseInitialTab("", "#stats", valid)).toBe("stats");
    expect(parseInitialTab("?x=1", "#league", valid)).toBe("league");
  });
  it("returns null for unknown or missing tabs", () => {
    expect(parseInitialTab("?tab=nope", "#nope", valid)).toBeNull();
    expect(parseInitialTab("", "", valid)).toBeNull();
  });
});

describe("teamTournament", () => {
  const fx = [
    { g: "A", dt: "2026-06-12T01:00:00Z", h: "Mexico", a: "South Africa", s: "2-0" },
    { g: "A", dt: "2026-06-18T01:00:00Z", h: "South Korea", a: "Mexico", s: "1-1" },
    { g: "A", dt: "2026-06-25T01:00:00Z", h: "Mexico", a: "Czech Republic", s: "0-3" },
    { g: "A", dt: "2026-07-01T01:00:00Z", h: "Mexico", a: "X", s: null }, // unplayed → ignored
    { g: "R32", dt: "2026-07-05T01:00:00Z", h: "1A", a: "2B", ph: 1 }, // placeholder → ignored
  ];
  it("aggregates W/D/L, goals and goal difference for a team", () => {
    expect(teamTournament("Mexico", fx)).toEqual({ played: 3, w: 1, d: 1, l: 1, gf: 3, ga: 4, gd: -1 });
  });
  it("counts away appearances correctly", () => {
    expect(teamTournament("South Africa", fx)).toEqual({ played: 1, w: 0, d: 0, l: 1, gf: 0, ga: 2, gd: -2 });
  });
  it("returns an all-zero record for a team with no played matches", () => {
    expect(teamTournament("Brazil", fx)).toEqual({ played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0 });
  });
});
