import { describe, expect, it, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => ({ llm: vi.fn<(...args: unknown[]) => Promise<unknown>>() }));
vi.mock("./llm", () => ({ llmJson: fake.llm }));

import { chunkDocument, analyzeDocument, buildStudyPlan, parseDocIntent, type DocAnalysis } from "./docthink";

beforeEach(() => fake.llm.mockReset());

describe("chunkDocument", () => {
  it("short docs stay single-chunk", () => {
    expect(chunkDocument("short text", 3500)).toEqual(["short text"]);
    expect(chunkDocument("", 3500)).toEqual([]);
  });
  it("splits long docs without breaking sentences, with overlap", () => {
    const sentences = Array.from({ length: 200 }, (_, i) => `Sentence number ${i} explains a concept clearly.`).join(" ");
    const chunks = chunkDocument(sentences, 800, 100);
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(c.endsWith("clearly.")).toBe(true);
    const first = chunks[0];
    expect(chunks[1].includes(first.slice(-60))).toBe(true);
  });
});

describe("analyzeDocument", () => {
  const outline = { summary: "s", key_terms: ["t1"], difficulty: "intermediate", prerequisites: [] };
  it("single call for short docs", async () => {
    fake.llm.mockResolvedValue({ data: { ...outline, summary: "short doc summary" } });
    const r = await analyzeDocument({ text: "x".repeat(500), filename: "a.pdf" });
    expect(fake.llm).toHaveBeenCalledTimes(1);
    expect(r.summary).toBe("short doc summary");
    expect(r.filename).toBe("a.pdf");
  });
  it("map-reduce for long docs", async () => {
    fake.llm.mockResolvedValue({ data: { ...outline, summary: "part summary" } });
    await analyzeDocument({ text: "Sentence. ".repeat(2000), filename: "b.pdf" });
    expect(fake.llm.mock.calls.length).toBeGreaterThan(2);
  });
  it("reduce failure falls back to concatenated outlines, never throws", async () => {
    const longText = "Sentence. ".repeat(2000);
    const chunkCount = chunkDocument(longText).length;
    const calls: Array<{ system?: string }> = [];
    fake.llm.mockImplementation((...args: unknown[]) => {
      const a = args[0] as { system?: string } | undefined;
      if (!a) return Promise.resolve({ data: {} }); // vitest 4 cleanup probe call
      calls.push(a);
      const isReduce = (a.system || "").includes("merge section outlines");
      if (isReduce) return Promise.reject(new Error("reduce failed"));
      return Promise.resolve({ data: { ...outline, summary: `outline ${calls.length}` } });
    });
    const r = await analyzeDocument({ text: longText, filename: "c.pdf" });
    expect(r.summary).toContain("outline 1");
    expect(r.summary).toContain(`outline ${chunkCount}`);
  });
});

describe("buildStudyPlan", () => {
  const analysis: DocAnalysis = {
    filename: "d.pdf", pageCount: 4, summary: "Doc summary",
    keyTerms: ["t1", "t2", "t3", "t4", "t5", "t6"], sections: [], difficulty: "intermediate", prerequisites: [],
  };
  it("uses the LLM plan when it returns days", async () => {
    fake.llm.mockResolvedValue({ data: { days: [{ day: 1, focus: "f", tasks: ["t"], minutes: 30, drill: "quiz" }] } });
    const plan = await buildStudyPlan({ analysis, days: 5 });
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].focus).toBe("f");
  });
  it("falls back to a deterministic skeleton when the LLM fails", async () => {
    fake.llm.mockImplementation((a?: unknown) =>
      a === undefined ? Promise.resolve({ data: {} }) : Promise.reject(new Error("down"))
    );
    const plan = await buildStudyPlan({ analysis, days: 5 });
    expect(plan.days).toHaveLength(5);
    expect(plan.days[4].focus).toContain("review");
    expect(plan.days.every((d) => d.tasks.length > 0)).toBe(true);
    expect(plan.days.every((d) => ["quiz", "flashcards", "say_it_back", "teach_back"].includes(d.drill))).toBe(true);
  });
});

describe("parseDocIntent", () => {
  it("parses plan / quiz / summarize", () => {
    expect(parseDocIntent("make me a study plan for this")).toBe("plan");
    expect(parseDocIntent("quiz me on this document")).toBe("quiz");
    expect(parseDocIntent("what does this say?")).toBe("summarize");
  });
});