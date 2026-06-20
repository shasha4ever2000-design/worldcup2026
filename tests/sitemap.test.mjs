// Sitemap integrity: it must be well-formed, free of fragment URLs (which
// Google silently drops), and list every generated city and team page so the
// long-tail content actually gets crawled.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const SITEMAP = read("sitemap.xml");
const BASE = "https://shasha4ever2000-design.github.io/worldcup2026";

const locs = [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe("sitemap.xml", () => {
  it("is non-empty and balanced (<url> open/close match)", () => {
    expect(locs.length).toBeGreaterThan(60);
    const open = (SITEMAP.match(/<url>/g) || []).length;
    const close = (SITEMAP.match(/<\/url>/g) || []).length;
    expect(open).toBe(close);
    expect(open).toBe(locs.length);
  });

  it("contains no fragment (#) URLs — Google ignores them", () => {
    const frags = locs.filter((u) => u.includes("#"));
    expect(frags, `fragment URLs should not be in the sitemap: ${frags.join(", ")}`).toEqual([]);
  });

  it("has no duplicate URLs", () => {
    expect(new Set(locs).size).toBe(locs.length);
  });

  it("lists every generated city page", () => {
    for (const f of readdirSync(join(ROOT, "city")).filter((f) => f.endsWith(".html"))) {
      expect(locs, `city/${f} missing from sitemap`).toContain(`${BASE}/city/${f}`);
    }
  });

  it("lists every generated team page", () => {
    for (const f of readdirSync(join(ROOT, "team")).filter((f) => f.endsWith(".html"))) {
      expect(locs, `team/${f} missing from sitemap`).toContain(`${BASE}/team/${f}`);
    }
  });

  it("is referenced by robots.txt", () => {
    expect(read("robots.txt")).toContain(`Sitemap: ${BASE}/sitemap.xml`);
  });
});
