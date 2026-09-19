import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/identity";
import {
  getLastActiveTopic,
  getLastOpenSession,
  getSession,
  getTopic,
  getSubject,
  listMaterials,
  listMessagesBySession,
  listMessages,
} from "@/lib/db";

// Restore a chat room: if a sessionId is provided, hydrate that session. Otherwise
// fall back to the user's most-recent open session, then (legacy) most-recent topic.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = await requireUserId();
  const sessionIdParam = url.searchParams.get("sessionId")?.trim() || null;
  const topicIdParam = url.searchParams.get("topicId")?.trim() || null;

  let sessionRow: any = null;
  let topicIdForMaterials: string | null = null;
  let topicTitle: string | null = null;
  let subjectName: string | null = null;

  if (sessionIdParam) {
    sessionRow = getSession(sessionIdParam);
    if (sessionRow && sessionRow.user_id !== userId) sessionRow = null; // not your session
  }
  if (!sessionRow && topicIdParam) {
    const t = getTopic(topicIdParam);
    if (t) {
      topicIdForMaterials = t.id;
      topicTitle = t.title;
      const s = getSubject(t.subject_id);
      subjectName = s?.name || "General";
    }
  }
  if (!sessionRow) {
    sessionRow = getLastOpenSession(userId);
  }

  if (!sessionRow && !topicIdForMaterials) {
    return NextResponse.json({ session: null, messages: [], materials: [] });
  }

  // Resolve messages + materials.
  let messages: any[] = [];
  let materials: any[] = [];
  if (sessionRow) {
    messages = listMessagesBySession(sessionRow.id);
    // Materials are keyed by topic; pick the most recently used topic's materials.
    // We don't know the topic_id here without a join; clients can resolve via /api/topic/[id].
    materials = [];
  }
  if (topicIdForMaterials) {
    materials = listMaterials(topicIdForMaterials);
  }
  // Back-compat: also pull messages by topic when the legacy topicId flow is used.
  if (topicIdForMaterials && !messages.length) {
    messages = listMessages(topicIdForMaterials);
  }

  const res = NextResponse.json({
    session: sessionRow
      ? {
          id: sessionRow.id,
          domain: sessionRow.domain,
          domain_locked: !!sessionRow.domain_locked,
          status: sessionRow.status,
          topic_count: sessionRow.topic_count,
          created_at: sessionRow.created_at,
          updated_at: sessionRow.updated_at,
        }
      : null,
    topic: topicIdForMaterials
      ? { id: topicIdForMaterials, title: topicTitle, subjectName }
      : null,
    messages,
    materials,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}