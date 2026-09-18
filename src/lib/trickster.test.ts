import { describe, expect, it, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => ({ llm: vi.fn() }));
vi.mock("./llm", () => ({ llmJson: fake.llm }));

import { designTricksterTheme, fallbackTheme, DEFAULT_THEME } from "./trickster";
import { validateThemePatch } from "./trickster-schema";

beforeEach(() => fake.llm.mockReset());

describe("validateThemePatch", () => {
  it("accepts a valid patch and applies defaults", () => {
    const t = validateThemePatch({ vibe: "neon lab", accent: "#7c3aed", shuffleChoices: true });
    expect(t).not.toBeNull();
    expect(t!.radius).toBe(16);
    expect(t!.icon).toBe("✅");
    expect(t!.shuffleChoices).toBe(true);
  });
  it("rejects out-of-bounds radius wholesale", () => {
    expect(validateThemePatch({ radius: 999 })).toBeNull();
  });
  it("rejects unknown enum and oversized strings", () => {
    expect(validateThemePatch({ hiddenAnswerStyle: "explode" })).toBeNull();
    expect(validateThemePatch({ message: "x".repeat(300) })).toBeNull();
  });
  it("rejects non-hex accent colors", () => {
    expect(validateThemePatch({ accent: "javascript:alert(1)" })).toBeNull();
  });
});

describe("designTricksterTheme", () => {
  it("returns the validated LLM patch on success", async () => {
    fake.llm.mockResolvedValue({ data: { vibe: "spooky archive", accent: "#b45309", icon: "🕯️", streakMode: true } });
    const t = await designTricksterTheme({ topic: "WW2", subject: "History" });
    expect(t.vibe).toBe("spooky archive");
    expect(t.streakMode).toBe(true);
    expect(fake.llm).toHaveBeenCalledTimes(1);
    const call = fake.llm.mock.calls[0][0];
    expect(call.temperature).toBeGreaterThan(0.8); // the one deliberately-creative call
  });
  it("falls back to the safe default when the LLM fails", async () => {
    fake.llm.mockImplementation((a?: unknown) => a === undefined ? Promise.resolve({ data: {} }) : Promise.reject(new Error("down")));
    const t = await designTricksterTheme({ topic: "WW2", subject: "History" });
    expect(t).toEqual(DEFAULT_THEME);
  });
  it("falls back to the safe default when the LLM returns an invalid patch", async () => {
    fake.llm.mockResolvedValue({ data: { radius: 9999, icon: "<script>" } });
    const t = await designTricksterTheme({ topic: "X", subject: "Y" });
    expect(t).toEqual(DEFAULT_THEME);
  });
  it("deterministic fallback keeps fun alive offline", () => {
    const t = fallbackTheme("quiz");
    expect(t.shuffleChoices).toBe(true);
    expect(t.hintsEnabled).toBe(true);
  });
});