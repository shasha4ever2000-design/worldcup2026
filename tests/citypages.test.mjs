import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { VENUES, M } from "./helpers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

describe("host-city pages", () => {
  const cityFiles = readdirSync(join(ROOT, "city")).filter((f) => f.endsWith(".html"));

  it("generates one page per venue city", () => {
    expect(cityFiles.length).toBe(Object.keys(VENUES).length); // 16
  });

  it("cities.html links every city page and they all exist", () => {
    const hub = read("cities.html");
    const links = [...hub.matchAll(/href="city\/([a-z0-9-]+)\.html"/g)].map((m) => m[1]);
    expect(links.length).toBe(cityFiles.length);
    for (const slug of links) {
      expect(cityFiles, `missing file for ${slug}`).toContain(`${slug}.html`);
    }
  });

  it("every stadium is represented across the city pages", () => {
    const all = cityFiles.map((f) => read(`city/${f}`)).join("\n");
    for (const city of Object.keys(VENUES)) {
      const stadium = VENUES[city][0];
      expect(all, `stadium "${stadium}" should appear on a city page`).toContain(stadium);
    }
  });

  it("every city page carries full social/discovery meta", () => {
    for (const f of cityFiles) {
      const html = read(`city/${f}`);
      expect(html, `${f} twitter:card`).toContain('name="twitter:card" content="summary_large_image"');
      expect(html, `${f} twitter:title`).toContain('name="twitter:title"');
      expect(html, `${f} twitter:image`).toContain('name="twitter:image"');
      expect(html, `${f} og:site_name`).toContain('property="og:site_name"');
      expect(html, `${f} og:locale`).toContain('property="og:locale"');
    }
  });

  it("each city page is a valid doc with the right match count", () => {
    let totalRows = 0;
    for (const f of cityFiles) {
      const html = read(`city/${f}`);
      expect(html).toContain("World Cup 2026 in");
      expect(html).toContain('rel="canonical"');
      totalRows += (html.match(/class="m"/g) || []).length;
    }
    // Every real fixture with a city appears exactly once across all pages.
    const withCity = M.filter((m) => m.c && VENUES[m.c]).length;
    expect(totalRows).toBe(withCity);
  });
});
