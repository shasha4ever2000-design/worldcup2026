// Auto-updater for scores.json
// Reads the fixtures baked into index.html, polls TheSportsDB for finished
// matches across all dates that still have a null result, and writes any
// newly finished scores into scores.json. Designed to run from a GitHub Action.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { normTeam } from "./src/logic.mjs";

const HTML = readFileSync("index.html", "utf8");
const SCORES_PATH = "scores.json";

// --- Extract the M=[...] fixture array out of index.html -------------------
const startTag = "const M=[";
const startIdx = HTML.indexOf(startTag);
if (startIdx < 0) {
  console.error("Could not find `const M=[` in index.html");
  process.exit(1);
}
const endIdx = HTML.indexOf("];", startIdx);
const arrSrc = HTML.slice(startIdx + "const M=".length, endIdx + 1);
// The array literal uses unquoted keys (g:, dt:, h:, a:, c:, s:), so use eval.
// This runs only in CI on our own file, so it is safe.
let fixtures;
try {
  fixtures = eval(arrSrc);
} catch (e) {
  console.error("Failed to parse M array:", e.message);
  process.exit(1);
}
console.log(`Loaded ${fixtures.length} fixtures from index.html`);

// --- Load existing scores --------------------------------------------------
const scores = existsSync(SCORES_PATH)
  ? JSON.parse(readFileSync(SCORES_PATH, "utf8"))
  : {};

// --- Team-name normaliser is imported from src/logic.mjs (single source) ---

// --- Decide which calendar dates to query ----------------------------------
// Every fixture whose kickoff is in the past AND has no score yet.
// Also include the day before and after to absorb timezone drift.
const now = Date.now();
const dates = new Set();
for (const m of fixtures) {
  if (m.ph) continue;
  const dt = new Date(m.dt).getTime();
  if (dt > now) continue;
  const key = `${m.dt}|${m.h}|${m.a}`;
  if (scores[key]) continue;
  for (let offset = -1; offset <= 1; offset++) {
    const dx = new Date(dt + offset * 86400000);
    dates.add(dx.toISOString().slice(0, 10));
  }
}
console.log(`Querying ${dates.size} day(s):`, [...dates].sort().join(", "));

// --- Pull each day from TheSportsDB ----------------------------------------
async function fetchDay(d) {
  const url = `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${d}&s=Soccer`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  ${d}: HTTP ${res.status}`);
    return [];
  }
  const j = await res.json();
  return (j.events || []).filter(e =>
    /world cup/i.test(e.strLeague || "") &&
    !/wom|u-?[12]?\d|qualif|youth|futsal|beach|club/i.test(e.strLeague || "")
  );
}

// --- Fallback: per-team lookup for any fixture we still couldn't fill ------
const teamIdCache = new Map();
async function lookupTeamId(name) {
  if (teamIdCache.has(name)) return teamIdCache.get(name);
  try {
    const r = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(name)}`
    );
    if (!r.ok) return null;
    const j = await r.json();
    const team = (j.teams || []).find(
      t => t.strSport === "Soccer" && normTeam(t.strTeam) === normTeam(name)
    );
    const id = team ? team.idTeam : null;
    teamIdCache.set(name, id);
    return id;
  } catch {
    teamIdCache.set(name, null);
    return null;
  }
}

let changed = 0;
const finishedStatus = /(FT|AET|PEN|Match Finished|Finished)/i;

function applyEvent(e, source) {
  const hs = e.intHomeScore, as = e.intAwayScore;
  if (hs == null || hs === "" || as == null || as === "") return;
  if (!finishedStatus.test(e.strStatus || "")) return;
  const H = normTeam(e.strHomeTeam), A = normTeam(e.strAwayTeam);
  const m = fixtures.find(f => {
    if (f.ph) return false;
    const mh = normTeam(f.h), ma = normTeam(f.a);
    return (mh === H && ma === A) || (mh === A && ma === H);
  });
  if (!m) return;
  const key = `${m.dt}|${m.h}|${m.a}`;
  const sc = normTeam(m.h) === H ? `${hs}-${as}` : `${as}-${hs}`;
  if (scores[key] === sc) return;
  scores[key] = sc;
  changed++;
  console.log(`  [${source}] ${key} -> ${sc}`);
}

// 1) Day-by-day pass
for (const d of [...dates].sort()) {
  const evs = await fetchDay(d);
  for (const e of evs) applyEvent(e, `day ${d}`);
}

// 2) Per-team backup pass for any fixture still without a score
const stillMissing = fixtures.filter(m => {
  if (m.ph) return false;
  if (new Date(m.dt).getTime() > now) return false;
  return !scores[`${m.dt}|${m.h}|${m.a}`];
});
console.log(`After day pass, ${stillMissing.length} fixture(s) still missing`);
for (const m of stillMissing) {
  for (const teamName of [m.h, m.a]) {
    const id = await lookupTeamId(teamName);
    if (!id) continue;
    try {
      const r = await fetch(`https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=${id}`);
      if (!r.ok) continue;
      const j = await r.json();
      for (const e of j.results || []) applyEvent(e, `team ${teamName}`);
    } catch {}
    if (scores[`${m.dt}|${m.h}|${m.a}`]) break;
  }
}

// --- Write back if anything changed ----------------------------------------
if (changed > 0) {
  writeFileSync(SCORES_PATH, JSON.stringify(scores, null, 2) + "\n");
  console.log(`Wrote ${changed} update(s) to ${SCORES_PATH}`);
} else {
  console.log("No score updates");
}
