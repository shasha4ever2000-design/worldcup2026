# FIFA World Cup 2026 — Live Companion (EN/AR)

🔗 **Live site:** https://shasha4ever2000-design.github.io/worldcup2026/

A free, bilingual (English / Arabic, full RTL) companion site for the FIFA World Cup 2026 — built especially for fans in 🇪🇬 Egypt, 🇸🇦 Saudi Arabia, and the Gulf. No app to install, no backend, no cost — just open the link.

## Features

- 🔴 **Live scores** — auto-updates every ~10 minutes via GitHub Actions
- 📊 **Group standings** — calculated automatically as results come in
- 🏆 **Knockout bracket** + a tap-to-simulate qualification predictor
- ⭐ **Favorite teams** with reminders for upcoming matches
- 🌍 **Bilingual** — toggle English ⇄ Arabic, full right-to-left layout
- 🌙 **Dark mode** + works **offline** as an installable PWA
- 📱 **Mobile-first** design, built to feel native on a phone

## Tech

Single-file static site (`index.html`) — vanilla JS, no build step, no framework. Hosted free on GitHub Pages.

## How live scores update automatically

```
football-data.org API → GitHub Action (every ~10 min) → scores.json → site polls & displays
```

- `.github/workflows/update-scores.yml` — scheduled GitHub Action
- `.github/scripts/update_scores.py` — fetches results, matches them to `fixtures.json`, writes `scores.json`
- Requires a free API token stored in the repo secret `FOOTBALL_DATA_TOKEN`

## Credits

Created and designed by **Ahmed Hussein**, with [Claude AI](https://claude.ai).
