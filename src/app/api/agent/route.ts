import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/identity";
import { checkRateLimit, checkDailyBudget, recordLlmCall, LIMITS, DAILY_LLM_BUDGET, callsToday, pruneBuckets } from "@/lib/limits";
import {
  getOrCreateProfile,
  updateProfile,
  saveMessage,
  listMessages,
  findOrCreateSubject,
  findOrCreateTopic,
  getTopic,
  getSubject,
  saveMaterial,
  getMaterial,
  createJob,
  asInteractive,
  getSession,
  getLastOpenSession,
  createSession,
  renameSession,
  bumpSessionTopicCount,
  touchSession,
  getSessionContext,
} from "@/lib/db";
import { classifyMessage, updateMemory, applyMemoryUpdate, isMemoryWorthy, resolveIntentFromText, isTeachQuestion } from "@/lib/agents";
import { llmRuntimeLabel } from "@/lib/llm";
import { orchestrateTurn, type OrcCtx } from "@/lib/orchestrate";
import { startJobRunner } from "@/lib/jobrunner";
import { scheduleCompaction } from "@/lib/context-compactor";
import type { ChatMessage, Classification } from "@/lib/types";
import db from "@/lib/db";

// Start the background job worker when the server boots (guarded singleton).
startJobRunner();

export const maxDuration = 120;

const MAX_MESSAGE_CHARS = 200_000;

interface AgentRequestBody {
  userId: string;
  message: string;
  topicId?: string | null;
  sessionId?: string | null;
  transcriptMeta?: { fromVoice?: boolean; wordCount?: number; avgConfidence?: number } | null;
  document?: { text: string; filename: string; pageCount?: number } | null;
  // background job control: "start" queues a study-pack job and returns immediately
  mode?: "sync" | "job" | "job_status";
  jobId?: string;
}

export async function POST(req: NextRequest) {
  // Declared up-front so the catch block can check whether the request was cancelled.
  const abort = new AbortController();
  try {
    const body = (await req.json()) as AgentRequestBody;
    const userId = await requireUserId();
    pruneBuckets();
    const limited = checkRateLimit(userId, "agent");
    if (limited) {
      return NextResponse.json({ error: limited.friendly }, { status: 429 });
    }
    if (!checkDailyBudget(userId)) {
      return NextResponse.json(
        { error: `You've hit today's tutoring budget (${DAILY_LLM_BUDGET} AI calls). The counter resets at midnight — come back tomorrow or explore your library meanwhile.` },
        { status: 429 }
      );
    }

    // ---- job status polling ----
    if (body.mode === "job_status") {
      if (!body.jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
      const { getJob } = await import("@/lib/db");
      const job = getJob(body.jobId);
      if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
      return NextResponse.json({ job: { id: job.id, kind: job.kind, status: job.status, result: job.result } });
    }

    const message = (body.message || "").trim();
    if (!message && !body.document?.text) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json({ error: `message too long (max ${MAX_MESSAGE_CHARS} chars)` }, { status: 400 });
    }

    // ---- resolve / create the active session ----
    let sessionId: string | null = null;
    {
      let s: any = null;
      if (body.sessionId) s = getSession(body.sessionId);
      if (!s && body.topicId) {
        const t = getTopic(body.topicId);
        if (t) {
          // legacy: link to the session that owns this topic's most-recent activity
          const recent = db
            .prepare(
              `SELECT session_id FROM messages WHERE topic_id = ? AND session_id IS NOT NULL
               ORDER BY created_at DESC LIMIT 1`
            )
            .get(body.topicId) as { session_id: string } | undefined;
          if (recent?.session_id) s = getSession(recent.session_id);
        }
      }
      if (!s) s = getLastOpenSession(userId);
      if (!s) {
        sessionId = createSession(userId, ""); // domain auto-named after classify
      } else {
        sessionId = s.id;
      }
    }

    // ---- normal sync turn (auto-queues heavy create_study_pack below) ----
    const profile = getOrCreateProfile(userId);
    const history: ChatMessage[] = listMessages(body.topicId || "")
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .slice(-10)
      .map((m: any) => ({ role: m.role, content: m.content }));

    let subject: any;
    let topic: any;
    if (body.topicId) {
      const t = getTopic(body.topicId);
      const s = t ? getSubject(t.subject_id) : null;
      if (t && s) {
        subject = s;
        topic = t;
      }
    }

    // #3 token opt + normal-use safeguard: when the topic is already locked, the
    // classifier only needs to pick an INTENT. For obvious keyword requests we
    // skip the LLM entirely (instant, zero tokens, no model dependency); only
    // genuinely ambiguous messages reach the classifier (with empty history).
    // Attached document: bypass classification entirely — the document branch
    // in the orchestrator parses the sub-intent (plan / summarize / quiz).
    let classification: Classification;
    if (body.document?.text) {
      classification = {
        subject: subject?.name || "General", subcategory: "General",
        topic: subject && topic ? topic.title : body.document.filename.replace(/\.[^.]+$/, "").slice(0, 80) || "Document",
        intent: "make_summary" as const, confidence: 1,
      };
    } else {
      const fastIntent = topic ? resolveIntentFromText(message) : null;
      classification = fastIntent
        ? { subject: subject.name, subcategory: "General", topic: topic.title, intent: fastIntent, confidence: 1 }
        : await classifyMessage(message, topic ? [] : history, abort.signal, sessionId ? getSessionContext(sessionId) : null);
    }
    if (subject && topic) {
      classification = { ...classification, subject: subject.name, topic: topic.title };
    }
    if (!topic) {
      subject = findOrCreateSubject(userId, classification.subject);
      topic = findOrCreateTopic(subject.id, classification.topic, classification.subcategory);
    }

    // Guardrail: a clear question misclassified as something else (flaky model)
    // should still teach — never let an obvious "explain X" become say_it_back.
    if (isTeachQuestion(message, classification.intent)) {
      classification = { ...classification, intent: "teach_topic" };
    }

    saveMessage(topic.id, "user", message, null, body.transcriptMeta || null, { sessionId });

    // Gentle auto-rename: only if the session still has its placeholder name and
    // the user hasn't locked it. User edits always lock, so we never overwrite
    // their choice.
    if (sessionId) {
      const cur = getSession(sessionId);
      if (cur && !cur.domain_locked && (cur.domain === "" || cur.domain === "New session")) {
        renameSession(sessionId, `${subject.name} · ${topic.title}`);
      }
      // Bump topic_count the first time we create a real topic for this session.
      if (topic && (!cur || (cur.topic_count || 0) === 0)) {
        bumpSessionTopicCount(sessionId);
      }
      touchSession(sessionId);
    }

    // Heavy generations (study pack, visual) never block the response: hand them
    // to the background runner and return a 202 with a jobId the client polls.
    if (classification.intent === "create_study_pack" || classification.intent === "make_visual") {
      recordLlmCall(userId);
      const jobId = createJob(userId, classification.intent === "make_visual" ? "visual" : "study_pack", {
        topicId: topic.id,
        message,
        topicTitle: topic.title,
        subjectName: subject.name,
        classification,
        sessionId,
      });
      return NextResponse.json({
        queued: true,
        jobId,
        topicId: topic.id,
        topicTitle: topic.title,
        subjectId: subject.id,
        subjectName: subject.name,
        intent: classification.intent,
        sessionId,
        pretty: classification.intent === "make_visual"
          ? "Drawing the visual guide — it'll be ready in a moment."
          : "I'm building your study pack — it'll be ready in a moment.",
      });
    }

    const ctx: OrcCtx = {
      userId,
      topicId: topic.id,
      topicTitle: topic.title,
      subjectName: subject.name,
      classification,
      history,
      profile: { learning_style: profile.learning_style, strengths: profile.strengths, weaknesses: profile.weaknesses },
      getMaterial,
      saveMaterial,
      message,
      signal: abort.signal,
      sessionCtx: sessionId ? getSessionContext(sessionId) : null,
      document: body.document?.text
        ? { text: String(body.document.text).slice(0, 200_000), filename: (body.document.filename || "document").slice(0, 160), pageCount: body.document.pageCount }
        : null,
    };

    recordLlmCall(userId);
    const result = await orchestrateTurn(ctx);
    const reply = result.reply;

    // Schedule a debounced compaction of the session's domain context. Picks up
    // the most recent messages from the DB so we don't have to pass them in.
    if (sessionId) {
      const recent = db
        .prepare(`SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 6`)
        .all(sessionId) as Array<{ role: string; content: string }>;
      scheduleCompaction(sessionId, recent.reverse());
    }

    // #1 token opt: only fire the memory LLM call when the exchange carries a
    // durable signal (correction, stated goal, self-assessment, inferred struggle).
    if (isMemoryWorthy(message, reply)) {
      updateMemoryAsync(userId, profile, message, reply);
    }

    saveMessage(topic.id, "assistant", reply, asInteractive(result.interactive), null, { sessionId });

    // Compact session context preview for the client (≤180 chars) so the
    // context-strip widget can render what the tutor knows about this domain.
    let sessionCtxPreview: string | null = null;
    if (sessionId) {
      const ctx = getSessionContext(sessionId);
      if (ctx.summary) sessionCtxPreview = ctx.summary.slice(0, 180);
    }

    return NextResponse.json({
      reply,
      interactive: result.interactive,
      topicId: topic.id,
      topicTitle: topic.title,
      subjectId: subject.id,
      subjectName: subject.name,
      intent: result.intent,
      sessionId,
      sessionCtxPreview,
      runtime: llmRuntimeLabel(),
    });
  } catch (err) {
    // User-initiated cancel: surface as 499-like response so the client doesn't see 500.
    const aErr = err as Error | undefined;
    if (aErr?.name === "AbortError" || abort?.signal.aborted) {
      return NextResponse.json({ cancelled: true }, { status: 499 });
    }
    console.error("agent error:", err);
    return NextResponse.json({ error: (err as Error).message || "agent failed" }, { status: 500 });
  }
}


// Run the memory update without awaiting; failures are swallowed.
function updateMemoryAsync(
  userId: string,
  profile: { learning_style: string; strengths: string[]; weaknesses: string[] },
  message: string,
  reply: string
) {
  (async () => {
    try {
      const upd = await updateMemory({ message, reply, profile });
      const applied = applyMemoryUpdate(profile, upd);
      updateProfile(userId, {
        learning_style: applied.learning_style,
        strengths: applied.strengths,
        weaknesses: applied.weaknesses,
        next_recommended_action: applied.next_recommended_action,
      });
    } catch (e) {
      console.warn("memory update skipped:", (e as Error).message);
    }
  })();
}