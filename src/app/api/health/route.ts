import { NextResponse } from "next/server";
import { llmConfigured } from "@/lib/llm";
import { speechmaticsConfigured } from "@/lib/speechmatics";
import db from "@/lib/db";

export async function GET() {
  let dbOk = false;
  try {
    db.prepare(`SELECT 1`).get();
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return NextResponse.json({
    ok: dbOk,
    llm: llmConfigured() ? "featherless" : "not-configured",
    stt: speechmaticsConfigured() ? "speechmatics" : "not-configured",
  });
}