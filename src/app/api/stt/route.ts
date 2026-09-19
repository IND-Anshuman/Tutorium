import { NextRequest, NextResponse } from "next/server";
import { transcribeBatch, speechmaticsConfigured } from "@/lib/speechmatics";
import { sayItBackScore } from "@/lib/sayitback";
import { getMaterial } from "@/lib/db";
import { requireUserId } from "@/lib/identity";
import { checkRateLimit } from "@/lib/limits";

export const maxDuration = 180;

interface RouteBody {
  userId: string;
  audioBase64: string;
  filename?: string;
  language?: string;
  mode?: "transcribe" | "say_it_back";
  topicId?: string | null;
  passage?: string;
  keyTerms?: string[];
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const limited = checkRateLimit(userId, "stt");
    if (limited) {
      return NextResponse.json({ error: limited.friendly }, { status: 429 });
    }
    if (!speechmaticsConfigured()) {
      return NextResponse.json({ error: "SPEECHMATICS_API_KEY not configured" }, { status: 500 });
    }

    const body = (await req.json()) as RouteBody;
    const audioBase64 = (body.audioBase64 || "").replace(/^data:[^;]+;base64,/, "");
    if (!audioBase64) {
      return NextResponse.json({ error: "audioBase64 required" }, { status: 400 });
    }
    const bytes = Buffer.from(audioBase64, "base64");
    // Hard cap: ~10MB decoded (~13 min of webm audio). Prevents a huge base64
    // body from ballooning into a 67MB JSON string inside a 1Gi container.
    const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
    if (bytes.byteLength > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "That recording is too long — keep clips under about 10 minutes." },
        { status: 413 }
      );
    }
    const file = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;

    // Vocab Hot-Swap: for say_it_back mode, load the passage's key terms from the DB
    // (or the client-provided list) and inject them into the STT job.
    const terms = body.keyTerms || [];
    let keyTerms: string[] = terms;
    if (body.mode === "say_it_back") {
      if (!keyTerms.length && body.topicId) {
        const m = getMaterial(body.topicId, "sayitback");
        if (m?.content?.keyTerms) keyTerms = m.content.keyTerms;
      }
    }
    const additionalVocab = keyTerms.slice(0, 1000).map((t) => ({ content: t }));

    const result = await transcribeBatch({
      file,
      filename: body.filename || "audio.webm",
      language: body.language || "en",
      additionalVocab,
      waitS: 150,
    });

    const avgConfidence = result.words.length
      ? result.words.reduce((s, w) => s + w.confidence, 0) / result.words.length
      : 0;

    if (body.mode === "say_it_back") {
      const passage =
        body.passage ||
        (body.topicId ? getMaterial(body.topicId, "sayitback")?.content?.passage : "") ||
        "";
      const foundTerms = keyTerms.length ? keyTerms : [];
      const score = sayItBackScore(result.words, foundTerms);
      return NextResponse.json({
        mode: "say_it_back",
        transcript: result.text,
        score,
        avgConfidence,
        vocabInjected: additionalVocab.length,
      });
    }

    return NextResponse.json({
      mode: "transcribe",
      transcript: result.text,
      words: result.words,
      avgConfidence,
      vocabInjected: additionalVocab.length,
    });
  } catch (err) {
    console.error("stt error:", err);
    return NextResponse.json({ error: (err as Error).message || "stt failed" }, { status: 500 });
  }
}