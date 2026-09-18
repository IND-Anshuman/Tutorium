import { describe, expect, it, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => ({ llmJson: vi.fn() }));
vi.mock("./llm", () => ({ llmJson: fake.llmJson }));

import { summarizeText, parseSummaryLength } from "./summarizer";

beforeEach(() => {
  fake.llmJson.mockReset();
});

describe("parseSummaryLength", () => {
  it("parses quick/standard/deep from the message", () => {
    expect(parseSummaryLength("summarize this quickly")).toBe("quick");
    expect(parseSummaryLength("give me a deep summary")).toBe("deep");
    expect(parseSummaryLength("summarize this")).toBe("standard");
  });
});

describe("summarizeText", () => {
  it("calls the LLM once and returns summary + keyTerms", async () => {
    fake.llmJson.mockResolvedValue({ data: { summary: "Photosynthesis makes food from light.", key_terms: ["chlorophyll"] }, runtime: { provider: "featherless", model: "m", fallback: false } });
    const r = await summarizeText({ text: "some long text about plants".repeat(60), length: "standard" });
    expect(fake.llmJson).toHaveBeenCalledTimes(1);
    expect(r.summary).toContain("Photosynthesis");
    expect(r.keyTerms).toEqual(["chlorophyll"]);
    const call = fake.llmJson.mock.calls[0][0];
    expect(call.system).toContain("tutor");
    expect(call.maxTokens).toBeGreaterThan(300);
  });

  it("deep length requests more tokens than quick", async () => {
    fake.llmJson.mockResolvedValue({ data: { summary: "s", key_terms: [] } });
    await summarizeText({ text: "x", length: "deep" });
    const deepTokens = fake.llmJson.mock.calls[0][0].maxTokens;
    await summarizeText({ text: "x", length: "quick" });
    const quickTokens = fake.llmJson.mock.calls[1][0].maxTokens;
    expect(deepTokens).toBeGreaterThan(quickTokens);
  });

  it("throws a typed error when the LLM fails so the caller can coach instead of lie", async () => {
    fake.llmJson.mockRejectedValue(new Error("provider down"));
    await expect(summarizeText({ text: "x", length: "standard" })).rejects.toThrow("provider down");
  });
});