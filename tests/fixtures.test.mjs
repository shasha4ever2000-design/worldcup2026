import { describe, it, expect } from "vitest";
import { M, GROUPS, VENUES, COORDS, FIXTURES } from "./helpers.mjs";

const KO_STAGES = ["R32", "R16", "QF", "SF", "3rd", "Final"];
const groupMatches = M.filter((m) => GROUPS[m.g]);
const koMatches = M.filter((m) => KO_STAGES.includes(m.g));

describe("tournament shape", () => {
  it("has all 104 matches", () => {
    expect(M).toHaveLength(104);
  });
  it("splits into 72 group-stage and 32 knockout matches", () => {
    expect(groupMatches).toHaveLength(72);
    expect(koMatches).toHaveLength(32);
  });
  it("has 12 groups of 4 teams", () => {
    const groups = Object.keys(GROUPS);
    expect(groups).toHaveLength(12);
    groups.forEach((g) => expect(GROUPS[g]).toHaveLength(4));
  });
  it("accounts for every match by stage", () => {
    expect(groupMatches.length + koMatches.length).toBe(M.length);
  });
});

describe("group-stage integrity", () => {
  it("plays every team exactly 3 times (round-robin) in its group", () => {
    for (const [g, teams] of Object.entries(GROUPS)) {
      const ms = groupMatches.filter((m) => m.g === g);
      expect(ms, `group ${g} match count`).toHaveLength(6); // C(4,2)
      const counts = Object.fromEntries(teams.map((t) => [t, 0]));
      ms.forEach((m) => {
        expect(teams, `${m.h} belongs to group ${g}`).toContain(m.h);
        expect(teams, `${m.a} belongs to group ${g}`).toContain(m.a);
        counts[m.h]++;
        counts[m.a]++;
      });
      teams.forEach((t) => expect(counts[t], `${t} plays 3 group games`).toBe(3));
    }
  });
  it("never lists a team against itself", () => {
    M.forEach((m) => expect(m.h).not.toBe(m.a));
  });
});

describe("venue & date integrity", () => {
  it("every match city has a venue and coordinates", () => {
    M.forEach((m) => {
      expect(VENUES, `venue for ${m.c}`).toHaveProperty(m.c);
      expect(COORDS, `coords for ${m.c}`).toHaveProperty(m.c);
    });
  });
  it("every kickoff is a valid ISO datetime", () => {
    M.forEach((m) => {
      expect(Number.isNaN(new Date(m.dt).getTime()), `dt ${m.dt}`).toBe(false);
    });
  });
  it("matches are within the tournament window (Jun 11 – Jul 20 2026)", () => {
    const lo = new Date("2026-06-11T00:00:00Z").getTime();
    const hi = new Date("2026-07-20T23:59:59Z").getTime();
    M.forEach((m) => {
      const t = new Date(m.dt).getTime();
      expect(t, `dt ${m.dt}`).toBeGreaterThanOrEqual(lo);
      expect(t).toBeLessThanOrEqual(hi);
    });
  });
});

describe("fixtures.json stays in sync with the in-page M array", () => {
  const key = (m) => `${m.g}|${m.dt}|${m.h}|${m.a}`;
  it("describes the same 104 matches", () => {
    expect(FIXTURES).toHaveLength(104);
    const inM = new Set(M.map(key));
    const inJson = new Set(FIXTURES.map(key));
    const onlyJson = [...inJson].filter((k) => !inM.has(k));
    const onlyM = [...inM].filter((k) => !inJson.has(k));
    expect(onlyJson, "fixtures.json entries missing from index.html").toEqual([]);
    expect(onlyM, "index.html fixtures missing from fixtures.json").toEqual([]);
  });
});
