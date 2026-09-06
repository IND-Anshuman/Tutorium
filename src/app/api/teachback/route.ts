import { NextRequest, NextResponse } from "next/server";
import { llmJson } from "@/lib/llm";
import { getMaterial, saveMaterial, saveMessage } from "@/lib/db";

export const maxDuration = 120;

// Teach-Back: student explains the topic aloud -> transcript (client got it from
// /api/stt) -> LLM grades it against the saved notes.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      userId: string;
      topicId: string;
      transcript: string;
    };
    if (!body.topicId || !body.transcript) {
      return NextResponse.json({ error: "topicId and transcript required" }, { status: 400 });
    }

    const notes =
      getMaterial(body.topicId, "clean_notes")?.content?.text ||
      getMaterial(body.topicId, "reviewer")?.content?.text ||
      getMaterial(body.topicId, "summary")?.content?.text;

    if (!notes) {
      return NextResponse.json({ error: "no study material for this topic yet — create a study pack first" }, { status: 400 });
    }

    const grading = await llmJson<{ verdict: string; missed: string[]; next_step: string }>({
      system: `A student tried to explain a topic in their own words (Feynman technique). Grade the explanation against the source material.
Return JSON: {"verdict": 1-2 sentence assessment, "missed": [2-4 key points they skipped or got wrong], "next_step": one concrete action}`,
      user: `Source material:
"""${String(notes).slice(0, 4000)}"""

Student's spoken explanation:
"""${body.transcript.slice(0, 3000)}"""`,
      maxTokens: 700,
    });

    saveMaterial(body.topicId, "teachback", "Teach-back review", {
      transcript: body.transcript,
      verdict: grading.data.verdict,
      missed: grading.data.missed,
      next_step: grading.data.next_step,
    });

    const interactive = {
      type: "teach_back",
      topic: "Teach-back review",
      topicId: body.topicId,
      transcript: body.transcript,
      verdict: grading.data.verdict,
      missed: grading.data.missed,
      next_step: grading.data.next_step,
    };

    saveMessage(body.topicId, "assistant", grading.data.verdict, { type: "teach_back", topic: "Teach-back review", topicId: body.topicId, transcript: body.transcript, verdict: grading.data.verdict, missed: grading.data.missed, next_step: grading.data.next_step });

    return NextResponse.json({
      verdict: grading.data.verdict,
      missed: grading.data.missed,
      next_step: grading.data.next_step,
      interactive,
    });
  } catch (err) {
    console.error("teachback error:", err);
    return NextResponse.json({ error: (err as Error).message || "teachback failed" }, { status: 500 });
  }
}