import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/identity";
import { listLibrary } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = await requireUserId();
  return NextResponse.json({ library: listLibrary(userId) });
}