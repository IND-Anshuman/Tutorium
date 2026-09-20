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
      },
    };
  }),
}));

import { buildSourceExcerpt, createStudyPack } from "./agents";

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
  it("passes sourceExcerpt into every pack sub-call", async () => {
    await createStudyPack({
      topic: "Photosynthesis",
      subject: "Biology",
      brief: "A short brief.",
      sourceExcerpt: "SOURCE MARKER unique-string-12345",
    });
    // core + assess + story = 3 calls; each user prompt must carry the source
    expect(captured.length).toBe(3);
    for (const c of captured) {
      expect(c.user).toContain("SOURCE MARKER unique-string-12345");
      expect(c.user).toContain("authoritative");
    }
  });
  it("omits the source block when no excerpt is given", async () => {
    await createStudyPack({ topic: "T", subject: "S", brief: "B" });
    expect(captured.length).toBe(3);
    for (const c of captured) expect(c.user).not.toContain("AUTHORITATIVE");
  });
});

describe("detail-scaled budgets", () => {
  it("scales packCore maxTokens with detail level", async () => {
    await createStudyPack({ topic: "T", subject: "S", brief: "B", detail: "light" });
    const lightCore = captured[captured.length - 3];
    await createStudyPack({ topic: "T", subject: "S", brief: "B", detail: "deep" });
    const deepCore = captured[captured.length - 3];
    expect(lightCore.maxTokens).toBe(2000);
    expect(deepCore.maxTokens).toBe(4600);
    // deep prompt carries the completeness instruction
    expect(deepCore.system).toMatch(/exhaustive|completeness/i);
  });
  it("default detail is standard", async () => {
    await createStudyPack({ topic: "T", subject: "S", brief: "B" });
    const core = captured[captured.length - 3];
    expect(core.maxTokens).toBe(3200);
  });
  it("assess band budget scales with detail too", async () => {
    await createStudyPack({ topic: "T", subject: "S", brief: "B", detail: "deep" });
    const assess = captured[captured.length - 2];
    // default pack = 4q/6c: (450 + 4*220 + 6*130) * 1.5 = 2214 * 1.5 ≈ 3321
    // light for the same shape: * 0.7 ≈ 1550
    expect(assess.maxTokens).toBeGreaterThan(3000);
  });
});