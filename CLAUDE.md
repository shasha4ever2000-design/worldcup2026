# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                  # install vitest, playwright, wrangler
npm test                     # JS unit tests (vitest, one-shot)
npm run test:watch           # vitest in watch mode
npm run test:coverage        # unit tests + V8 coverage report
npx vitest run tests/logic.test.mjs   # run a single test file
npm run test:e2e             # Playwright browser smoke tests (requires `npx playwright install` first)
npm run test:py              # Python unit tests via pytest
python -m pytest tests/test_update_scores.py -v   # single Python test file

npm run gen:cities           # rebuild cities.html + city/*.html from fixture data
npm run gen:teams            # rebuild teams.html + team/*.html from fixture data

npm run cf:dev               # local Cloudflare Pages dev server at http://localhost:8788
npm run cf:deploy            # deploy to Cloudflare Pages
```

E2E tests spin up a Python HTTP server on port 8099 automatically (via `playwright.config.mjs`). No separate server step is needed.

## Architecture

### The "no-build" app

The entire front-end application lives in a **single file: `index.html`** (~6000+ lines). It is pure vanilla JS with no framework and no bundler. All data (fixture list `M`, groups `GROUPS`, team metadata `TEAM_INFO`, venues `VENUES`, etc.) is inlined as `const` assignments inside `<script>` tags. This is intentional — it makes the page fast to load and trivially hostable on GitHub Pages.

### The canonical logic module

`src/logic.mjs` is the **single source of truth** for all pure business logic: standings calculation, bracket resolution, pick'em encode/decode, match prediction, tournament stats, etc.

**Critical constraint:** Every function in `src/logic.mjs` also exists verbatim inside `index.html`. `tests/parity.test.mjs` enforces this by extracting each function from `index.html` via regex and running it against the same inputs. **When you change logic, you must update both places.** The same applies to the `ALIASES` map in `src/logic.mjs` — it must match the `al` map inside `normTeam` in `index.html` and the `ALIAS` dict in `update_scores.py`.

### Data flow

```
football-data.org API
  → update_scores.py (GitHub Action, scheduled)  → scores.json
  → update_scorers.py (same Action)              → scorers.json
fixtures.json (static, committed)               ← source of truth for the schedule
overrides.json                                  ← manual score corrections (win over API feed)
```

`scores.json` keys use the format `"<iso-datetime>|<home>|<away>"` — the same format as `mId()` in `src/logic.mjs`. The front-end also fetches live scores directly from TheSportsDB; `pickScore()` in `logic.mjs` decides which source to trust based on match status.

`overrides.json` pins specific match scores that the API reports incorrectly. These are applied after every API fetch and can never be clobbered back.

### Static SEO pages

`cities.html`, `city/*.html`, `teams.html`, and `team/*.html` are **generated files** — do not edit them by hand. They are produced by `scripts/gen-city-pages.mjs` and `scripts/gen-team-pages.mjs`, which import live data from `index.html` via `tests/helpers.mjs` (the same helper that feeds the test suite). Run the relevant `npm run gen:*` script after any fixture or team-data change.

Two bespoke team pages (`eg.html` for Egypt, `sa.html` for Saudi Arabia) are hand-authored and not generated.

### Optional Cloudflare backend

`functions/api/` contains serverless Cloudflare Pages Functions that are **dormant by default**. The front-end probes `/api/health` on page load; if it returns `aiConfigured:false` (or the fetch fails, as on GitHub Pages), all AI features are silently hidden. No front-end changes are needed to activate them — deploying to Cloudflare Pages with the secrets set is enough.

- `functions/lib/claude.js` — thin wrapper around the Anthropic Messages API; reads `ANTHROPIC_API_KEY` and `CLAUDE_MODEL` from Cloudflare env bindings.
- Routes: `/api/preview`, `/api/recap`, `/api/og`, `/api/health`
- KV namespace `WC_CACHE` caches AI output to avoid redundant generations.
- Local dev: copy `.dev.vars.example` → `.dev.vars`, fill in the key, run `npm run cf:dev`.
- Default model: `claude-haiku-4-5` (set in `wrangler.toml`; override per environment).

### Tests

| File | What it covers |
|---|---|
| `tests/parity.test.mjs` | Drift guard: in-page functions vs `src/logic.mjs`; alias maps across JS + Python |
| `tests/logic.test.mjs` | Unit tests for all exported functions in `src/logic.mjs` |
| `tests/fixtures.test.mjs` | Integrity of `fixtures.json` (dates, required fields, no duplicate IDs) |
| `tests/i18n.test.mjs` | Every UI string key present in all 8 languages |
| `tests/citypages.test.mjs` / `tests/teampages.test.mjs` | Generated page correctness |
| `tests/sw.test.mjs` | Service-worker caching strategy |
| `tests/e2e/smoke.spec.mjs` | Playwright: page loads, tab navigation, key UI elements |
| `tests/test_update_scores.py` / `tests/test_update_scorers.py` | Python updater scripts |

`tests/helpers.mjs` extracts live data from `index.html` via `eval()` — tests always exercise what ships, not a separate fixture copy.

### CI

`.github/workflows/ci.yml` runs on pushes to `main` and `claude/**` branches (and all PRs). It skips when only `scores.json` or `scorers.json` changed (data-only commits from the score-update bot). Three parallel jobs: JS unit, Python unit, E2E.

`.github/workflows/update-scores.yml` runs on a 15-minute cron but each run loops internally for ~5.5 hours, fetching every 60 seconds and committing on change. `cancel-in-progress: true` ensures only one loop runs at a time.
