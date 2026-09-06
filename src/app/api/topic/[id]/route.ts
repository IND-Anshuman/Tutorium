import { NextRequest, NextResponse } from "next/server";
import { getTopic, getSubject, listMaterials, listMessages, getTopicProgress } from "@/lib/db";

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const topic = getTopic(ctx.params.id);
  if (!topic) return NextResponse.json({ error: "topic not found" }, { status: 404 });
  const subject = getSubject(topic.subject_id);
  return NextResponse.json({
    topic: {
      ...topic,
      curriculum_match: JSON.parse(topic.curriculum_match || "{}"),
      progress: JSON.parse(topic.progress || "{}"),
    },
    subject,
    materials: listMaterials(topic.id),
    messages: listMessages(topic.id),
    progress: getTopicProgress(topic.id),
  });
}