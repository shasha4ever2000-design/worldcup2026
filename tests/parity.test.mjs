// Drift guard: the pure logic also lives inline in index.html (and the alias
// map is duplicated again in update_scores.py). These tests fail loudly if the
// canonical copy in src/logic.mjs ever diverges from what actually ships.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ALIASES, normTeam, encodePicks, decodePicks, mId, buildMatchSchema } from "../src/logic.mjs";
import { extractInPageAliases, M, GROUPS, TEAM_INFO, VENUES } from "./helpers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("normTeam alias parity", () => {
  it("index.html's in-page alias map matches src/logic.mjs", () => {
    expect(extractInPageAliases()).toEqual(ALIASES);
  });

  it("update_scores.py covers every alias the site uses", () => {
    const py = readFileSync(join(ROOT, "update_scores.py"), "utf8");
    // crude but effective: each canonical site name must appear as a python value
    for (const [from, to] of Object.entries(ALIASES)) {
      expect(py, `python ALIAS should map "${from}" -> "${to}"`).toContain(`"${to}"`);
    }
  });
});

describe("in-page functions behave like the module", () => {
  // Extract a named `function foo(...) {...}` body from index.html and rebuild it.
  function extractFn(name) {
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    const start = html.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`function ${name} not found`);
    const paramStart = html.indexOf("(", start);
    // Walk the parameter list to its matching ")" so default-value braces
    // (e.g. `VENUES={}`) aren't mistaken for the function body.
    let pdepth = 0,
      j = paramStart,
      pstr = null;
    for (; j < html.length; j++) {
      const c = html[j];
      if (pstr) {
        if (c === "\\") j++;
        else if (c === pstr) pstr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") pstr = c;
      else if (c === "(") pdepth++;
      else if (c === ")") {
        pdepth--;
        if (pdepth === 0) break;
      }
    }
    let depth = 0,
      i = html.indexOf("{", j),
      inStr = null,
      started = false;
    for (; i < html.length; i++) {
      const c = html[i];
      if (inStr) {
        if (c === "\\") i++;
        else if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") inStr = c;
      else if (c === "{") {
        depth++;
        started = true;
      } else if (c === "}") {
        depth--;
        if (started && depth === 0) {
          i++;
          break;
        }
      }
    }
    const body = html.slice(paramStart, i);
    // eslint-disable-next-line no-eval
    return eval(`(function ${name}${body})`);
  }

  it("normTeam matches for a spread of inputs", () => {
    const inPage = extractFn("normTeam");
    const samples = [
      "Türkiye",
      "Côte d'Ivoire",
      "Korea Republic",
      "United States of America",
      "Bosnia & Herzegovina",
      "Curaçao",
      "Brazil",
      "",
      null,
    ];
    samples.forEach((s) => expect(inPage(s)).toBe(normTeam(s)));
  });

  it("in-page decodePicks decodes a real shared link (regression: base64 padding)", () => {
    const inPageDecode = extractFn("decodePicks");
    // A populated payload whose base64 length is a multiple of 4 — the case the
    // old `atob(s + "===")` over-padded and threw on in Chromium.
    const votes = { [mId(M[0])]: "h", [mId(M[1])]: "a" };
    const code = encodePicks({ votes, name: "TestFriend", favs: ["Brazil"] }, M);
    const fromPage = inPageDecode(code);
    expect(fromPage).not.toBeNull();
    expect(fromPage).toEqual(decodePicks(code));
  });

  it("in-page buildMatchSchema matches the module for the real fixture list", () => {
    const inPage = extractFn("buildMatchSchema");
    expect(inPage(M, VENUES)).toEqual(buildMatchSchema(M, VENUES));
  });
});

describe("SEO schema on the real fixture data", () => {
  it("emits a valid SportsEvent ItemList for every real match", () => {
    const schema = buildMatchSchema(M, VENUES);
    const realMatches = M.filter((m) => !m.ph && m.h && m.a).length;
    expect(schema["@type"]).toBe("ItemList");
    expect(schema.numberOfItems).toBe(realMatches);
    expect(schema.itemListElement.every((e) => e.item["@type"] === "SportsEvent")).toBe(true);
    expect(() => JSON.stringify(schema)).not.toThrow();
  });
});

describe("extracted data sanity", () => {
  it("exposes the expected data shapes", () => {
    expect(Array.isArray(M)).toBe(true);
    expect(Object.keys(GROUPS)).toHaveLength(12);
    expect(TEAM_INFO).toHaveProperty("Saudi Arabia");
  });
});
