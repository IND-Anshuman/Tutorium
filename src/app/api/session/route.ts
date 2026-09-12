import { NextResponse } from "next/server";
import { getLastActiveTopic, listMessages, getSubject, getTopic, listMaterials } from "@/lib/db";

// Restore a chat room: returns the user's most recently studied topic plus its
// full message history + materials, so the client can rehydrate without a reload.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = (url.searchParams.get("userId") || "demo-user").trim().slice(0, 64) || "demo-user";
  const requestedId = url.searchParams.get("topicId")?.trim() || null;

  const active = requestedId ? getTopic(requestedId) : null;
  const session =
    requestedId && active
      ? {
          topicId: active.id,
          topicTitle: active.title,
          subjectName: getSubject(active.subject_id)?.name || "General",
          subcategory: active.subcategory,
        }
      : getLastActiveTopic(userId);

  if (!session) {
    return NextResponse.json({ session: null });
  }

  const res = NextResponse.json({
    session,
    messages: listMessages(session.topicId),
    materials: listMaterials(session.topicId),
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}