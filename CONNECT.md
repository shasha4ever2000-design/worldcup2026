# Connect the backend (Cloudflare Pages + Workers)

This scaffold adds a serverless API to the site **without changing the front-end**:

| Route | What it does |
|---|---|
| `GET /api/preview?home=Egypt&away=Belgium&lang=en` | AI 2-paragraph match preview (cached 24h) |
| `GET /api/recap?home=Egypt&away=Belgium&score=2-1&lang=en` | AI match recap (cached 30d) |
| `GET /api/og?home=Egypt&away=Belgium&when=Jun%2017` | 1200×630 branded share image (PNG) |
| `GET /api/health` | Reports whether the API key + cache are configured |

The Anthropic API key lives **only** as a server secret — it is never shipped to the browser
(same pattern as your existing `FOOTBALL_DATA_TOKEN`).

---

## What I can't do for you (≈5 minutes, in your browser)

I scaffolded and tested everything, but creating the account and pasting secret keys requires
your login. Do these once:

### 1. Get an Anthropic API key
- Go to **https://console.anthropic.com** → API Keys → Create key. Copy it.

### 2. Create the Cloudflare project (choose ONE path)

**Path A — Git integration (recommended, auto-deploys on every push):**
1. Create a free account at **https://dash.cloudflare.com**.
2. **Workers & Pages → Create → Pages → Connect to Git** → pick `shasha4ever2000-design/worldcup2026`.
3. Build settings: **Framework preset = None**, **Build command = (empty)**,
   **Build output directory = `/`** (the site is plain static files at the repo root).
4. Deploy. You'll get a `*.pages.dev` URL.

**Path B — CLI deploy from your machine:**
```bash
npm install
npx wrangler login
npm run cf:deploy        # wrangler pages deploy .
```

### 3. Create the KV cache namespace
```bash
npx wrangler kv namespace create WC_CACHE
```
Copy the printed `id` into **`wrangler.toml`** (replace `REPLACE_WITH_KV_NAMESPACE_ID`).
For Path A, also bind it in the dashboard: **Pages project → Settings → Functions → KV namespace
bindings → Add**, Variable name `WC_CACHE`, select the namespace.

### 4. Add the API key secret
```bash
npx wrangler pages secret put ANTHROPIC_API_KEY     # paste your key
```
(Or dashboard: **Settings → Environment variables → Add → Encrypt**, name `ANTHROPIC_API_KEY`.)

### 5. Verify
Open `https://<your-project>.pages.dev/api/health` — you should see
`{"ok":true,"aiConfigured":true,"cacheConfigured":true,...}`.

---

## Local development
```bash
cp .dev.vars.example .dev.vars     # then paste your real key into .dev.vars (git-ignored)
npm run cf:dev                     # serves the site + /api/* at http://localhost:8788
```

---

## Wiring it into the UI — ✅ DONE (progressive enhancement)

The match detail sheet **already calls these endpoints**. On open it probes `/api/health`
once: if the backend isn't connected (e.g. on the static GitHub Pages mirror) it stays
completely invisible and never errors. Once you connect Cloudflare and `/api/health` reports
`aiConfigured:true`, an **AI Preview** (upcoming matches) or **AI Recap** (finished matches)
card appears automatically in the sheet — no further front-end work needed.

Still pending (I'll add once the backend is live so I can verify it): per-match `og:image`
share cards via a Cloudflare `_middleware` that rewrites the meta tag for `?match=` deep links.

The implementation mirrors this pattern:

```js
// Inside openSheet(m), after the existing content is rendered:
const AI_BASE = location.origin;            // same-origin on Cloudflare Pages
fetch(`${AI_BASE}/api/preview?home=${encodeURIComponent(m.h)}&away=${encodeURIComponent(m.a)}&lang=${lang}`)
  .then(r => r.ok ? r.json() : null)
  .then(d => { if (d && d.preview) injectPreviewInto(sheetBody, d.preview); })
  .catch(() => {});                          // silent no-op if endpoint absent
```

And the dynamic share image becomes the per-match Open Graph tag:
```html
<meta property="og:image"
      content="https://<project>.pages.dev/api/og?home=Egypt&away=Belgium&when=Jun%2017"/>
```

---

## Hosting note
GitHub Pages can't run server code, so the AI/OG routes only work on **Cloudflare Pages**
(or another compute host). You can keep GitHub Pages as a static mirror, but point your primary
domain at the Cloudflare project so the API routes resolve same-origin.

## Costs
- Cloudflare Pages + Workers + KV: generous **free tier** (plenty for this traffic).
- Anthropic: pay-per-use; previews/recaps use **claude-haiku-4-5** (cheap) and are **cached**,
  so each unique match is generated once. Switch models via `CLAUDE_MODEL` in `wrangler.toml`.

## Tell me when `/api/health` is green
I'll then wire the preview/recap into the match sheet, set per-match OG share images, and add
the "Ask the Oracle" chat — all behind tests.
