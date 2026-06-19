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
  compactVotes,
  expandVotes,
  encodePicks,
  decodePicks,
  actualWinner,
  scoreVotes,
  buildMatchSchema,
} from "../src/logic.mjs";

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
