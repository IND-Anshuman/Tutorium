import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/identity";
import { createSession, listSessions } from "@/lib/db";

// GET /api/sessions?userId=... -> listSessions(userId)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = await requireUserId();
  return NextResponse.json({ sessions: listSessions(userId, { limit: 50 }) });
}

// POST /api/sessions  body: { userId, domain? }  -> createSession
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { userId?: string; domain?: string };
  const userId = await requireUserId();
  const id = createSession(userId, body.domain || "");
  return NextResponse.json({ id, domain: body.domain || "" }, { status: 201 });
}