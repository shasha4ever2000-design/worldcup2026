import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CODES, GROUPS } from "./helpers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const CUSTOM = { Egypt: "eg.html", "Saudi Arabia": "sa.html" };

describe("team pages", () => {
  const files = readdirSync(join(ROOT, "team")).filter((f) => f.endsWith(".html"));

  it("generates a page for every team without a bespoke page", () => {
    expect(files.length).toBe(Object.keys(CODES).length - Object.keys(CUSTOM).length); // 48 - 2 = 46
  });

  it("teams.html links all 48 teams (custom + generated) exactly once", () => {
    const hub = read("teams.html");
    const links = [...hub.matchAll(/href="(team\/[a-z0-9-]+\.html|eg\.html|sa\.html)"/g)].map((m) => m[1]);
    expect(new Set(links).size).toBe(48);
    expect(links).toContain("eg.html");
    expect(links).toContain("sa.html");
  });

  it("each team page is valid and shows the team in its real group", () => {
    for (const [team, g] of Object.entries(GROUPS).flatMap(([g, ts]) => ts.map((t) => [t, g]))) {
      if (CUSTOM[team]) continue;
      const slug = team.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const html = read(`team/${slug}.html`);
      expect(html, `${team} page`).toContain("rel=\"canonical\"");
      expect(html).toContain(`Group ${g}`);
      expect(html).toContain("World Cup 2026");
    }
  });

  it("does not generate pages for teams with bespoke pages", () => {
    expect(files).not.toContain("egypt.html");
    expect(files).not.toContain("saudi-arabia.html");
  });

  it("enriches every page with a confederation and the full group schedule", () => {
    for (const f of files) {
      const html = read(`team/${f}`);
      expect(html, `${f} confederation`).toContain("Confederation");
      expect(html, `${f} full group`).toMatch(/Full Group [A-L] schedule/);
    }
  });

  it("flags the three host nations", () => {
    for (const slug of ["usa", "canada", "mexico"]) {
      expect(read(`team/${slug}.html`)).toContain("Host nation");
    }
  });

  it("every team page carries full social/discovery meta", () => {
    for (const f of files) {
      const html = read(`team/${f}`);
      expect(html, `${f} twitter:card`).toContain('name="twitter:card" content="summary_large_image"');
      expect(html, `${f} twitter:title`).toContain('name="twitter:title"');
      expect(html, `${f} twitter:image`).toContain('name="twitter:image"');
      expect(html, `${f} og:site_name`).toContain('property="og:site_name"');
      expect(html, `${f} og:locale`).toContain('property="og:locale"');
    }
  });
});
