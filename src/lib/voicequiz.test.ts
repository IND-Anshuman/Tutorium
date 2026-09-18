import { describe, expect, it } from "vitest";
import { normalizeSpeech, matchLetterChoice, similarity, matchVoiceAnswer } from "./voicequiz";

describe("normalizeSpeech", () => {
  it("lowercases, strips punctuation, expands digits", () => {
    expect(normalizeSpeech("It's Option 2, isn't it?")).toBe("it s option two isn t it");
    expect(normalizeSpeech("A")).toBe("a");
  });
});

describe("matchLetterChoice", () => {
  it("matches spoken/typed letters and ordinals", () => {
    expect(matchLetterChoice("B", 4)).toBe(1);
    expect(matchLetterChoice("option c", 4)).toBe(2);
    expect(matchLetterChoice("the second one", 4)).toBe(1);
    expect(matchLetterChoice("three", 4)).toBe(3);
  });
  it("returns null when nothing matches", () => {
    expect(matchLetterChoice("chlorophyll", 4)).toBeNull();
    expect(matchLetterChoice("Z", 4)).toBeNull();
  });
});

describe("similarity", () => {
  it("scores overlap", () => {
    expect(similarity("glucose is produced in the stroma", "glucose is made in the stroma")).toBeGreaterThan(0.5);
    expect(similarity("cats", "mitochondria")).toBe(0);
  });
});

describe("matchVoiceAnswer", () => {
  const choices = [
    "Light reactions occur in the thylakoid membranes",
    "The Calvin cycle fixes carbon in the stroma",
    "Chlorophyll absorbs red and blue light",
    "Glucose is produced by carbon fixation",
  ];
  it("prefers a clear letter answer", () => {
    const r = matchVoiceAnswer("I think it's B", choices);
    expect(r).toEqual({ index: 1, confidence: 1, method: "letter" });
  });
  it("matches by content when no letter is spoken", () => {
    const r = matchVoiceAnswer("the calvin cycle fixes carbon in the stroma", choices);
    expect(r.index).toBe(1);
    expect(r.method).toBe("content");
    expect(r.confidence).toBeGreaterThanOrEqual(0.4);
  });
  it("returns none when nothing is close", () => {
    const r = matchVoiceAnswer("what was the question again", choices);
    expect(r.method).toBe("none");
  });
  it("letterBias=false forces content matching", () => {
    const r = matchVoiceAnswer("B is wrong, the answer is the calvin cycle one", choices, { letterBias: false });
    expect(r.method).toBe("content");
  });
});