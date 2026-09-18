import { describe, expect, it, vi, beforeEach } from "vitest";

// Orchestrate test: document/pasted-text summary path with mocked LLM + persistence.
const fake = vi.hoisted(() => ({
  llm: vi.fn(),
  getMaterial: vi.fn<() => { content: Record<string, unknown> } | null>(() => null),
  saveMaterial: vi.fn(),
}));
vi.mock("./llm", () => ({ llmJson: fake.llm }));
vi.mock("./agents", () => ({
  createStudyPack: vi.fn(),
  createFlashcardsOnly: vi.fn(),
  createQuizOnly: vi.fn(),
  teachTopic: vi.fn(),
  generateVisual: vi.fn(),
  gradeTeachBack: vi.fn(),
  generateSceneBrief: vi.fn(),
  resolveIntentFromText: vi.fn(() => null),
  isTeachQuestion: vi.fn(() => false),
  isMemoryWorthy: vi.fn(() => false),
  applyMemoryUpdate: vi.fn(),
  classifyMessage: vi.fn(),
  updateMemory: vi.fn(),
}));

import { orchestrateTurn, type OrcCtx } from "./orchestrate";

function ctx(message: string): OrcCtx {
  return {
    userId: "u1", topicId: "t1", topicTitle: "Photosynthesis", subjectName: "Biology",
    classification: { subject: "Biology", subcategory: "General", topic: "Photosynthesis", intent: "make_summary", confidence: 1 },
    history: [], profile: null,
    getMaterial: fake.getMaterial, saveMaterial: fake.saveMaterial,
    message, sessionCtx: null,
  };
}

beforeEach(() => { fake.llm.mockReset(); fake.saveMaterial.mockReset(); fake.getMaterial.mockReset(); fake.getMaterial.mockReturnValue(null); });

it("summarizes freshly pasted text and wires the say-it-back passage", async () => {
  fake.llm.mockResolvedValue({ data: { summary: "Plants convert light into glucose.", key_terms: ["chlorophyll", "glucose"] } });
  const body = "Long text about photosynthesis. ".repeat(30); // >400 chars
  const r = await orchestrateTurn(ctx(`summarize this: ${body}`));
  expect(r.reply).toContain("Plants convert light");
  expect(r.reply).toContain("say it back");
  expect(fake.saveMaterial).toHaveBeenCalledWith("t1", "summary", "Photosynthesis — Summary", { text: "Plants convert light into glucose." });
  expect(fake.saveMaterial).toHaveBeenCalledWith("t1", "sayitback", "Photosynthesis — Say-It-Back passage", { passage: "Plants convert light into glucose.", keyTerms: ["chlorophyll", "glucose"] });
});

it("summarize-on-demand failure coaches honestly instead of fabricating", async () => {
  fake.llm.mockRejectedValue(new Error("provider 500"));
  const body = "Long text. ".repeat(80);
  const r = await orchestrateTurn(ctx(`summarize this: ${body}`));
  expect(r.reply).toContain("couldn't summarize");
  expect(r.reply).toContain("provider 500");
  expect(fake.saveMaterial).not.toHaveBeenCalled();
});

it("bare 'summarize' with stored summary replays it with the drill offer", async () => {
  fake.getMaterial.mockReturnValue({ content: { text: "Stored summary text." } });
  const r = await orchestrateTurn(ctx("summarize this"));
  expect(r.reply).toContain("Stored summary text.");
  expect(r.reply).toContain("say it back");
});

it("bare 'summarize' with nothing stored coaches instead of lying", async () => {
  const r = await orchestrateTurn(ctx("summarize this"));
  expect(r.reply).toContain("No summary yet");
});