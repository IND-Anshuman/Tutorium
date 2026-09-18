import { describe, expect, it, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => ({ llm: vi.fn<(...a: unknown[]) => Promise<unknown>>() }));
vi.mock("./llm", () => ({ llmJson: fake.llm }));

import { parseLevelOverride } from "./agents";

beforeEach(() => fake.llm.mockReset());

describe("parseLevelOverride", () => {
  it("detects beginner asks", () => {
    expect(parseLevelOverride("explain it like I'm five")).toBe("beginner");
    expect(parseLevelOverride("can you explain it simpler?")).toBe("beginner");
    expect(parseLevelOverride("dumb it down for me")).toBe("beginner");
  });
  it("detects depth asks", () => {
    expect(parseLevelOverride("go deeper on that")).toBe("advanced");
    expect(parseLevelOverride("explain the expert version")).toBe("advanced");
    expect(parseLevelOverride("technical details please")).toBe("advanced");
  });
  it("returns null for neutral questions", () => {
    expect(parseLevelOverride("what is photosynthesis?")).toBeNull();
  });
});