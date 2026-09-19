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
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = getSession((await ctx.params).id);
  if (!s) return NextResponse.json({ error: "session not found" }, { status: 404 });
  return NextResponse.json({
    session: s,
    messages: listMessagesBySession((await ctx.params).id),
    materials: listMaterials(s.id),
  });
}

// PATCH /api/sessions/[id]  body: { domain?, domainLocked?, status? }
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const body = (await req.json().catch(() => ({}))) as { domain?: string; domainLocked?: boolean; status?: string };
  if (body.domain !== undefined) renameSession((await ctx.params).id, body.domain);
  if (typeof body.domainLocked === "boolean") setSessionDomainLocked((await ctx.params).id, body.domainLocked);
  if (body.status === "closed") closeSession((await ctx.params).id);
  return NextResponse.json({ session: getSession((await ctx.params).id) });
}

// DELETE /api/sessions/[id]  -> soft close
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  closeSession((await ctx.params).id);
  return NextResponse.json({ ok: true });
}