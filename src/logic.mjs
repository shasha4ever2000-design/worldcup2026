// ---------------------------------------------------------------------------
// Canonical pure logic for the World Cup 2026 site.
//
// These functions are faithful, dependency-injected copies of the logic that
// runs inline inside index.html. Keeping a single tested copy here lets us:
//   * unit-test the standings / prediction / pick'em maths,
//   * share the team-name normaliser with the score-updater scripts,
//   * guard the in-page copies from silently drifting (see tests/parity.test.mjs).
//
// Everything here is pure: no DOM, no globals, no network. Anything that the
// browser version reads from a global (M, GROUPS, votes, favs, Date.now) is
// passed in as an argument instead.
// ---------------------------------------------------------------------------

// Team-name aliases — keep in sync with the `al` map inside normTeam in
// index.html. The parity test enforces this.
export const ALIASES = {
  "turkiye": "turkey",
  "korea republic": "south korea",
  "republic of korea": "south korea",
  "ir iran": "iran",
  "united states": "usa",
  "united states of america": "usa",
  "czechia": "czech republic",
  "cote d ivoire": "ivory coast",
  "cabo verde": "cape verde",
  "cape verde islands": "cape verde",
  "bosnia and herzegovina": "bosnia herzegovina",
  "congo dr": "dr congo",
  "democratic republic of congo": "dr congo",
};

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Normalise a team name to a canonical, accent-free, alias-resolved form. */
export function normTeam(x) {
  x = (x || "").toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
  for (const ch of "&.'`-/") x = x.split(ch).join(" ");
  x = x.replace(/\s+/g, " ").trim();
  return ALIASES[x] || x;
}

/** Stable id for a fixture: "<iso>|<home>|<away>". */
export function mId(m) {
  return m.dt + "|" + m.h + "|" + m.a;
}

/**
 * Match status relative to `now`:
 *   "now" within 115 minutes of kickoff, "ft" after, "up" before.
 */
export function mSt(d, now = Date.now()) {
  const x = d.getTime();
  if (now >= x && now < x + 115 * 6e4) return "now";
  return now >= x + 115 * 6e4 ? "ft" : "up";
}

/** True if any real match is in its live window right now — drives faster polling. */
export function anyLiveNow(M, now = Date.now()) {
  return M.some((m) => !m.ph && mSt(new Date(m.dt), now) === "now");
}

/**
 * Reconcile a fixture's score from the two client sources:
 *   - `server`: the committed scores.json (durable, but delayed by GitHub Pages
 *     redeploys, which are throttled and can lag minutes→hours).
 *   - `live`: TheSportsDB, fetched directly by the browser (real-time, no lag).
 *
 * While a match is in play we trust the live feed so users see goals within
 * seconds; once it's finished the committed file is authoritative. Returns the
 * score string to show, or null when neither source has one (keep current).
 */
export function pickScore(status, server, live) {
  if (status === "now") return live != null ? live : server != null ? server : null;
  return server != null ? server : live != null ? live : null; // "ft" / "up"
}

/** Subsequence fuzzy match used by the search box. */
export function fuzzy(q, s) {
  q = q.toLowerCase();
  s = s.toLowerCase();
  if (s.includes(q)) return true;
  let i = 0;
  for (const c of s) {
    if (c === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

/** ICS UTC timestamp, e.g. 20260611T200000Z. */
export function icsDate(d) {
  return new Date(d).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** Last-five W/D/L form for a team, oldest→newest, from played fixtures. */
export function teamForm(team, M) {
  const ms = M
    .filter((m) => (m.h === team || m.a === team) && m.s)
    .sort((a, b) => new Date(a.dt) - new Date(b.dt));
  return ms.slice(-5).map((m) => {
    const [h, a] = m.s.split("-").map(Number);
    const gf = m.h === team ? h : a;
    const ga = m.h === team ? a : h;
    return gf > ga ? "W" : gf < ga ? "L" : "D";
  });
}

/**
 * Win/draw/loss probabilities (percent, summing to 100) from FIFA ranking and
 * recent form. Mirrors the in-page model exactly.
 */
export function predict(h, a, TEAM_INFO, M) {
  const rk = (x) => (TEAM_INFO[x] && TEAM_INFO[x].rank ? TEAM_INFO[x].rank : 50);
  const fp = (x) => teamForm(x, M).reduce((s, r) => s + (r === "W" ? 5 : r === "D" ? 2 : 0), 0);
  const Rh = 100 - rk(h) + fp(h),
    Ra = 100 - rk(a) + fp(a),
    diff = Rh - Ra;
  let pH = 1 / (1 + Math.pow(10, -diff / 18)),
    pA = 1 - pH;
  const dw = 0.28 * Math.exp(-Math.pow(diff / 45, 2));
  let x = pH * (1 - dw),
    z = pA * (1 - dw),
    y = dw,
    tot = x + y + z;
  let H = Math.round((x / tot) * 100),
    D = Math.round((y / tot) * 100),
    A = 100 - H - D;
  if (A < 0) {
    D += A; // keep the three values summing to 100 without a negative away %
    A = 0;
  }
  return [H, D, A];
}

/**
 * Group standings sorted by points, then goal difference, then goals for.
 * Mirrors calcStandings in index.html.
 */
export function calcStandings(grp, GROUPS, M) {
  const ts = GROUPS[grp].map((t) => ({ t, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
  M.filter((m) => m.g === grp && m.s).forEach((m) => {
    const [gh, ga] = m.s.split("-").map(Number),
      H = ts.find((x) => x.t === m.h),
      A = ts.find((x) => x.t === m.a);
    if (!H || !A) return;
    H.mp++;
    A.mp++;
    H.gf += gh;
    H.ga += ga;
    A.gf += ga;
    A.ga += gh;
    if (gh > ga) {
      H.w++;
      H.pts += 3;
      A.l++;
    } else if (gh < ga) {
      A.w++;
      A.pts += 3;
      H.l++;
    } else {
      H.d++;
      A.d++;
      H.pts++;
      A.pts++;
    }
  });
  return ts.sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf);
}

/**
 * Group qualification scenarios. Brute-forces every remaining-result combination
 * (each remaining game treated as a generic win/draw/loss) to classify each team:
 *   "q"    mathematically through to the top 2 in every scenario
 *   "out"  cannot reach the top 2 in any scenario
 *   "live" still in contention
 * and, for live teams, the simplest guarantee from their next match
 * ("win" or "draw"). Mirrors qualScenarios in index.html.
 *
 * Returns null when the group hasn't started or is already complete (no drama to
 * project). A simplified projection — it ignores goal-margin and head-to-head
 * tiebreakers, matching the "for fun, not betting" spirit of the predictions.
 */
export function qualScenarios(grp, GROUPS, M) {
  const teams = GROUPS[grp];
  const played = M.filter((m) => m.g === grp && m.s && !m.ph && m.h && m.a);
  const remaining = M.filter((m) => m.g === grp && !m.s && !m.ph && m.h && m.a);
  if (!remaining.length || !played.length) return null;

  const apply = (tbl, h, a, gh, ga) => {
    tbl[h].gf += gh;
    tbl[h].ga += ga;
    tbl[a].gf += ga;
    tbl[a].ga += gh;
    if (gh > ga) tbl[h].pts += 3;
    else if (ga > gh) tbl[a].pts += 3;
    else {
      tbl[h].pts++;
      tbl[a].pts++;
    }
  };
  const base = () => {
    const tbl = {};
    teams.forEach((x) => (tbl[x] = { t: x, pts: 0, gf: 0, ga: 0 }));
    played.forEach((m) => {
      const [gh, ga] = m.s.split("-").map(Number);
      apply(tbl, m.h, m.a, gh, ga);
    });
    return tbl;
  };
  const top2 = (tbl) => {
    const arr = Object.values(tbl).sort(
      (a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf
    );
    return new Set([arr[0].t, arr[1].t]);
  };

  const n = remaining.length;
  const total = 3 ** n;
  const sets = [];
  const outcomes = [];
  for (let mask = 0; mask < total; mask++) {
    const tbl = base();
    const os = [];
    let mm = mask;
    for (let j = 0; j < n; j++) {
      const o = mm % 3;
      mm = Math.floor(mm / 3);
      os.push(o);
      const g = remaining[j];
      apply(tbl, g.h, g.a, o === 0 ? 1 : 0, o === 2 ? 1 : 0);
    }
    sets.push(top2(tbl));
    outcomes.push(os);
  }

  const status = {};
  const hint = {};
  teams.forEach((x) => {
    let inAll = true;
    let inAny = false;
    for (const s of sets) {
      if (s.has(x)) inAny = true;
      else inAll = false;
    }
    status[x] = inAll ? "q" : !inAny ? "out" : "live";
    hint[x] = null;
    if (status[x] === "live") {
      const j = remaining.findIndex((m) => m.h === x || m.a === x);
      if (j >= 0) {
        const winO = remaining[j].h === x ? 0 : 2;
        const guarantees = (o) => {
          let any = false;
          for (let k = 0; k < total; k++) {
            if (outcomes[k][j] !== o) continue;
            any = true;
            if (!sets[k].has(x)) return false;
          }
          return any;
        };
        hint[x] = guarantees(winO) ? "win" : guarantees(1) ? "draw" : null;
      }
    }
  });
  return { status, hint, remaining: n };
}

/**
 * Resolve the knockout bracket's placeholder slots into real teams as results
 * come in. Mirrors bracketResolve in index.html.
 *
 * Slot codes used in the fixture list:
 *   "1A".."2L"  group winner / runner-up (resolved once that group is complete)
 *   "3·ABCDF"   one of the eight best third-placed teams (eligible groups listed)
 *   "W73"/"L101" winner / loser of knockout match #73 / #101
 *
 * Returns a Map keyed by the knockout match object → { h, a, num } where h/a are
 * resolved team names (or null if not yet known), plus `.thirdsProvisional`
 * (true when best-third slots were filled by ranking — the exact slotting follows
 * FIFA's official allocation table). Knockout matches keep FIFA's 73..104 numbering
 * in fixture order.
 */
export function bracketResolve(M, GROUPS) {
  const ko = M.filter((m) => m.ph);
  const byNum = new Map();
  let n = 73;
  for (const m of ko) {
    m.__num = n;
    byNum.set(n, m);
    n++;
  }

  const groups = Object.keys(GROUPS);
  const standings = {};
  const complete = {};
  groups.forEach((g) => {
    standings[g] = calcStandings(g, GROUPS, M);
    const teams = GROUPS[g].length;
    complete[g] = M.filter((m) => m.g === g && m.s).length >= (teams * (teams - 1)) / 2;
  });

  // Best third-placed teams, ranked, once every group has finished.
  const allComplete = groups.every((g) => complete[g]);
  const thirdSlot = {}; // slot code -> team name
  let thirdsProvisional = false;
  if (allComplete) {
    const thirds = groups
      .map((g) => ({ g, ...standings[g][2] }))
      .sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || a.g.localeCompare(b.g));
    const qualified = thirds.slice(0, 8);
    const qSet = new Set(qualified.map((x) => x.g));
    const byGroup = {};
    qualified.forEach((x) => (byGroup[x.g] = x.t));
    // The eight third-place slots, each eligible for a fixed set of groups.
    const slots = ko
      .map((m) => [m.h, m.a])
      .flat()
      .filter((c) => typeof c === "string" && c.indexOf("3·") === 0);
    const uniqueSlots = [...new Set(slots)];
    // Assign each slot a still-unused qualified group from its eligible list
    // (constrained matching). Exact official slotting follows FIFA's table.
    const used = new Set();
    const assign = (i) => {
      if (i >= uniqueSlots.length) return true;
      const code = uniqueSlots[i];
      const eligible = code.slice(code.indexOf("·") + 1).split("");
      for (const g of eligible) {
        if (qSet.has(g) && !used.has(g)) {
          used.add(g);
          thirdSlot[code] = byGroup[g];
          if (assign(i + 1)) return true;
          used.delete(g);
          thirdSlot[code] = undefined;
        }
      }
      return false;
    };
    if (uniqueSlots.length) {
      assign(0);
      thirdsProvisional = true;
    }
  }

  const cache = new Map();
  const resolveCode = (code) => {
    if (typeof code !== "string") return code || null;
    if (cache.has(code)) return cache.get(code);
    cache.set(code, null); // guard against cycles
    let team = null;
    if (/^[12][A-L]$/.test(code)) {
      const g = code[1];
      if (complete[g]) team = standings[g][code[0] === "1" ? 0 : 1].t;
    } else if (code.indexOf("3·") === 0) {
      team = thirdSlot[code] || null;
    } else if (/^[WL]\d+$/.test(code)) {
      const mm = byNum.get(+code.slice(1));
      team = code[0] === "W" ? winnerOf(mm) : loserOf(mm);
    }
    cache.set(code, team);
    return team;
  };
  const side = (m, s) => (m.ph ? resolveCode(m[s]) : m[s]);
  function decided(m) {
    if (!m || !m.s) return null;
    const h = side(m, "h");
    const a = side(m, "a");
    if (!h || !a) return null;
    const [gh, ga] = m.s.split("-").map(Number);
    if (gh === ga) return null; // level after 90/ET → penalties, undeterminable here
    return { win: gh > ga ? h : a, lose: gh > ga ? a : h };
  }
  function winnerOf(m) {
    const d = decided(m);
    return d ? d.win : null;
  }
  function loserOf(m) {
    const d = decided(m);
    return d ? d.lose : null;
  }

  const out = new Map();
  ko.forEach((m) => out.set(m, { h: side(m, "h"), a: side(m, "a"), num: m.__num }));
  out.thirdsProvisional = thirdsProvisional;
  return out;
}

// ----------------------------- Pick'em league ------------------------------

export const VC = { h: "1", d: "2", a: "3" };
export const VCR = { "1": "h", "2": "d", "3": "a" };

/** Encode a votes map into a compact per-fixture string ("1"/"2"/"3"/"-"). */
export function compactVotes(votes, M) {
  return M.map((m) => VC[votes[mId(m)]] || "-").join("");
}

/** Inverse of compactVotes: expand a compact string back into a votes map. */
export function expandVotes(s, M) {
  const out = {};
  if (typeof s !== "string") return out;
  for (let i = 0; i < Math.min(s.length, M.length); i++) {
    const v = VCR[s[i]];
    if (v) out[mId(M[i])] = v;
  }
  return out;
}

/** Serialise a member's picks to a URL-safe base64 payload. */
export function encodePicks({ votes = {}, name = "", favs = [] }, M) {
  const payload = { v: 1, n: (name || "").slice(0, 20), p: compactVotes(votes, M), f: favs.slice(0, 9) };
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/=+$/, "");
  } catch {
    return "";
  }
}

/**
 * Parse a pick'em payload; returns null on malformed/unsupported input.
 * Pads to a valid base64 length so it works under both the browser's lenient
 * atob and Node's strict atob (the in-page copy appends "===", which only the
 * browser tolerates).
 */
export function decodePicks(s) {
  try {
    if (typeof s !== "string" || !s) return null;
    const pad = s + "=".repeat((4 - (s.length % 4)) % 4);
    const j = JSON.parse(decodeURIComponent(escape(atob(pad))));
    if (j && j.v === 1) return j;
  } catch {}
  return null;
}

/** Winner of a played match: "h" | "d" | "a", or null if not yet played. */
export function actualWinner(m) {
  if (!m.s) return null;
  const [h, a] = m.s.split("-").map(Number);
  return h > a ? "h" : h < a ? "a" : "d";
}

/** Score a votes map against actual results. */
export function scoreVotes(v, M) {
  let pts = 0,
    total = 0,
    decided = 0;
  M.forEach((m) => {
    const pick = v[mId(m)];
    if (!pick) return;
    total++;
    const w = actualWinner(m);
    if (w == null) return;
    decided++;
    if (w === pick) pts++;
  });
  return { pts, total, decided };
}

// --------------------------- Match to Watch --------------------------------

/**
 * Pick the most attention-worthy upcoming match — soonest + strongest teams,
 * weighted up for knockout stages. Returns null when nothing is upcoming.
 * Pure: `now` is injected for testability.
 */
export function pickFeaturedMatch(M, TEAM_INFO = {}, now = Date.now()) {
  const rank = (tm) => (TEAM_INFO[tm] && TEAM_INFO[tm].rank ? TEAM_INFO[tm].rank : 50);
  const stageBonus = { Final: 60, SF: 45, QF: 35, "3rd": 28, R16: 25, R32: 18 };
  const upcoming = M.filter((m) => !m.ph && m.h && m.a && new Date(m.dt).getTime() >= now);
  let best = null,
    bestScore = -Infinity;
  for (const m of upcoming) {
    const hoursAway = (new Date(m.dt).getTime() - now) / 3.6e6;
    const quality = 100 - rank(m.h) + (100 - rank(m.a)); // higher = stronger teams
    const stage = stageBonus[m.g] || 0;
    const proximity = hoursAway <= 36 ? 40 : Math.max(0, 30 - hoursAway / 24);
    const score = quality + stage + proximity;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/**
 * Aggregate tournament statistics from played matches. Pure & testable.
 * Returns counts plus the highest-scoring and biggest-win matches.
 */
export function tournamentStats(M) {
  const played = M.filter((m) => m.s);
  let goals = 0, clean = 0, homeWins = 0, draws = 0, awayWins = 0, high = null, big = null;
  for (const m of played) {
    const [h, a] = m.s.split("-").map(Number);
    goals += h + a;
    if (h === 0 || a === 0) clean++;
    if (h > a) homeWins++;
    else if (h < a) awayWins++;
    else draws++;
    if (!high || h + a > high.tot) high = { m, tot: h + a };
    if (!big || Math.abs(h - a) > big.diff) big = { m, diff: Math.abs(h - a) };
  }
  return {
    count: played.length,
    goals,
    avg: played.length ? Math.round((goals / played.length) * 100) / 100 : 0,
    clean,
    homeWins,
    draws,
    awayWins,
    high,
    big,
  };
}

/**
 * Per-team tournament record from played matches: matches, W/D/L, goals for /
 * against and goal difference. Powers the head-to-head comparison tool. Pure.
 */
export function teamTournament(team, M) {
  let played = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0;
  for (const m of M) {
    if (m.ph || !m.s) continue;
    if (m.h !== team && m.a !== team) continue;
    const [h, a] = m.s.split("-").map(Number);
    const isH = m.h === team;
    const f = isH ? h : a, against = isH ? a : h;
    played++;
    gf += f;
    ga += against;
    if (f > against) w++;
    else if (f < against) l++;
    else d++;
  }
  return { played, w, d, l, gf, ga, gd: gf - ga };
}

/**
 * Resolve the initial tab from a URL: ?tab=<id> takes precedence, then #<id>.
 * Returns the matching tab id from `valid`, or null. Pure & testable.
 */
export function parseInitialTab(search, hash, valid) {
  let q = "";
  try {
    q = new URLSearchParams(search || "").get("tab") || "";
  } catch {}
  const h = (hash || "").replace(/^#/, "");
  if (valid.includes(q)) return q;
  if (valid.includes(h)) return h;
  return null;
}

// ------------------------------- SEO schema --------------------------------

/**
 * Build a schema.org ItemList of SportsEvent entries from the fixture list —
 * one per real (non-placeholder) match. Injected as JSON-LD for rich results.
 */
export function buildMatchSchema(
  M,
  VENUES = {},
  baseUrl = "https://shasha4ever2000-design.github.io/worldcup2026/",
) {
  const itemListElement = M.filter((m) => !m.ph && m.h && m.a).map((m, i) => {
    const venue = VENUES[m.c];
    return {
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "SportsEvent",
        name: `${m.h} vs ${m.a}`,
        sport: "Football",
        startDate: m.dt,
        eventStatus: "https://schema.org/EventScheduled",
        location: { "@type": "Place", name: (venue ? venue[0] + ", " : "") + (m.c || "") },
        competitor: [
          { "@type": "SportsTeam", name: m.h },
          { "@type": "SportsTeam", name: m.a },
        ],
        url: baseUrl,
      },
    };
  });
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "FIFA World Cup 2026 Matches",
    numberOfItems: itemListElement.length,
    itemListElement,
  };
}
