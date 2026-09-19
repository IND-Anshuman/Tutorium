import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/identity";
import { saveQuizScore, quizHistory, getTopic, getOrCreateProfile, updateProfile } from "@/lib/db";

// Persist a quiz result and fold it into the learner profile + topic progress.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { userId: string; topicId: string; score: number; total: number };
    const userId = await requireUserId();
    const topicId = (body.topicId || "").trim();
    if (!topicId) return NextResponse.json({ error: "topicId required" }, { status: 400 });

    const score = Number.isFinite(body.score) ? Math.round(body.score) : 0;
    const total = Number.isFinite(body.total) && body.total > 0 ? Math.round(body.total) : 0;
    if (total === 0) return NextResponse.json({ error: "total must be > 0" }, { status: 400 });

    saveQuizScore(userId, topicId, score, total);

    // update learner profile from quiz outcome (strengths/weaknesses signal)
    const p = getOrCreateProfile(userId);
    const pct = score / total;
    const patch: { weaknesses?: string[]; strengths?: string[] } = {};
    if (pct < 0.6) {
      const weak = p.weaknesses.includes("topic mastery") ? p.weaknesses : [...p.weaknesses, "topic mastery"];
      patch.weaknesses = weak;
    } else if (pct >= 0.8) {
      const strong = p.strengths.includes("quiz performance") ? p.strengths : [...p.strengths, "quiz performance"];
      patch.strengths = strong;
    }
    if (patch.weaknesses || patch.strengths) updateProfile(userId, patch);

    return NextResponse.json({ saved: true, history: quizHistory(topicId) });
  } catch (err) {
    console.error("quiz-score error:", err);
    return NextResponse.json({ error: (err as Error).message || "failed" }, { status: 500 });
  }
}