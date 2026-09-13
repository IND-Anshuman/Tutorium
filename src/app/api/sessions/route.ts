import { NextRequest, NextResponse } from "next/server";
import { createSession, listSessions } from "@/lib/db";

// GET /api/sessions?userId=... -> listSessions(userId)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = (url.searchParams.get("userId") || "demo-user").trim().slice(0, 64) || "demo-user";
  return NextResponse.json({ sessions: listSessions(userId, { limit: 50 }) });
}

// POST /api/sessions  body: { userId, domain? }  -> createSession
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { userId?: string; domain?: string };
  const userId = (body.userId || "demo-user").trim().slice(0, 64) || "demo-user";
  const id = createSession(userId, body.domain || "");
  return NextResponse.json({ id, domain: body.domain || "" }, { status: 201 });
}