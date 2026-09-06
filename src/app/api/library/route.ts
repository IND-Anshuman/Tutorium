import { NextResponse } from "next/server";
import { listLibrary } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") || "demo-user";
  return NextResponse.json({ library: listLibrary(userId) });
}