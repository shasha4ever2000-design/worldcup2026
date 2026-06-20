# Turn on the AI features — beginner guide (no coding, all clicks)

Your live site already works great without this. This **optional** step switches on the
AI extras (match previews/recaps + auto-generated share images). It takes ~10 minutes,
done entirely in your web browser — **no terminal, no commands**.

> 💳 One cost to know: the AI is provided by Anthropic and needs a small prepaid credit
> (about **$5**). Cloudflare (the hosting) is **free**. If you don't want to pay, just skip
> this — nothing else is affected.

You'll do two things: (A) get an AI key, (B) put the site on Cloudflare and paste that key.

---

## Part A — Get your Anthropic AI key (≈3 min)

1. Go to **https://console.anthropic.com** and sign up / log in.
2. Add a little credit: **Settings → Billing → Add credits** → add **$5**.
3. Open **API keys** (left menu) → **Create key** → name it `worldcup` → **Copy** it.
   - It looks like `sk-ant-...`. Paste it somewhere safe for a minute — you'll need it in Part B.
   - ⚠️ Treat it like a password. Don't share it or put it in the website code.

---

## Part B — Put the site on Cloudflare and add the key (≈7 min)

### B1. Create a free Cloudflare account
- Go to **https://dash.cloudflare.com/sign-up**, sign up, and verify your email.

### B2. Connect your GitHub project
1. In the Cloudflare dashboard left menu: **Compute (Workers) → Workers & Pages**
   (older menus call it just **Workers & Pages**).
2. Click **Create** → choose the **Pages** tab → **Connect to Git**.
3. Click **Connect GitHub**, authorize Cloudflare, and pick the repository
   **`shasha4ever2000-design/worldcup2026`**. Click **Begin setup**.

### B3. Build settings (leave almost everything blank)
On the setup screen:
- **Project name:** `worldcup2026` (or anything you like)
- **Production branch:** `main`
- **Framework preset:** `None`
- **Build command:** *(leave empty)*
- **Build output directory:** type `/`
- Click **Save and Deploy**.

Wait ~1–2 minutes. You'll get a live address like **`https://worldcup2026.pages.dev`** 🎉

### B4. Paste your AI key (this is the important one)
1. Open your new project → **Settings** → **Variables and Secrets**
   (may be under **Settings → Environment variables**).
2. Under **Production**, click **Add variable**:
   - **Variable name:** `ANTHROPIC_API_KEY`
   - **Value:** paste your `sk-ant-...` key
   - Click the **Encrypt** button (so it's stored as a secret), then **Save**.
3. Go to the **Deployments** tab → on the latest deployment click **⋯ → Retry deployment**
   (so it picks up the new key).

### B5. Check that it worked ✅
Open this in your browser (replace the name with your actual `.pages.dev` address):

```
https://worldcup2026.pages.dev/api/health
```

You want to see:
```json
{ "ok": true, "aiConfigured": true, "cacheConfigured": false, "model": "claude-haiku-4-5" }
```

- `aiConfigured: true` → 🎉 the AI key is working. **You're done — paste that result to me.**
- `aiConfigured: false` → the key wasn't saved/encrypted; redo **B4** and retry the deploy.
- `cacheConfigured: false` is **fine** — caching is optional (see below).

### B6. (Optional) Try a real AI preview
Open (any two teams):
```
https://worldcup2026.pages.dev/api/preview?home=Egypt&away=Belgium
```
You should get a short AI-written match preview. If yes — everything works!

---

## Optional later: turn on caching (saves money)
Caching stores each AI answer so the same match isn't paid for twice. Not required.
1. Cloudflare dashboard → **Workers & Pages → KV** → **Create a namespace** → name it `WC_CACHE`.
2. Your Pages project → **Settings → Functions → KV namespace bindings → Add binding**:
   - **Variable name:** `WC_CACHE` → select the `WC_CACHE` namespace → **Save**.
3. **Deployments → Retry deployment**. Now `/api/health` shows `cacheConfigured: true`.

---

## When you're done
Paste me the result of the `/api/health` link (or any error / screenshot of where you got
stuck). Once I see `aiConfigured: true`, I'll wire the previews & recaps into the match
detail screen, add per-match share images, and build the "Ask the Oracle" chat — all tested.

### Quick troubleshooting
- **Build failed:** make sure **Build output directory** is exactly `/` and **Framework preset** is `None`.
- **`/api/health` shows a 404:** the deploy may still be running — wait a minute and refresh.
- **`aiConfigured: false`:** the secret name must be exactly `ANTHROPIC_API_KEY` and you must
  click **Encrypt** before saving, then **retry the deployment**.
- **Preview returns an error about credits:** add credit in the Anthropic console (Part A2).
- Stuck anywhere? Copy the message you see and send it to me — I'll tell you the exact next click.
