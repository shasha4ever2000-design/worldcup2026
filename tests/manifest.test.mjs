import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));

describe("web app manifest", () => {
  it("is valid and has the core installability fields", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });

  it("declares a stable id and display_override (Lighthouse PWA)", () => {
    expect(manifest.id).toBe("/worldcup2026/");
    expect(manifest.display_override).toContain("standalone");
  });

  it("has working shortcuts with names and urls", () => {
    expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(3);
    for (const s of manifest.shortcuts) {
      expect(s.name).toBeTruthy();
      expect(s.url).toBeTruthy();
    }
  });
});
