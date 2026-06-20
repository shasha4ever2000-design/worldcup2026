import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(ROOT, "404.html"), "utf8");

describe("404 page", () => {
  it("is noindex and titled as a not-found page", () => {
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toMatch(/not found/i);
  });

  it("links back to the main hub and key sections", () => {
    for (const href of ["index.html", "guide.html", "teams.html", "cities.html"]) {
      expect(html, `should link to ${href}`).toContain(href);
    }
  });
});
