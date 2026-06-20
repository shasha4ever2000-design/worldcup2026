// Generates one static, SEO-friendly page per host city from the site's own
// fixture data (the M array in index.html) — no hand-maintained match lists,
// no fabrication. Re-run with `npm run gen:cities` whenever fixtures change.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { M, VENUES } from "../tests/helpers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://shasha4ever2000-design.github.io/worldcup2026";

// Search-friendly metadata per venue city (keyed by the city name used in M).
const CITY_META = {
  "Mexico City": { slug: "mexico-city", name: "Mexico City", flag: "🇲🇽", country: "Mexico", blurb: "Host of the opening match at the legendary Estadio Azteca." },
  "Zapopan": { slug: "guadalajara", name: "Guadalajara", flag: "🇲🇽", country: "Mexico", blurb: "Matches at Estadio Akron in the Guadalajara metropolitan area." },
  "Toronto": { slug: "toronto", name: "Toronto", flag: "🇨🇦", country: "Canada", blurb: "Canada hosts men's World Cup matches for the first time, at BMO Field." },
  "Los Angeles": { slug: "los-angeles", name: "Los Angeles", flag: "🇺🇸", country: "USA", blurb: "SoFi Stadium, one of the world's most advanced venues." },
  "Santa Clara": { slug: "san-francisco-bay-area", name: "San Francisco Bay Area", flag: "🇺🇸", country: "USA", blurb: "Levi's Stadium in Santa Clara, near San Francisco." },
  "New Jersey": { slug: "new-york-new-jersey", name: "New York / New Jersey", flag: "🇺🇸", country: "USA", blurb: "MetLife Stadium — host of the 2026 World Cup Final." },
  "Foxborough": { slug: "boston", name: "Boston", flag: "🇺🇸", country: "USA", blurb: "Gillette Stadium in Foxborough, home of the New England Patriots." },
  "Vancouver": { slug: "vancouver", name: "Vancouver", flag: "🇨🇦", country: "Canada", blurb: "BC Place on Canada's Pacific coast." },
  "Houston": { slug: "houston", name: "Houston", flag: "🇺🇸", country: "USA", blurb: "NRG Stadium, a climate-controlled venue in Texas." },
  "Arlington": { slug: "dallas", name: "Dallas", flag: "🇺🇸", country: "USA", blurb: "AT&T Stadium in Arlington, one of the largest in the tournament." },
  "Philadelphia": { slug: "philadelphia", name: "Philadelphia", flag: "🇺🇸", country: "USA", blurb: "Lincoln Financial Field in the heart of the East Coast." },
  "Guadalupe": { slug: "monterrey", name: "Monterrey", flag: "🇲🇽", country: "Mexico", blurb: "Estadio BBVA in the Monterrey metropolitan area." },
  "Atlanta": { slug: "atlanta", name: "Atlanta", flag: "🇺🇸", country: "USA", blurb: "Mercedes-Benz Stadium with its striking retractable roof." },
  "Seattle": { slug: "seattle", name: "Seattle", flag: "🇺🇸", country: "USA", blurb: "Lumen Field, famed for its passionate, noisy crowds." },
  "Miami": { slug: "miami", name: "Miami", flag: "🇺🇸", country: "USA", blurb: "Hard Rock Stadium in sun-soaked South Florida." },
  "Kansas City": { slug: "kansas-city", name: "Kansas City", flag: "🇺🇸", country: "USA", blurb: "GEHA Field at Arrowhead Stadium." },
};

const STAGE = { R32: "Round of 32", R16: "Round of 16", QF: "Quarter-final", SF: "Semi-final", "3rd": "Third-place play-off", Final: "Final" };
const stageLabel = (g) => STAGE[g] || `Group ${g}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const STYLE = `:root{--ink:#0f172a;--muted:#64748b;--green:#047857;--green-d:#064e3b;--gold:#f59e0b;--line:#e2e8f0}
*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;background:#f8fafc;color:var(--ink);line-height:1.7;padding-bottom:env(safe-area-inset-bottom)}
.wrap{max-width:820px;margin:0 auto;padding:0 16px}
header{background:linear-gradient(135deg,var(--green-d),var(--green));color:#fff;padding:calc(34px + env(safe-area-inset-top)) 16px 30px;text-align:center}
header .t{font-size:30px;display:block;margin-bottom:8px}header h1{font-size:24px;font-weight:800;margin-bottom:8px}header p{font-size:14px;opacity:.95;max-width:620px;margin:0 auto}
.cta{display:inline-block;background:var(--gold);color:#022c22;font-weight:800;padding:12px 24px;border-radius:10px;text-decoration:none;margin-top:16px;font-size:14px}
main{padding:24px 0 40px}h2{font-size:20px;font-weight:800;margin:26px 0 12px;color:var(--green-d)}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:8px 16px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.m{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--line);font-size:15px}.m:last-child{border-bottom:none}
.m .dt{min-width:92px;font-size:12px;color:var(--muted)}.m .tm{flex:1;font-weight:700}.m .st{font-size:11px;color:var(--green);font-weight:700}
.kv{width:100%;border-collapse:collapse;font-size:14px}.kv td{padding:8px;border-bottom:1px solid var(--line)}.kv td:first-child{font-weight:700;color:var(--green-d);width:42%}
.grid{display:flex;flex-wrap:wrap;gap:8px}.grid a{background:#ecfdf5;color:var(--green-d);border:1px solid #d1fae5;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:700;text-decoration:none}
p{margin-bottom:10px}footer{text-align:center;font-size:12px;color:var(--muted);padding:20px 16px;border-top:1px solid var(--line);margin-top:24px}footer a{color:var(--green)}`;

function cityPage(city, meta, matches) {
  const venue = VENUES[city] || ["", ""];
  const [stadium, cap] = venue;
  const title = `World Cup 2026 in ${meta.name} — Matches at ${stadium}`;
  const desc = `Full FIFA World Cup 2026 schedule for ${meta.name}, ${meta.country}: every match at ${stadium}${cap ? ` (capacity ${cap})` : ""}, with dates and stages. ${meta.blurb}`;
  const url = `${BASE}/city/${meta.slug}.html`;
  const rows = matches
    .map((m) => {
      const home = m.ph ? esc(m.h) : esc(m.h);
      const away = m.ph ? esc(m.a) : esc(m.a);
      return `<div class="m"><span class="dt">${fmtDate(m.dt)}</span><span class="tm">${home} <span style="color:var(--muted);font-weight:600">vs</span> ${away}</span><span class="st">${stageLabel(m.g)}</span></div>`;
    })
    .join("");
  const events = matches.filter((m) => !m.ph).map((m, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "SportsEvent", name: `${m.h} vs ${m.a}`, sport: "Football", startDate: m.dt, location: { "@type": "Place", name: `${stadium}, ${meta.name}` } } }));
  const jsonld = [
    { "@context": "https://schema.org", "@type": "Place", name: stadium, address: { "@type": "PostalAddress", addressLocality: meta.name, addressCountry: meta.country } },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "World Cup 2026", item: `${BASE}/` },
      { "@type": "ListItem", position: 2, name: "Host cities", item: `${BASE}/cities.html` },
      { "@type": "ListItem", position: 3, name: meta.name, item: url } ] },
    { "@context": "https://schema.org", "@type": "ItemList", name: `World Cup 2026 matches in ${meta.name}`, numberOfItems: events.length, itemListElement: events },
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
<meta property="og:site_name" content="World Cup 2026 Hub"/>
<meta property="og:locale" content="en_US"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(meta.blurb)}"/>
<meta property="og:image" content="${BASE}/og-image.png"/>
<meta property="og:url" content="${url}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(meta.blurb)}"/>
<meta name="twitter:image" content="${BASE}/og-image.png"/>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
<style>${STYLE}</style>
</head>
<body>
<header>
  <span class="t" aria-hidden="true">${meta.flag}</span>
  <h1>World Cup 2026 in ${esc(meta.name)}</h1>
  <p>${esc(meta.blurb)} Here is every 2026 FIFA World Cup match played at ${esc(stadium)}.</p>
  <a class="cta" href="../index.html">⚽ Open the live schedule &amp; scores</a>
</header>
<div class="wrap"><main>
  <h2>${esc(meta.name)} at a glance</h2>
  <div class="card"><table class="kv">
    <tr><td>Stadium</td><td>${esc(stadium)}</td></tr>
    ${cap ? `<tr><td>Capacity</td><td>${esc(cap)}</td></tr>` : ""}
    <tr><td>Country</td><td>${meta.flag} ${esc(meta.country)}</td></tr>
    <tr><td>Matches here</td><td>${matches.length}</td></tr>
  </table></div>

  <h2>All ${matches.length} matches in ${esc(meta.name)}</h2>
  <div class="card">${rows || "<p>Schedule to be confirmed.</p>"}</div>
  <p style="font-size:13px;color:var(--muted)">Kick-off times in your local time zone, live scores and standings are on the <a href="../index.html">main hub</a>.</p>

  <h2>Other host cities</h2>
  <div class="grid"><a href="../cities.html">🌎 All 16 host cities</a><a href="../guide.html">📘 Full tournament guide</a></div>
</main></div>
<footer>🏆 <a href="../index.html">World Cup 2026 Hub</a> · <a href="../cities.html">Host cities</a> · <a href="../guide.html">Guide</a> · <a href="../privacy.html">Privacy</a></footer>
</body>
</html>
`;
}

function citiesIndex(list) {
  const url = `${BASE}/cities.html`;
  const cards = list
    .map(({ city, meta }) => {
      const stadium = (VENUES[city] || [""])[0];
      const n = M.filter((m) => m.c === city).length;
      return `<a class="ccard" href="city/${meta.slug}.html"><div class="cf">${meta.flag}</div><div class="cn">${esc(meta.name)}</div><div class="cs">${esc(stadium)} · ${n} matches</div></a>`;
    })
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover"/>
<title>FIFA World Cup 2026 Host Cities &amp; Stadiums — All 16</title>
<meta name="description" content="All 16 FIFA World Cup 2026 host cities and stadiums across the USA, Canada and Mexico, with how many matches each city hosts and links to every city's full schedule."/>
<link rel="canonical" href="${url}"/>
<meta name="theme-color" content="#064e3b"/>
<link rel="icon" href="icon-192.png"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="World Cup 2026 Hub"/>
<meta property="og:locale" content="en_US"/>
<meta property="og:title" content="FIFA World Cup 2026 Host Cities &amp; Stadiums"/>
<meta property="og:description" content="All 16 host cities and stadiums across the USA, Canada and Mexico."/>
<meta property="og:image" content="${BASE}/og-image.png"/>
<meta property="og:url" content="${url}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="FIFA World Cup 2026 Host Cities &amp; Stadiums"/>
<meta name="twitter:description" content="All 16 host cities and stadiums across the USA, Canada and Mexico."/>
<meta name="twitter:image" content="${BASE}/og-image.png"/>
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "World Cup 2026", item: `${BASE}/` }, { "@type": "ListItem", position: 2, name: "Host cities", item: url }] })}</script>
<style>${STYLE}
.cities{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.ccard{display:block;background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;text-decoration:none;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.04)}
.ccard .cf{font-size:30px}.ccard .cn{font-weight:800;margin-top:6px}.ccard .cs{font-size:12px;color:var(--muted);margin-top:2px}</style>
</head>
<body>
<header>
  <span class="t" aria-hidden="true">🌎</span>
  <h1>World Cup 2026 Host Cities</h1>
  <p>The 2026 FIFA World Cup is played across 16 cities in three countries — the USA, Canada and Mexico. Tap a city for its full match schedule.</p>
  <a class="cta" href="index.html">⚽ Open the live schedule</a>
</header>
<div class="wrap"><main>
  <h2>All 16 host cities</h2>
  <div class="cities">${cards}</div>
  <p style="margin-top:16px"><a href="guide.html">📘 Read the full tournament guide →</a></p>
</main></div>
<footer>🏆 <a href="index.html">World Cup 2026 Hub</a> · <a href="guide.html">Guide</a> · <a href="privacy.html">Privacy</a></footer>
</body>
</html>
`;
}

// --- Generate ---------------------------------------------------------------
mkdirSync(join(ROOT, "city"), { recursive: true });
const ordered = Object.keys(CITY_META).map((city) => ({ city, meta: CITY_META[city] }));
let n = 0;
for (const { city, meta } of ordered) {
  const matches = M.filter((m) => m.c === city).sort((a, b) => new Date(a.dt) - new Date(b.dt));
  writeFileSync(join(ROOT, "city", `${meta.slug}.html`), cityPage(city, meta, matches));
  n++;
}
writeFileSync(join(ROOT, "cities.html"), citiesIndex(ordered));
console.log(`Generated ${n} city pages + cities.html`);

// Sanity: every venue city must have metadata.
const missing = Object.keys(VENUES).filter((c) => !CITY_META[c]);
if (missing.length) {
  console.error("Missing CITY_META for:", missing);
  process.exit(1);
}
