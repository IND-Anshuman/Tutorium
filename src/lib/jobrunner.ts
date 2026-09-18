// Background job runner (single-process demo): polls the jobs table and runs
// pending study-pack generation so /api/agent's heavy path never blocks the UI.
import { getJob, setJobStatus, getMaterial, saveMaterial, saveMessage, asInteractive } from "./db";
import { orchestrateTurn, type OrcCtx } from "./orchestrate";

const POLL_MS = 1500;
const CONCURRENCY = 1;
let started = false;
let running = 0;

export function startJobRunner() {
  if (started) return;
  started = true;
  const timer = setInterval(pump, POLL_MS);
  timer.unref?.();
  if (process.env.NODE_ENV !== "test") console.log("[tutorium] job runner started");
}

async function pump() {
  if (running >= CONCURRENCY) return;
  const __db = (await import("./db")).default;
  const row = __db
    .prepare(`SELECT id FROM jobs WHERE status IN ('pending','running') ORDER BY created_at ASC LIMIT 1`)
    .get() as { id: string } | undefined;
  if (!row) return;
  running++;
  try {
    await runJob(row.id);
  } catch (e) {
    console.error(`job ${row.id} failed:`, (e as Error).message);
    setJobStatus(row.id, "failed", { error: (e as Error).message });
  } finally {
    running--;
  }
}

async function runJob(jobId: string) {
  const job = getJob(jobId);
  if (!job) return;
  setJobStatus(jobId, "running");
  const payload = job.payload as {
    topicId: string;
    message: string;
    topicTitle: string;
    subjectName: string;
    sessionId?: string | null;
    classification: any;
  };

  const ctx: OrcCtx = {
    userId: job.user_id,
    topicId: payload.topicId,
    topicTitle: payload.topicTitle,
    subjectName: payload.subjectName,
    classification: payload.classification,
    history: [],
    message: payload.message,
    getMaterial,
    saveMaterial,
    // jobrunner uses no signal — cancelling a queued background job is out of scope
    // (clients can ignore the poll result). A future improvement is to track
    // an AbortController per job so the route's Cancel can interrupt in-flight jobs.
  };

  let result;
  try {
    result = await orchestrateTurn(ctx);
  } catch (e) {
    // Backstop: even a hard failure must leave an honest, persisted message so
    // the user's chat reflects reality after reload (audit F3/F4).
    const reply = `I hit a snag building **${payload.topicTitle}** — ask me again in a moment and I'll rebuild it.`;
    saveMessage(payload.topicId, "assistant", reply, null, null, { sessionId: payload.sessionId ?? null });
    setJobStatus(jobId, "failed", { error: (e as Error).message, reply });
    return;
  }

  // Persist the completion as a real assistant message so reloads, session
  // switches, and library views stay consistent with the chat (audit F3).
  saveMessage(payload.topicId, "assistant", result.reply, asInteractive(result.interactive), null, {
    sessionId: payload.sessionId ?? null,
  });

  setJobStatus(jobId, "done", {
    topicId: payload.topicId,
    intent: result.intent,
    reply: result.reply,
    interactive: result.interactive,
  });
}
