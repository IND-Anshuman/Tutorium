import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock llm.ts before importing agents.ts — capture every call's args.
const captured: Array<{ system: string; user: string; maxTokens?: number }> = [];
vi.mock("./llm", () => ({
  llmJson: vi.fn(async (_args: { system: string; user: string; maxTokens?: number }) => {
    captured.push(_args);
    return {
      data: {
        clean_notes: "# Notes",
        reviewer: "- one",
        summary: "A summary of the topic.",
        flashcards: [{ front: "Q1", back: "A1" }],
        quiz: [{ question: "What?", choices: ["a", "b", "c", "d"], answer: "0", explanation: "Because.", trap: "Tempting." }],
        story: "A story.",
        brief: "A brief.",
        key_terms: ["term"],
        reply: "Teaching reply.",
        enriched: [
          { kind: "card", index: 0, back: "A long enriched explanation of the concept." },
          { kind: "quiz", index: 0, explanation: "A long enriched explanation of the concept." },
        ],
      },
    };
  }),
}));

import { buildSourceExcerpt, createStudyPack, enrichThinItems, THIN_CARD_BACK, THIN_EXPLANATION } from "./agents";

beforeEach(() => {
  captured.length = 0;
});

describe("buildSourceExcerpt", () => {
  it("returns empty string for empty source", () => {
    expect(buildSourceExcerpt("")).toBe("");
    expect(buildSourceExcerpt("   \n  ")).toBe("");
  });
  it("returns the source untouched when under the cap", () => {
    expect(buildSourceExcerpt("hello world")).toBe("hello world");
  });
  it("caps at ~4k chars, keeps head AND tail, elides the deep middle", () => {
    // Geometry: cap 4000 → head 2600, tail 1200. Build so the sentinel sits
    // strictly inside the elided span (chars 2600..3800 of 5000 total).
    const src =
      "A".repeat(2600) +
      "X".repeat(600) +
      "DEEPMIDDLESENTINEL" +
      "Y".repeat(600) +
      "B".repeat(1200);
    const ex = buildSourceExcerpt(src, 4000);
    expect(ex.length).toBeLessThanOrEqual(4200);
    expect(ex.startsWith("A")).toBe(true);
    expect(ex.endsWith("B")).toBe(true); // tail kept — conclusions live late in notes
    expect(ex).toMatch(/…/);
    expect(ex).not.toContain("DEEPMIDDLESENTINEL"); // deep middle elided
  });
});

describe("two-channel grounding", () => {
  // The three pack sub-calls, identified by system prompt (robust to the extra
  // enrich pass that may add a 4th call).
  const packCalls = () => captured.filter((c) => /study notes|recap materials|assessment tools|memorable story/.test(c.system));
  it("passes sourceExcerpt into every pack sub-call", async () => {
    await createStudyPack({
      topic: "Photosynthesis",
      subject: "Biology",
      brief: "A short brief.",
      sourceExcerpt: "SOURCE MARKER unique-string-12345",
    });
    expect(packCalls().length).toBe(4);
    for (const c of packCalls()) {
      expect(c.user).toContain("SOURCE MARKER unique-string-12345");
      expect(c.user).toContain("authoritative");
    }
  });
  it("omits the source block when no excerpt is given", async () => {
    await createStudyPack({ topic: "T", subject: "S", brief: "B" });
    expect(packCalls().length).toBe(4);
    for (const c of packCalls()) expect(c.user).not.toContain("authoritative");
  });
});

describe("detail-scaled budgets", () => {
  it("scales packCore maxTokens with detail level", async () => {
    await createStudyPack({ topic: "T", subject: "S", brief: "B", detail: "light" });
    const lightNotes = captured.filter((c) => c.system.includes("study notes")).at(-1)!;
    await createStudyPack({ topic: "T", subject: "S", brief: "B", detail: "deep" });
    const deepNotes = captured.filter((c) => c.system.includes("study notes")).at(-1)!;
    expect(lightNotes.maxTokens).toBe(2000);
    expect(deepNotes.maxTokens).toBe(4600);
    // deep prompt carries the completeness instruction
    expect(deepNotes.system).toMatch(/exhaustive|completeness/i);
  });
  it("core is split: notes call and recap call both fire", async () => {
    await createStudyPack({ topic: "T", subject: "S", brief: "B" });
    expect(captured.some((c) => c.system.includes("study notes"))).toBe(true);
    expect(captured.some((c) => c.system.includes("recap materials"))).toBe(true);
  });
  it("default detail is standard", async () => {
    await createStudyPack({ topic: "T", subject: "S", brief: "B" });
    const notes = captured.filter((c) => c.system.includes("study notes")).at(-1)!;
    expect(notes.maxTokens).toBe(3200);
  });
  it("assess band budget scales with detail too", async () => {
    await createStudyPack({ topic: "T", subject: "S", brief: "B", detail: "deep" });
    const assess = captured.filter((c) => c.system.includes("assessment tools")).at(-1)!;
    // default pack = 4q/6c: (450 + 4*220 + 6*130) * 1.5 = 2214 * 1.5 ≈ 3321
    // light for the same shape: * 0.7 ≈ 1550
    expect(assess.maxTokens).toBeGreaterThan(3000);
  });
});

describe("enrichThinItems", () => {
  it("constants are raised above the old strip-floors", () => {
    expect(THIN_CARD_BACK).toBeGreaterThanOrEqual(40);
    expect(THIN_EXPLANATION).toBeGreaterThanOrEqual(60);
  });
  it("identifies thin items, merges enriched text back by index", async () => {
    const cards = [
      { front: "Q1", back: "Short." },                    // thin
      { front: "Q2", back: "A".repeat(THIN_CARD_BACK + 10) }, // solid
    ];
    const quiz = [
      { question: "W?", choices: ["a", "b", "c", "d"], answer: "0", explanation: "Tiny.", trap: "" }, // thin
    ];
    const r = await enrichThinItems({ topic: "T", brief: "B", flashcards: cards, quiz });
    // one LLM call fired for the enrichment
    expect(captured.length).toBe(1);
    expect(captured[0].system).toMatch(/deepen|fuller/i);
    expect(captured[0].user).toContain("Short.");       // thin item sent out
    expect(captured[0].user).not.toContain("A".repeat(THIN_CARD_BACK + 10)); // solid not sent
    expect(r.flashcards[0].back).toBe("A long enriched explanation of the concept.");
    expect(r.flashcards[1].back).toBe(cards[1].back);   // solid untouched
    expect(r.quiz[0].explanation).toBe("A long enriched explanation of the concept.");
  });
  it("keeps originals when the enrichment call fails (never drops items)", async () => {
    const { llmJson } = await import("./llm");
    vi.mocked(llmJson).mockImplementationOnce(async () => { throw new Error("provider down"); });
    const cards = [{ front: "Q1", back: "Short." }];
    const r = await enrichThinItems({ topic: "T", brief: "B", flashcards: cards, quiz: [] });
    expect(r.flashcards[0].back).toBe("Short."); // original survives
  });
  it("no-op without thin items: zero LLM calls", async () => {
    captured.length = 0;
    const long = "A".repeat(THIN_CARD_BACK + 20);
    const r = await enrichThinItems({
      topic: "T", brief: "B",
      flashcards: [{ front: "Q", back: long }],
      quiz: [{ question: "W?", choices: ["a", "b", "c", "d"], answer: "0", explanation: "E".repeat(THIN_EXPLANATION + 10), trap: "" }],
    });
    expect(captured.length).toBe(0);
    expect(r.flashcards[0].back).toBe(long);
  });
});