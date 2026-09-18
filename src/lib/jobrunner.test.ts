import { beforeEach, afterEach, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  getJob: vi.fn(), setJobStatus: vi.fn(), saveMessage: vi.fn(),
  getMaterial: vi.fn(), saveMaterial: vi.fn(), select: vi.fn(),
  orchestrate: vi.fn(),
}));
vi.mock("./db", () => ({
  default: { prepare: () => ({ get: fake.select }) },
  getJob: fake.getJob, setJobStatus: fake.setJobStatus,
  saveMessage: fake.saveMessage, getMaterial: fake.getMaterial,
  saveMaterial: fake.saveMaterial, asInteractive: (p: unknown) => p,
}));
vi.mock("./orchestrate", () => ({ orchestrateTurn: fake.orchestrate }));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network in worker tests"); }));
  fake.select.mockReturnValue({ id: "job-1" });
  fake.getJob.mockReturnValue({ user_id: "test-user", payload: {
    topicId: "topic-1", sessionId: "session-1", topicTitle: "Plants",
    subjectName: "Science", message: "Study notes", classification: { intent: "create_study_pack" },
  }});
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("persists the completed reply and widget under the originating session before marking done", async () => {
  const interactive = { type: "study_pack_actions", topicId: "topic-1", topic: "Plants", actions: [] };
  fake.orchestrate.mockResolvedValue({ reply: "Only notes were generated.", interactive, intent: "create_study_pack" });
  const { startJobRunner } = await import("./jobrunner");
  startJobRunner(); await vi.advanceTimersByTimeAsync(1500);
  expect(fake.saveMessage).toHaveBeenCalledWith("topic-1", "assistant", "Only notes were generated.", interactive, null, { sessionId: "session-1" });
  expect(fake.setJobStatus).toHaveBeenLastCalledWith("job-1", "done", expect.objectContaining({ reply: "Only notes were generated.", interactive }));
  expect(fake.saveMessage.mock.invocationCallOrder[0]).toBeLessThan(fake.setJobStatus.mock.invocationCallOrder.at(-1)!);
});

it("persists an honest failure reply rather than a successful completion", async () => {
  fake.orchestrate.mockRejectedValue(new Error("offline provider failure"));
  const { startJobRunner } = await import("./jobrunner");
  startJobRunner(); await vi.advanceTimersByTimeAsync(1500);
  expect(fake.saveMessage).toHaveBeenCalledWith("topic-1", "assistant", expect.stringContaining("hit a snag"), null, null, { sessionId: "session-1" });
  expect(fake.setJobStatus).toHaveBeenLastCalledWith("job-1", "failed", expect.objectContaining({ reply: expect.stringContaining("hit a snag") }));
  expect(fake.setJobStatus.mock.calls.some(c => c[1] === "done")).toBe(false);
});
