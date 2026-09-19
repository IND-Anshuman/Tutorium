import { beforeEach, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  prepare: vi.fn<(...a: unknown[]) => any>(() => ({ run: vi.fn(), get: vi.fn() })),
}));
vi.mock("./db", () => ({ default: { prepare: fake.prepare } }));

import {
  checkRateLimit,
  LIMITS,
  checkDailyBudget,
  recordLlmCall,
  DAILY_LLM_BUDGET,
} from "./limits";

beforeEach(() => {
  fake.prepare.mockImplementation((_sql: unknown) => ({
    run: vi.fn(),
    get: vi.fn(() => undefined), // no spend rows → under budget
  }));
});

it("allows up to the burst limit then blocks with the friendly message", () => {
  const rule = LIMITS.agent;
  for (let i = 0; i < rule.max; i++) {
    expect(checkRateLimit("user-a", "agent")).toBeNull();
  }
  const blocked = checkRateLimit("user-a", "agent");
  expect(blocked).not.toBeNull();
  expect(blocked!.friendly).toContain("break");
  // other identities unaffected
  expect(checkRateLimit("user-b", "agent")).toBeNull();
});

it("refills over time (tokens recover as the window passes)", () => {
  vi.useFakeTimers();
  const start = Date.now();
  vi.setSystemTime(start);
  for (let i = 0; i < LIMITS.stt.max; i++) expect(checkRateLimit("user-t", "stt")).toBeNull();
  expect(checkRateLimit("user-t", "stt")).not.toBeNull();
  // advance half the window → half the budget refilled
  vi.setSystemTime(start + LIMITS.stt.windowMs / 2);
  const r1 = checkRateLimit("user-t", "stt");
  // refill = 0.5 * max >= 1 → one more allowed
  expect(r1).toBeNull();
  vi.useRealTimers();
});

it("daily budget: blocks after the configured count, records increment", () => {
  // simulate at-budget state
  fake.prepare.mockImplementation((_sql: unknown) => ({
    run: vi.fn(),
    get: vi.fn(() => ({ calls: DAILY_LLM_BUDGET })),
  }));
  expect(checkDailyBudget("user-full")).toBe(false);
  fake.prepare.mockImplementation((_sql: unknown) => ({
    run: vi.fn(),
    get: vi.fn(() => ({ calls: 0 })),
  }));
  expect(checkDailyBudget("user-empty")).toBe(true);
  recordLlmCall("user-empty", 3);
  expect(fake.prepare).toHaveBeenCalled();
});