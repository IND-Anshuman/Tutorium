import { NextResponse } from "next/server";
import { llmConfigured, llmRuntimeLabel } from "@/lib/llm";
import { speechmaticsConfigured } from "@/lib/speechmatics";
import db from "@/lib/db";
import { clerkConfigured } from "@/lib/identity";
import { ocrConfigured, ocrModelLabel } from "@/lib/ocr";

// Runtime health: this probe is what a Cloud Run liveness check (and demo-day
// debugging) hits — it must reflect THIS process, not build-time env. Dynamic.
export const dynamic = "force-dynamic";

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
    llm: llmRuntimeLabel(),
    llmKey: llmConfigured(),
    stt: speechmaticsConfigured() ? "speechmatics" : "not-configured",
    auth: clerkConfigured() ? "clerk" : "demo-fallback",
    ocr: ocrModelLabel(),
    ocrKey: ocrConfigured(),
    rateLimits: true,
  });
}