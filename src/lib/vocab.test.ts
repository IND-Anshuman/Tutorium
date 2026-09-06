import { describe, it, expect } from "vitest";
import { pickVocabTerms, buildAdditionalVocab, uniqueTermList } from "./vocab";

describe("pickVocabTerms", () => {
  it("picks long repeated curriculum words and skips stop words", () => {
    const text = "photosynthesis chlorophyll photosynthesis chlorophyll the and but mitochondria respiration";
    const terms = pickVocabTerms(text, 10).map((t) => t.term);
    expect(terms).toContain("photosynthesis");
    expect(terms).toContain("chlorophyll");
    expect(terms).not.toContain("the");
    expect(terms).not.toContain("explain");
  });

  it("never returns more than maxTerms", () => {
    const text = Array.from({ length: 50 }, (_, i) => `term${i}some`).join(" ");
    expect(pickVocabTerms(text, 5)).toHaveLength(5);
  });

  it("returns empty for empty input", () => {
    expect(pickVocabTerms("")).toEqual([]);
  });
});

describe("buildAdditionalVocab", () => {
  it("builds Speechmatics additional_vocab entries", () => {
    const vocab = buildAdditionalVocab(["photosynthesis", "mitochondria"]);
    expect(vocab).toEqual([{ content: "photosynthesis" }, { content: "mitochondria" }]);
  });

  it("drops empty terms", () => {
    expect(buildAdditionalVocab(["", "x", "chlorophyll"])).toEqual([{ content: "chlorophyll" }]);
  });
});

describe("uniqueTermList", () => {
  it("returns bare term strings", () => {
    const list = uniqueTermList("photosynthesis chlorophyll mitochondria organelle", 4);
    expect(list.every((t) => typeof t === "string")).toBe(true);
  });
});