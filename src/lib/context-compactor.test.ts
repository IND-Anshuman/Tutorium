import { describe, it, expect } from "vitest";
import { mergeIntoContext, type SessionContext } from "./context-compactor";
import { defaultContext } from "./db";

describe("context-compactor merge", () => {
  it("merges terms + dedupes + caps at 12", () => {
    const prev: SessionContext = {
      ...defaultContext(),
      summary: "we are on photosynthesis",
      level: "beginner",
      key_terms: ["mitochondria", "ATP"],
    };
    const newTerms = ["ATP", "chlorophyll", "Krebs"];
    const merged = mergeIntoContext(prev, {
      summary: "we are on photosynthesis and respiration",
      level: "beginner",
      new_terms: newTerms,
      new_weak: ["electron transport chain"],
      new_notes: ["the student confused ATP with ADP"],
    });
    expect(merged.key_terms).toEqual(["mitochondria", "ATP", "chlorophyll", "Krebs"]);
    expect(merged.level).toBe("beginner");
    expect(merged.summary).toContain("respiration");
    expect(merged.weak_areas).toEqual(["electron transport chain"]);
    expect(merged.short_notes).toEqual(["the student confused ATP with ADP"]);
  });

  it("caps the lists", () => {
    const prev: SessionContext = {
      ...defaultContext(),
      key_terms: Array.from({ length: 10 }, (_, i) => `t${i}`),
      weak_areas: Array.from({ length: 5 }, (_, i) => `w${i}`),
      short_notes: Array.from({ length: 7 }, (_, i) => `n${i}`),
    };
    const merged = mergeIntoContext(prev, {
      summary: prev.summary,
      level: prev.level,
      new_terms: ["tA", "tB", "tC"],
      new_weak: ["wA", "wB"],
      new_notes: ["nA", "nB", "nC"],
    });
    expect(merged.key_terms.length).toBe(12); // last 12
    expect(merged.key_terms.slice(-3)).toEqual(["tA", "tB", "tC"]);
    expect(merged.weak_areas.length).toBeLessThanOrEqual(6);
    expect(merged.short_notes.length).toBeLessThanOrEqual(8);
  });

  it("preserves summary/level when new value is empty", () => {
    const prev: SessionContext = { ...defaultContext(), summary: "keep me", level: "advanced" };
    const merged = mergeIntoContext(prev, {
      summary: "",
      level: "",
      new_terms: [],
      new_weak: [],
      new_notes: [],
    });
    expect(merged.summary).toBe("keep me");
    expect(merged.level).toBe("advanced");
  });
});