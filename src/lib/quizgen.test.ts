import { describe, expect, it } from "vitest";
import { parseQuizCount, planQuizBands, dedupeByStem, shuffleWithRemap, pickHints } from "./quizgen";

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