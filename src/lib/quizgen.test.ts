import { describe, expect, it } from "vitest";
import {
  parseQuizCount,
  planQuizBands,
  dedupeByStem,
  shuffleWithRemap,
  pickHints,
  planDetailBands,
  autoDetail,
  parseDetailOverride,
} from "./quizgen";

describe("parseQuizCount", () => {
  it("parses explicit counts", () => {
    expect(parseQuizCount("quiz me with 25 questions").count).toBe(25);
    expect(parseQuizCount("make a 30 question quiz").count).toBe(30);
    expect(parseQuizCount("quiz me: 20 q").count).toBe(20);
  });
  it("parses difficulty words and clamps ranges", () => {
    expect(parseQuizCount("hard quiz")).toEqual(expect.objectContaining({ count: 10, difficulty: "hard" }));
    expect(parseQuizCount("easy quiz please")).toEqual(expect.objectContaining({ difficulty: "easy" }));
    expect(parseQuizCount("quiz me")).toEqual(expect.objectContaining({ count: 10, difficulty: "medium" }));
  });
  it("clamps to 4..30", () => {
    expect(parseQuizCount("quiz me with 100 questions")).toEqual(expect.objectContaining({ count: 30 }));
    expect(parseQuizCount("quiz me with 2 questions")).toEqual(expect.objectContaining({ count: 4 }));
  });
  it("flashcard counts parse up to 24", () => {
    expect(parseQuizCount("make 20 flashcards").count).toBe(20);
    expect(parseQuizCount("make 99 flashcards").count).toBe(24);
  });
});

describe("planQuizBands", () => {
  it("single band within 12", () => {
    expect(planQuizBands(4)).toEqual([4]);
    expect(planQuizBands(12)).toEqual([12]);
  });
  it("bands of 8 above 12", () => {
    expect(planQuizBands(20)).toEqual([8, 8, 4]);
    expect(planQuizBands(30)).toEqual([8, 8, 8, 6]);
    expect(planQuizBands(13)).toEqual([8, 5]);
  });
});

describe("dedupeByStem", () => {
  it("keeps first occurrence, preserves order", () => {
    const a = { question: "What is X?", choices: [], answer: "0", explanation: "" };
    const b = { question: "What is Y?", choices: [], answer: "1", explanation: "" };
    const dup = { ...a };
    expect(dedupeByStem([a, b, dup])).toEqual([a, b]);
  });
});

describe("shuffleWithRemap", () => {
  it("keeps the correct answer text invariant under shuffle", () => {
    for (let i = 0; i < 50; i++) {
      const choices = ["A", "B", "C", "D"];
      const answerIdx = i % 4;
      const { shuffled, correctIndex } = shuffleWithRemap(choices, answerIdx);
      expect(shuffled[correctIndex]).toBe(choices[answerIdx]);
      expect([...shuffled].sort()).toEqual([...choices].sort());
    }
  });
});

describe("pickHints", () => {
  const choices = ["correct", "w1", "w2", "w3"];
  it("never dims the correct choice", () => {
    const dimmed = pickHints(choices, 0, 2);
    expect(dimmed).toHaveLength(2);
    expect(dimmed).not.toContain(0);
  });
  it("caps at available wrong choices", () => {
    expect(pickHints(choices, 0, 9).length).toBe(3);
    expect(pickHints(choices, 0, 0)).toEqual([]);
  });
});

describe("planDetailBands", () => {
  it("single band when source is small", () => {
    expect(planDetailBands(800)).toEqual([800]);
  });
  it("splits larger sources into bounded bands", () => {
    expect(planDetailBands(2400)).toEqual([1200, 1200]);
    expect(planDetailBands(3600)).toEqual([1200, 1200, 1200]);
  });
  it("never returns more than 4 bands", () => {
    const bands = planDetailBands(90000);
    expect(bands).toHaveLength(4);
    bands.forEach((b) => expect(b).toBe(22500));
  });
  it("returns [] for empty source", () => {
    expect(planDetailBands(0)).toEqual([]);
  });
});

describe("autoDetail", () => {
  it("light for small source", () => {
    expect(autoDetail(600)).toBe("light");
  });
  it("standard for medium", () => {
    expect(autoDetail(2500)).toBe("standard");
  });
  it("deep for large", () => {
    expect(autoDetail(8000)).toBe("deep");
  });
  it("explicit user level always wins", () => {
    expect(autoDetail(600, "deep")).toBe("deep");
    expect(autoDetail(9000, "light")).toBe("light");
  });
});

describe("parseDetailOverride", () => {
  it("detects depth requests", () => {
    expect(parseDetailOverride("make a study pack on cells, in depth")).toBe("deep");
    expect(parseDetailOverride("deep dive on the Krebs cycle")).toBe("deep");
    expect(parseDetailOverride("a detailed and thorough pack")).toBe("deep");
  });
  it("detects lightness requests", () => {
    expect(parseDetailOverride("just a quick pack on cells")).toBe("light");
    expect(parseDetailOverride("short and brief, just the basics")).toBe("light");
  });
  it("null when nothing requested", () => {
    expect(parseDetailOverride("make a study pack on photosynthesis")).toBeNull();
    expect(parseDetailOverride("")).toBeNull();
  });
});