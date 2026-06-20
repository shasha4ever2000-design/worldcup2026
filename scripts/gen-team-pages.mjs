// Generates one static, SEO-friendly page per national team from the site's own
// data (fixtures, groups, FIFA info) — no fabricated squads. Egypt & Saudi
// Arabia are skipped because they have dedicated rich pages (eg.html / sa.html).
// Re-run with `npm run gen:teams`.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { M, GROUPS, TEAM_INFO, CODES, VENUES } from "../tests/helpers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://shasha4ever2000-design.github.io/worldcup2026";

// Teams with their own bespoke landing pages — link to those instead.
const CUSTOM = { Egypt: "eg.html", "Saudi Arabia": "sa.html" };

// Accurate confederation per nation (data, not guessed) + host nations.
const CONFED = {
  Brazil: "CONMEBOL", Argentina: "CONMEBOL", Uruguay: "CONMEBOL", Colombia: "CONMEBOL", Ecuador: "CONMEBOL", Paraguay: "CONMEBOL",
  Spain: "UEFA", France: "UEFA", England: "UEFA", Germany: "UEFA", Portugal: "UEFA", Netherlands: "UEFA", Belgium: "UEFA", Croatia: "UEFA", Switzerland: "UEFA", Austria: "UEFA", Norway: "UEFA", Sweden: "UEFA", Scotland: "UEFA", "Czech Republic": "UEFA", "Bosnia & Herzegovina": "UEFA", Turkey: "UEFA",
  USA: "CONCACAF", Canada: "CONCACAF", Mexico: "CONCACAF", Panama: "CONCACAF", Haiti: "CONCACAF", Curacao: "CONCACAF",
  Morocco: "CAF", Egypt: "CAF", Senegal: "CAF", "Ivory Coast": "CAF", Tunisia: "CAF", Algeria: "CAF", Ghana: "CAF", "Cape Verde": "CAF", "South Africa": "CAF", "DR Congo": "CAF",
  Japan: "AFC", "South Korea": "AFC", Iran: "AFC", "Saudi Arabia": "AFC", Australia: "AFC", Qatar: "AFC", Uzbekistan: "AFC", Jordan: "AFC", Iraq: "AFC",
  "New Zealand": "OFC",
};
const HOSTS = new Set(["USA", "Canada", "Mexico"]);

const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const flagImg = (t, h = 26) => (CODES[t] ? `<img src="https://flagcdn.com/h40/${CODES[t]}.png" width="${h}" height="${Math.round(h * 0.66)}" alt="" loading="lazy" style="vertical-align:middle;border-radius:3px"/>` : "⚽");
const groupOf = (t) => Object.keys(GROUPS).find((g) => GROUPS[g].includes(t));
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const STAGE = { R32: "Round of 32", R16: "Round of 16", QF: "Quarter-final", SF: "Semi-final", "3rd": "Third-place play-off", Final: "Final" };
const stageLabel = (g) => STAGE[g] || `Group ${g}`;


const STYLE = `:root{--ink:#0f172a;--muted:#64748b;--green:#047857;--green-d:#064e3b;--gold:#f59e0b;--line:#e2e8f0}
*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;background:#f8fafc;color:var(--ink);line-height:1.7;padding-bottom:env(safe-area-inset-bottom)}
.wrap{max-width:820px;margin:0 auto;padding:0 16px}
header{background:linear-gradient(135deg,var(--green-d),var(--green));color:#fff;padding:calc(32px + env(safe-area-inset-top)) 16px 28px;text-align:center}
header .fl{font-size:0;margin-bottom:8px}header .fl img{width:64px;height:42px;border-radius:5px}header h1{font-size:24px;font-weight:800;margin-bottom:6px}header p{font-size:14px;opacity:.95;max-width:620px;margin:0 auto}
.cta{display:inline-block;background:var(--gold);color:#022c22;font-weight:800;padding:12px 24px;border-radius:10px;text-decoration:none;margin-top:16px;font-size:14px}
main{padding:24px 0 40px}h2{font-size:20px;font-weight:800;margin:26px 0 12px;color:var(--green-d)}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:8px 16px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.kv{width:100%;border-collapse:collapse;font-size:14px}.kv td{padding:9px 8px;border-bottom:1px solid var(--line)}.kv tr:last-child td{border-bottom:none}.kv td:first-child{font-weight:700;color:var(--green-d);width:42%}
.m{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--line);font-size:15px}.m:last-child{border-bottom:none}
.m .dt{min-width:88px;font-size:12px;color:var(--muted)}.m .tm{flex:1;font-weight:700}.m .sc{font-weight:800;color:var(--green)}.m .vn{font-size:11px;color:var(--muted)}
.grid{display:flex;flex-wrap:wrap;gap:8px}.grid a{background:#ecfdf5;color:var(--green-d);border:1px solid #d1fae5;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:700;text-decoration:none}
footer{text-align:center;font-size:12px;color:var(--muted);padding:20px 16px;border-top:1px solid var(--line);margin-top:24px}footer a{color:var(--green)}`;

function teamHref(t) {
  return CUSTOM[t] || `team/${slug(t)}.html`;
}

function teamPage(team) {
  const g = groupOf(team);
  const info = TEAM_INFO[team] || {};
  const rivals = (GROUPS[g] || []).filter((x) => x !== team);
  const matches = M.filter((m) => m.h === team || m.a === team).sort((a, b) => new Date(a.dt) - new Date(b.dt));
  const url = `${BASE}/team/${slug(team)}.html`;
  const title = `${team} at the FIFA World Cup 2026 — Group ${g}, Fixtures & Guide`;
  const desc = `${team}'s FIFA World Cup 2026 guide: Group ${g} with ${rivals.join(", ")}, full match schedule with dates and venues${info.coach ? `, coached by ${info.coach}` : ""}${info.rank ? `, FIFA ranking #${info.rank}` : ""}.`;
  const rows = matches
    .map((m) => {
      const opp = m.h === team ? m.a : m.h;
      const ha = m.h === team ? "vs" : "at";
      const venue = VENUES[m.c] ? VENUES[m.c][0] : m.c;
      const score = m.s ? `<span class="sc">${esc(m.s)}</span>` : `<span class="vn">${stageLabel(m.g)}</span>`;
      return `<div class="m"><span class="dt">${fmtDate(m.dt)}</span><span class="tm">${ha} ${flagImg(opp, 20)} ${esc(opp)}</span><span class="vn">${esc(m.c)}</span>${score}</div>`;
    })
    .join("");
  const confed = CONFED[team] || info.conf || "";
  const host = HOSTS.has(team);
  const infoRows = [
    g ? `<tr><td>Group</td><td>Group ${g}</td></tr>` : "",
    host ? `<tr><td>Status</td><td>🏠 Host nation</td></tr>` : "",
    confed ? `<tr><td>Confederation</td><td>${esc(confed)}</td></tr>` : "",
    info.rank ? `<tr><td>FIFA ranking</td><td>#${info.rank}</td></tr>` : "",
    info.coach ? `<tr><td>Coach</td><td>${esc(info.coach)}</td></tr>` : "",
    info.qual ? `<tr><td>Qualification</td><td>${esc(info.qual)}</td></tr>` : "",
    `<tr><td>Matches</td><td>${matches.length} scheduled</td></tr>`,
  ].join("");
  // Full group schedule (all six group matches), so visitors see the whole group.
  const groupMatches = g
    ? M.filter((m) => m.g === g).sort((a, b) => new Date(a.dt) - new Date(b.dt))
    : [];
  const groupRows = groupMatches
    .map((m) => {
      const score = m.s ? `<span class="sc">${esc(m.s)}</span>` : `<span class="vn">${fmtDate(m.dt)}</span>`;
      return `<div class="m"><span class="tm">${flagImg(m.h, 18)} ${esc(m.h)} <span style="color:var(--muted);font-weight:600">v</span> ${esc(m.a)} ${flagImg(m.a, 18)}</span>${score}</div>`;
    })
    .join("");
  const jsonld = [
    { "@context": "https://schema.org", "@type": "SportsTeam", name: `${team} national football team`, sport: "Football", memberOf: { "@type": "SportsOrganization", name: "FIFA" }, ...(info.coach ? { coach: { "@type": "Person", name: info.coach } } : {}), url },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "World Cup 2026", item: `${BASE}/` },
      { "@type": "ListItem", position: 2, name: "Teams", item: `${BASE}/teams.html` },
      { "@type": "ListItem", position: 3, name: team, item: url } ] },
  ];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>
<link rel="canonical" href="${url}"/>
<meta name="theme-color" content="#064e3b"/>
<link rel="icon" href="../icon-192.png"/>
<meta property="og:type" content="article"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(`${team} — Group ${g} at the FIFA World Cup 2026. Fixtures, venues and more.`)}"/>
<meta property="og:image" content="${BASE}/og-image.png"/>
<meta property="og:url" content="${url}"/>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
<style>${STYLE}</style>
</head>
<body>
<header>
  <div class="fl">${flagImg(team, 64)}</div>
  <h1>${esc(team)} — World Cup 2026${host ? " 🏠" : ""}</h1>
  <p>Everything on ${esc(team)} at the FIFA World Cup 2026: Group ${g}${confed ? ` (${confed})` : ""}${host ? ", a tournament host nation" : ""}, full fixtures, venues, and where to follow every match live.</p>
  <a class="cta" href="../index.html">⚽ Live scores &amp; schedule</a>
</header>
<div class="wrap"><main>
  <h2>${esc(team)} at a glance</h2>
  <div class="card"><table class="kv">${infoRows}</table></div>

  <h2>${esc(team)}'s match schedule</h2>
  <div class="card">${rows || "<p>Fixtures to be confirmed.</p>"}</div>

  ${g ? `<h2>Full Group ${g} schedule</h2><div class="card">${groupRows}</div>` : ""}
  <p style="font-size:13px;color:var(--muted)">Kick-off times in your local time zone, live scores, predictions and reminders are on the <a href="../index.html">main hub</a>.</p>

  ${g ? `<h2>Group ${g} rivals</h2><div class="grid">${rivals.map((r) => `<a href="../${teamHref(r)}">${flagImg(r, 18)} ${esc(r)}</a>`).join("")}</div>` : ""}

  <h2>Explore more</h2>
  <div class="grid"><a href="../teams.html">👕 All 48 teams</a><a href="../guide.html">📘 Tournament guide</a><a href="../cities.html">🌎 Host cities</a></div>
</main></div>
<footer>🏆 <a href="../index.html">World Cup 2026 Hub</a> · <a href="../teams.html">Teams</a> · <a href="../guide.html">Guide</a> · <a href="../privacy.html">Privacy</a></footer>
</body>
</html>
`;
}

function teamsHub() {
  const url = `${BASE}/teams.html`;
  const groups = Object.keys(GROUPS)
    .map((g) => {
      const cards = GROUPS[g]
        .map((t) => `<a class="tcard" href="${teamHref(t)}">${flagImg(t, 22)} <span>${esc(t)}</span></a>`)
        .join("");
      return `<div class="grp"><h3>Group ${g}</h3><div class="tlist">${cards}</div></div>`;
    })
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover"/>
<title>FIFA World Cup 2026 Teams — All 48 Nations by Group</title>
<meta name="description" content="All 48 nations at the FIFA World Cup 2026, organised by group. Tap any team for its full schedule, group, venues and guide."/>
<link rel="canonical" href="${url}"/>
<meta name="theme-color" content="#064e3b"/>
<link rel="icon" href="icon-192.png"/>
<meta property="og:type" content="website"/>
<meta property="og:title" content="FIFA World Cup 2026 Teams — All 48 Nations"/>
<meta property="og:description" content="All 48 nations by group, with links to each team's full schedule."/>
<meta property="og:image" content="${BASE}/og-image.png"/>
<meta property="og:url" content="${url}"/>
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "World Cup 2026", item: `${BASE}/` }, { "@type": "ListItem", position: 2, name: "Teams", item: url }] })}</script>
<style>${STYLE}
.grp{margin-bottom:18px}.grp h3{font-size:15px;color:var(--green-d);margin-bottom:8px}
.tlist{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
.tcard{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 12px;text-decoration:none;color:var(--ink);font-weight:700;font-size:14px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.tcard img{border-radius:3px}</style>
</head>
<body>
<header style="background:linear-gradient(135deg,var(--green-d),var(--green));color:#fff;padding:calc(32px + env(safe-area-inset-top)) 16px 28px;text-align:center">
  <span style="font-size:30px" aria-hidden="true">👕</span>
  <h1 style="font-size:24px;font-weight:800;margin:8px 0 6px">World Cup 2026 Teams</h1>
  <p style="font-size:14px;opacity:.95">All 48 nations, organised by group. Tap a team for its full schedule and guide.</p>
  <a class="cta" href="index.html">⚽ Open the live hub</a>
</header>
<div class="wrap"><main>
  ${groups}
  <h2>More</h2>
  <div class="grid"><a href="guide.html">📘 Tournament guide</a><a href="cities.html">🌎 Host cities</a></div>
</main></div>
<footer>🏆 <a href="index.html">World Cup 2026 Hub</a> · <a href="guide.html">Guide</a> · <a href="cities.html">Cities</a> · <a href="privacy.html">Privacy</a></footer>
</body>
</html>
`;
}

// --- Generate ---------------------------------------------------------------
mkdirSync(join(ROOT, "team"), { recursive: true });
const allTeams = Object.keys(CODES);
let n = 0;
const slugs = [];
for (const team of allTeams) {
  if (CUSTOM[team]) continue; // has a bespoke page
  const s = slug(team);
  slugs.push(s);
  writeFileSync(join(ROOT, "team", `${s}.html`), teamPage(team));
  n++;
}
writeFileSync(join(ROOT, "teams.html"), teamsHub());
const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
if (dupes.length) {
  console.error("Duplicate slugs:", dupes);
  process.exit(1);
}
console.log(`Generated ${n} team pages + teams.html (skipped ${Object.keys(CUSTOM).length} with bespoke pages)`);
