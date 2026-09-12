import { NextRequest, NextResponse } from "next/server";
import { gradeTeachBack } from "@/lib/agents";
import { getMaterial, saveMaterial, saveMessage } from "@/lib/db";

export const maxDuration = 120;

// Teach-Back: student explains the topic aloud -> transcript (client got it from
// /api/stt) -> LLM grades it against the saved brief/notes.
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

    // Prefer the compact scene brief; fall back to stored notes.
    const brief =
      getMaterial(body.topicId, "brief")?.content?.text ||
      getMaterial(body.topicId, "clean_notes")?.content?.text ||
      getMaterial(body.topicId, "reviewer")?.content?.text ||
      getMaterial(body.topicId, "summary")?.content?.text;

    if (!brief) {
      return NextResponse.json({ error: "no study material for this topic yet — create a study pack first" }, { status: 400 });
    }

    const grading = await gradeTeachBack({
      topic: "this topic",
      transcript: body.transcript,
      brief: String(brief),
    });

    saveMaterial(body.topicId, "teachback", "Teach-back review", {
      transcript: body.transcript,
      verdict: grading.verdict,
      missed: grading.missed,
      next_step: grading.next_step,
    });

    const interactive = {
      type: "teach_back",
      topic: "Teach-back review",
      topicId: body.topicId,
      transcript: body.transcript,
      verdict: grading.verdict,
      missed: grading.missed,
      next_step: grading.next_step,
    };

    saveMessage(body.topicId, "assistant", grading.verdict, interactive);

    return NextResponse.json({ ...grading, interactive });
  } catch (err) {
    console.error("teachback error:", err);
    return NextResponse.json({ error: (err as Error).message || "teachback failed" }, { status: 500 });
  }
}