import { describe, it, expect } from "vitest";
import { I } from "./helpers.mjs";

// Guards translation completeness: every UI string the English dictionary
// defines must also exist in Arabic and Spanish, with no empty values and no
// stray/typo'd keys. Catches a forgotten translation before it ships.
describe("i18n dictionaries", () => {
  it("ships English, Arabic and Spanish", () => {
    expect(Object.keys(I).sort()).toEqual(["ar", "en", "es"]);
  });

  const enKeys = () => Object.keys(I.en).sort();

  for (const locale of ["ar", "es"]) {
    it(`${locale} has exactly the same keys as English`, () => {
      expect(Object.keys(I[locale]).sort()).toEqual(enKeys());
    });

    it(`${locale} has no empty values`, () => {
      const empty = Object.entries(I[locale])
        .filter(([, v]) => typeof v !== "string" || v.trim() === "")
        .map(([k]) => k);
      expect(empty).toEqual([]);
    });

    it(`${locale} preserves {name} placeholders where English uses them`, () => {
      for (const k of Object.keys(I.en)) {
        if (typeof I.en[k] === "string" && I.en[k].includes("{name}")) {
          expect(I[locale][k], `${locale}.${k} should keep {name}`).toContain("{name}");
        }
      }
    });
  }

  it("Spanish translates key labels (not left as English)", () => {
    expect(I.es.tabSch).toBe("Calendario");
    expect(I.es.draw).toBe("Empate");
    expect(I.es.scores).toContain("Resultados");
  });
});
