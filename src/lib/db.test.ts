import { describe, it, expect } from "vitest";
import {
  createSession,
  getSession,
  listMessagesBySession,
  saveMessage,
  bumpSessionTopicCount,
  renameSession,
  getSessionContext,
  setSessionContext,
  defaultContext,
  uid,
} from "./db";

describe("sessions", () => {
  const userId = "t-" + uid();

  it("creates + reads a session", () => {
    const id = createSession(userId, "Biology");
    const s = getSession(id);
    expect(s.domain).toBe("Biology");
    expect(s.status).toBe("open");
  });

  it("round-trips messages by session", () => {
    const sId = createSession(userId, "Calc");
    const m = uid();
    saveMessage(null, "user", "hello", null, null, { sessionId: sId, id: m });
    const list = listMessagesBySession(sId);
    expect(list.find((x) => x.id === m)?.content).toBe("hello");
  });

  it("bumpSessionTopicCount + renameSession guard", () => {
    const sId = createSession(userId, "Spanish");
    bumpSessionTopicCount(sId);
    bumpSessionTopicCount(sId);
    expect(getSession(sId).topic_count).toBe(2);
    renameSession(sId, "Spanish for travel");
    renameSession(sId, "Renamed");
    expect(getSession(sId).domain).toBe("Spanish for travel");

    const lockedId = createSession(userId, "Locked", { domainLocked: true });
    renameSession(lockedId, "Try to rename");
    expect(getSession(lockedId).domain).toBe("Locked");
  });

  it("set/get context", () => {
    const sId = createSession(userId, "Music Theory");
    const ctx = {
      ...defaultContext(),
      summary: "we are learning chord progressions",
      level: "beginner",
      key_terms: ["triad", "inversion"],
    };
    setSessionContext(sId, ctx);
    const got = getSessionContext(sId);
    expect(got.summary).toContain("chord");
    expect(got.level).toBe("beginner");
    expect(got.key_terms).toEqual(["triad", "inversion"]);
  });
});