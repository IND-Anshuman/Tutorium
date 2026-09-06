import { describe, it, expect } from "vitest";
import { wordStatus, sayItBackScore, GOOD, SHAKY } from "./sayitback";
import type { TranscriptWord } from "./speechmatics";

const w = (word: string, confidence: number): TranscriptWord => ({ word, confidence, start: 0, end: 1 });

describe("wordStatus", () => {
  it("buckets confidence into good/shaky/missed", () => {
    expect(wordStatus(0.95)).toBe("good");
    expect(wordStatus(GOOD)).toBe("good");
    expect(wordStatus(0.75)).toBe("shaky");
    expect(wordStatus(SHAKY)).toBe("shaky");
    expect(wordStatus(0.4)).toBe("missed");
  });
});

describe("sayItBackScore", () => {
  it("scores 100 when every word is clean", () => {
    const words = [w("photosynthesis", 0.97), w("converts", 0.95), w("sunlight", 0.93)];
    const r = sayItBackScore(words, ["photosynthesis"]);
    expect(r.overall).toBe(100);
    expect(r.missedTerms).toEqual([]);
  });

  it("marks shaky/missed words and lowers overall", () => {
    const words = [w("photosynthesis", 0.95), w("fotosynthesis", 0.5), w("the", 0.9), w("sunlight", 0.55)];
    const r = sayItBackScore(words, ["photosynthesis"]);
    expect(r.overall).toBe(50);
    expect(r.words.find((x) => x.word === "fotosynthesis")?.status).toBe("missed");
    expect(r.words.find((x) => x.word === "the")?.status).toBe("good");
  });

  it("flags key terms that did not come through cleanly", () => {
    const words = [w("photo", 0.4), w("synthesis", 0.45)];
    const r = sayItBackScore(words, ["photosynthesis"]);
    expect(r.missedTerms).toContain("photosynthesis");
  });

  it("returns 0 for empty words", () => {
    expect(sayItBackScore([], ["x"]).overall).toBe(0);
  });
});