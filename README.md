# FIFA World Cup 2026 — Live Companion

🔗 **Live site:** https://shasha4ever2000-design.github.io/worldcup2026/

A free, fast, multilingual companion for the FIFA World Cup 2026 — live schedule,
group standings, knockout bracket, predictions and a pick'em league. No app to
install, no backend, no cost — just open the link.

## Features

- 🔴 **Live scores** — auto-updated via a scheduled GitHub Action
- 📊 **Group standings** — calculated automatically as results come in
- 🏆 **Knockout bracket** + a tap-to-simulate group-stage predictor
- 🔥 **Match to Watch** — surfaces the most attractive upcoming game
- 📈 **Tournament stats** — KPI grid, results breakdown, golden boot, goals by group
- 🏅 **Pick'em league** — predict matches and share a link to start a private league
- ⭐ **Favorite teams** with 15-minute kickoff reminders (+ goal confetti)
- 🌍 **8 languages** — English · Español · Português · Français · Deutsch · Italiano · 日本語 · العربية (full RTL for Arabic)
- 🌙 **Dark mode**, **spoiler-free mode**, weather per match city
- 📱 **Installable PWA** — works offline, app shortcuts, deep-linkable tabs (`?tab=`)

## SEO pages (static, generated from the fixture data)

- `guide.html` — full tournament guide (format, groups, cities, FAQ)
- `cities.html` + `city/<slug>.html` — all 16 host cities with their schedules
- `teams.html` + `team/<slug>.html` — all 48 nations (Egypt/Saudi have bespoke `eg.html`/`sa.html`)
- Per-match `SportsEvent` JSON-LD, `hreflang` for every language, `sitemap.xml`, custom `404.html`

Regenerate the static pages after fixture changes:

```bash
npm run gen:cities   # rebuilds cities.html + city/*.html
npm run gen:teams    # rebuilds teams.html + team/*.html
```

## Tech

Static site hosted free on GitHub Pages. The app is `index.html` (vanilla JS, no
framework, no build step required). Pure logic lives in `src/logic.mjs` as the
single tested source of truth; the in-page copies are kept honest by a parity test.

An **optional** Cloudflare Pages backend is scaffolded under `functions/`
(AI match previews/recaps + dynamic share images) — dormant until connected;
see `CONNECT.md`. The front-end works fully without it.

## How live scores & the Golden Boot update automatically

```
football-data.org API → GitHub Action (scheduled) → scores.json    → site polls & displays
                                                   → scorers.json   → site polls & displays
                                                   → knockouts.json → site polls & displays
```

- `.github/workflows/update-scores.yml` — scheduled GitHub Action (one loop runs both updaters)
- `update_scores.py` — fetches results, matches them to `fixtures.json`, writes `scores.json`
- `update_scorers.py` — fetches the top scorers (`/competitions/WC/scorers`), maps the API's
  team spellings to the site's names, writes `scorers.json` (the `{n,t,g,a}` Golden Boot list)
- `update_knockouts.py` — once the draw is set, reads the real knockout fixtures
  (Round of 32 onward) from the feed and writes `knockouts.json`, mapping each
  placeholder fixture to its actual teams (FIFA's official allocation — so we never
  hand-encode the 495-combination third-place table)
- All three use the same free API token in the repo secret `FOOTBALL_DATA_TOKEN`
- The front-end polls `scorers.json`/`knockouts.json` and falls back to the inline
  seed (and its own bracket resolution) if they're absent

## Tests & CI

Standings, the prediction model, team-name normalisation, pick'em encode/decode,
tournament stats, the SEO schema, fixture integrity, i18n completeness, the
service-worker caching strategies, the generated city/team pages, and the
score-updater script are all covered. CI runs JS + Python + browser tests on every
PR (`.github/workflows/ci.yml`).

```bash
npm install            # vitest + playwright + wrangler
npm test               # JS unit tests (vitest)
npm run test:coverage  # JS unit tests + coverage
npm run test:e2e       # browser smoke tests (needs `npx playwright install`)
pip install pytest && python -m pytest -q   # Python tests for update_scores.py
```

`tests/parity.test.mjs` guards the logic copied inline in `index.html` from
drifting from `src/logic.mjs`; `tests/i18n.test.mjs` guarantees every language
has the full set of UI strings.

## Credits

Created and designed by **Ahmed Hussein**, with [Claude AI](https://claude.ai).
