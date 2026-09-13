import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  listMessagesBySession,
  listMaterials,
  renameSession,
  closeSession,
  setSessionDomainLocked,
} from "@/lib/db";

// GET /api/sessions/[id]  -> session + messages + materials
export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const s = getSession(ctx.params.id);
  if (!s) return NextResponse.json({ error: "session not found" }, { status: 404 });
  return NextResponse.json({
    session: s,
    messages: listMessagesBySession(ctx.params.id),
    materials: listMaterials(s.id),
  });
}

// PATCH /api/sessions/[id]  body: { domain?, domainLocked?, status? }
export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const body = (await req.json().catch(() => ({}))) as { domain?: string; domainLocked?: boolean; status?: string };
  if (body.domain !== undefined) renameSession(ctx.params.id, body.domain);
  if (typeof body.domainLocked === "boolean") setSessionDomainLocked(ctx.params.id, body.domainLocked);
  if (body.status === "closed") closeSession(ctx.params.id);
  return NextResponse.json({ session: getSession(ctx.params.id) });
}

// DELETE /api/sessions/[id]  -> soft close
export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  closeSession(ctx.params.id);
  return NextResponse.json({ ok: true });
}