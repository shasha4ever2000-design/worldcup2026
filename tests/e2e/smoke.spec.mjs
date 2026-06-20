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

  test("switches tabs", async ({ page }) => {
    await page.goto("/");
    await page.locator('.tab', { hasText: /Groups/i }).click();
    await expect(page.locator(".grp-tbl").first()).toBeVisible();
    await page.locator(".tab", { hasText: /Bracket/i }).click();
    await expect(page.locator(".bracket")).toBeVisible();
  });

  test("cycles languages English → Spanish → Portuguese → Arabic", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const btn = page.locator("#langBtn");
    await btn.click();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator("#t_title")).toHaveText(/Copa Mundial 2026/i);
    await btn.click();
    await expect(page.locator("html")).toHaveAttribute("lang", "pt");
    await expect(page.locator("#t_title")).toHaveText(/Copa do Mundo 2026/i);
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
