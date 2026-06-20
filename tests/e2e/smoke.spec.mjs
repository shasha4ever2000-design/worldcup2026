import { test, expect } from "@playwright/test";
import { encodePicks, mId } from "../../src/logic.mjs";
import { M } from "../helpers.mjs";

test.describe("World Cup 2026 site smoke", () => {
  test("loads and renders the schedule", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/World Cup 2026/i);
    // The schedule tab renders match cards
    await expect(page.locator("#content .mc").first()).toBeVisible();
    // Dashboard stat cards render
    await expect(page.locator(".dcard").first()).toBeVisible();
  });

  test("stats tab shows the KPI grid and results breakdown", async ({ page }) => {
    await page.goto("/");
    await page.locator(".tab", { hasText: /Stats/i }).click();
    await expect(page.locator(".kpi-grid")).toBeVisible();
    await expect(page.locator(".kpi")).toHaveCount(4);
    await expect(page.locator(".rbar")).toBeVisible();
  });

  test("switches tabs", async ({ page }) => {
    await page.goto("/");
    await page.locator('.tab', { hasText: /Groups/i }).click();
    await expect(page.locator(".grp-tbl").first()).toBeVisible();
    await page.locator(".tab", { hasText: /Bracket/i }).click();
    await expect(page.locator(".bracket")).toBeVisible();
  });

  test("cycles languages English → Spanish → Portuguese → French → German → Arabic", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const btn = page.locator("#langBtn");
    await btn.click();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator("#t_title")).toHaveText(/Copa Mundial 2026/i);
    await btn.click();
    await expect(page.locator("html")).toHaveAttribute("lang", "pt");
    await expect(page.locator("#t_title")).toHaveText(/Copa do Mundo 2026/i);
    await btn.click();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.locator("#t_title")).toHaveText(/Coupe du Monde 2026/i);
    await btn.click();
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.locator("#t_title")).toHaveText(/Weltmeisterschaft 2026/i);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await btn.click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("opens directly in Spanish via ?lang=es", async ({ page }) => {
    await page.goto("/?lang=es");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator("#t_title")).toHaveText(/Copa Mundial 2026/i);
  });

  test("opens directly in Portuguese via ?lang=pt", async ({ page }) => {
    await page.goto("/?lang=pt");
    await expect(page.locator("html")).toHaveAttribute("lang", "pt");
    await expect(page.locator("#t_title")).toHaveText(/Copa do Mundo 2026/i);
  });

  test("opens directly in German via ?lang=de", async ({ page }) => {
    await page.goto("/?lang=de");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.locator("#t_title")).toHaveText(/Weltmeisterschaft 2026/i);
  });

  test("opens directly in French via ?lang=fr", async ({ page }) => {
    await page.goto("/?lang=fr");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.locator("#t_title")).toHaveText(/Coupe du Monde 2026/i);
    // Inline (non-dictionary) strings are localized too
    await expect(page.locator("#t_ticker_lbl")).toHaveText(/ACTUS/i);
    await page.locator(".tab", { hasText: /Tableau/i }).click();
    await expect(page.locator(".bracket h3")).toContainText("Tableau du tournoi");
  });

  test("search filters the schedule", async ({ page }) => {
    await page.goto("/");
    await page.locator("#search").fill("Brazil");
    // Debounced render (180ms) — wait for a Brazil card and no unrelated noise
    await expect(page.locator("#content")).toContainText("Brazil");
  });

  test("shows a Match to Watch card and a Guide link", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".motd")).toBeVisible();
    await expect(page.locator("#t_guide")).toHaveAttribute("href", "guide.html");
  });

  test("guide.html loads with its own content", async ({ page }) => {
    await page.goto("/guide.html");
    await expect(page).toHaveTitle(/World Cup 2026 Guide/i);
    await expect(page.locator("#groups .grp")).toHaveCount(12);
  });

  test("teams hub and a team page load", async ({ page }) => {
    await page.goto("/teams.html");
    await expect(page).toHaveTitle(/Teams/i);
    await expect(page.locator(".tcard")).toHaveCount(48);
    await page.goto("/team/brazil.html");
    await expect(page.locator("h1")).toContainText("Brazil");
    await expect(page.locator(".m").first()).toBeVisible();
  });

  test("host-city hub and a city page load", async ({ page }) => {
    await page.goto("/cities.html");
    await expect(page).toHaveTitle(/Host Cities/i);
    await expect(page.locator(".ccard")).toHaveCount(16);
    await page.goto("/city/miami.html");
    await expect(page.locator("h1")).toContainText("Miami");
    await expect(page.locator(".m").first()).toBeVisible();
  });

  test("injects per-match SportsEvent JSON-LD for SEO", async ({ page }) => {
    await page.goto("/");
    const raw = await page.locator("#matchSchema").textContent();
    const schema = JSON.parse(raw);
    expect(schema["@type"]).toBe("ItemList");
    expect(schema.numberOfItems).toBeGreaterThan(0);
    expect(schema.itemListElement[0].item["@type"]).toBe("SportsEvent");
  });

  test("an incoming pick'em link is consumed and the URL is cleaned", async ({ page }) => {
    // Dismiss the "add friend?" confirm that fires shortly after load
    page.on("dialog", (d) => d.dismiss());
    const votes = { [mId(M[0])]: "h", [mId(M[1])]: "a" };
    const code = encodePicks({ votes, name: "TestFriend", favs: ["Brazil"] }, M);
    await page.goto(`/?picks=${encodeURIComponent(code)}`);
    // handleIncomingPicks strips the param via history.replaceState
    await expect.poll(() => new URL(page.url()).searchParams.get("picks")).toBeNull();
  });
});
