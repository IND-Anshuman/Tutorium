import { describe, expect, it, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => ({ llm: vi.fn<(...a: unknown[]) => Promise<unknown>>() }));
vi.mock("./llm", () => ({ llmJson: fake.llm }));

import {
  generateDebate,
  generateMnemonic,
  buildReviewItems,
  resolveNewIntentFromText,
} from "./enrich";

beforeEach(() => fake.llm.mockReset());

describe("generateDebate", () => {
  it("returns validated rounds + verdict from the LLM", async () => {
    fake.llm.mockResolvedValue({
      data: {
        rounds: [
          { skeptic: "Is light even energy?", enthusiast: "Photons say yes — here's why." },
          { skeptic: "Fine, but efficiency?", enthusiast: "RuBisCO disagrees with your doubt." },
          { skeptic: "And in the dark?", enthusiast: "That's why plants sleep." },
        ],
        verdict: "Skeptic was right about limits; enthusiast about potential.",
      },
    });
    const r = await generateDebate({ topic: "Photosynthesis", subject: "Biology", brief: "b" });
    expect(r.rounds).toHaveLength(3);
    expect(r.rounds[0].skeptic).toContain("light");
    expect(r.verdict).toContain("Skeptic");
    const call = fake.llm.mock.calls[0][0] as { maxTokens: number };
    expect(call.maxTokens).toBeGreaterThan(1000);
  });
  it("filters malformed rounds and never returns more than 3", async () => {
    fake.llm.mockResolvedValue({
      data: {
        rounds: [
          { skeptic: "a", enthusiast: "b" },
          { skeptic: "", enthusiast: "" },
          { skeptic: "c", enthusiast: "d" },
          { skeptic: "e", enthusiast: "f" },
        ],
        verdict: "v",
      },
    });
    const r = await generateDebate({ topic: "T", subject: "S", brief: "" });
    expect(r.rounds).toHaveLength(3);
    expect(r.rounds.every((x) => x.skeptic && x.enthusiast)).toBe(true);
  });
});

describe("generateMnemonic", () => {
  it("returns only known kinds with bodies", async () => {
    fake.llm.mockResolvedValue({
      data: {
        items: [
          { kind: "acronym", body: "**PMAT**", covers: ["prophase"] },
          { kind: "vibes", body: "bad kind", covers: [] },
          { kind: "phrase", body: "The **cat** chased **light**.", covers: ["cat"] },
          { kind: "peg", body: "One sun, two photons.", covers: [] },
        ],
      },
    });
    const items = await generateMnemonic({ topic: "Mitosis", subject: "Biology", brief: "b" });
    expect(items.map((i) => i.kind)).toEqual(["acronym", "phrase", "peg"]);
  });
});

describe("buildReviewItems", () => {
  it("assembles terms, weak areas, and a quiz rematch deterministically", () => {
    const items = buildReviewItems({
      missedTerms: ["RuBisCO", "stroma", "thylakoid", "NADPH", "extra"],
      weakAreas: ["dark reactions"],
      lastScore: { score: 2, total: 4 },
      quizAttempts: 3,
    });
    expect(items.filter((i) => i.kind === "term")).toHaveLength(4); // capped at 4
    expect(items.filter((i) => i.kind === "weak_area")).toHaveLength(1);
    expect(items.filter((i) => i.kind === "quiz")).toHaveLength(1);
    expect(items[0].drill).toBe("say_it_back");
  });
  it("skips the quiz item when the last score was strong", () => {
    const items = buildReviewItems({
      missedTerms: [], weakAreas: [], lastScore: { score: 19, total: 20 }, quizAttempts: 5,
    });
    expect(items).toHaveLength(0);
  });
});

describe("resolveNewIntentFromText", () => {
  it("matches the three new intents deterministically", () => {
    expect(resolveNewIntentFromText("what should I redo today")).toBe("review_queue");
    expect(resolveNewIntentFromText("show me my review queue")).toBe("review_queue");
    expect(resolveNewIntentFromText("debate photosynthesis")).toBe("debate_topic");
    expect(resolveNewIntentFromText("give me a mnemonic for the light reactions")).toBe("make_mnemonic");
    expect(resolveNewIntentFromText("teach me photosynthesis")).toBeNull();
  });
});