import { describe, it, expect } from "vitest";
import { HTML } from "./helpers.mjs";

describe("performance & social hints", () => {
  it("preconnects/dns-prefetches the key third-party origins", () => {
    expect(HTML).toContain('rel="preconnect" href="https://flagcdn.com"');
    for (const origin of [
      "https://flagcdn.com",
      "https://www.thesportsdb.com",
      "https://api.open-meteo.com",
      "https://api.rss2json.com",
    ]) {
      expect(HTML, `dns-prefetch ${origin}`).toContain(`rel="dns-prefetch" href="${origin}"`);
    }
  });

  it("declares og:locale plus an alternate for each extra language", () => {
    expect(HTML).toContain('property="og:locale" content="en_US"');
    const alternates = (HTML.match(/property="og:locale:alternate"/g) || []).length;
    expect(alternates).toBe(7); // ar, es, pt, fr, de, it, ja
  });
});
