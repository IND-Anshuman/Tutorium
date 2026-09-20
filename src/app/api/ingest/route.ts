// Document ingestion — multi-format, in-memory, no disk writes.
// POST multipart/form-data with a single "file" field.
//
// Formats:
//   TEXT PDF  — pdf.js (unpdf) extracts embedded text. Fast, free, accurate.
//   SCAN PDF  — no embedded text → Vision-Language OCR (Qwen-VL via Featherless).
//   DOCX      — mammoth extractRawText (pure JS). Legacy .doc is rejected with
//               a clear message (binary format, no JS parser).
//   TXT / MD  — decoded directly.
//
// Detection is MAGIC-BYTES-FIRST (docextract.ts) — MIME/extension are hints.
// Every path returns the same JSON shape so the consumer (`docthink`) doesn't
// care which one ran; `source: "text" | "ocr"` says which extraction served.
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/identity";
import { checkRateLimit, recordLlmCall } from "@/lib/limits";
import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";
import { ocrImages, ocrConfigured, MAX_OCR_PAGES } from "@/lib/ocr";
import { detectDocKind, extractDocxText, extractTextBytes } from "@/lib/docextract";

export const maxDuration = 120;

const MAX_BYTES = 30 * 1024 * 1024; // 30 MB
const MAX_PAGES = 200;
// 1.5 = ~108 DPI. Big enough for OCR legibility, small enough that 3 pages
// of base64 stay well under the 32MB Cloud Run body limit.
const RENDER_SCALE = 1.5;

// unpdf needs an explicit canvas factory in Node (it can't auto-detect).
// @napi-rs/canvas is a Rust-backed native binding — fast, no system deps.
const canvasImport = () => import("@napi-rs/canvas");

async function rasterizePage(pdf: any, pageNum: number): Promise<Buffer> {
  const pngBuf = await renderPageAsImage(pdf, pageNum, {
    scale: RENDER_SCALE,
    canvasImport,
  });
  return Buffer.from(pngBuf);
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const limited = checkRateLimit(userId, "ingest");
    if (limited) {
      return NextResponse.json({ error: limited.friendly }, { status: 429 });
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "multipart form with a 'file' field required" },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `file too large (max ${MAX_BYTES / 1024 / 1024} MB)` },
        { status: 413 }
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = detectDocKind(bytes, file.type || "", file.name || "");

    // ---- legacy .doc: unsupported on purpose, honest message ----
    if (!kind) {
      if (/\.doc$/i.test(file.name || "")) {
        return NextResponse.json(
          {
            error:
              "legacy .doc files aren't supported — open it in Word/Google Docs and save as .docx, then upload that.",
          },
          { status: 422 }
        );
      }
      return NextResponse.json(
        { error: `unsupported file type (${file.type || file.name || "unknown"}) — upload PDF, DOCX, TXT, or MD.` },
        { status: 422 }
      );
    }

    // ---- DOCX path ----
    if (kind === "docx") {
      const { text } = await extractDocxText(bytes, file.name);
      return NextResponse.json({
        filename: file.name,
        pages: 0,
        chars: text.length,
        text,
        source: "text",
        format: "docx",
      });
    }

    // ---- TXT / MD path ----
    if (kind === "txt" || kind === "text") {
      const text = extractTextBytes(bytes);
      return NextResponse.json({
        filename: file.name,
        pages: 0,
        chars: text.length,
        text,
        source: "text",
        format: "txt",
      });
    }

    // ---- PDF path ----
    const pdf = await getDocumentProxy(bytes);
    const pageCount = pdf.numPages;
    if (pageCount > MAX_PAGES) {
      return NextResponse.json(
        { error: `too many pages (max ${MAX_PAGES}, got ${pageCount})` },
        { status: 413 }
      );
    }

    // ---- Path 1: text PDF ----
    const { text, totalPages } = await extractText(pdf, { mergePages: false });
    const pages: string[] = Array.isArray(text) ? text : [String(text)];
    const joined = pages.join("\n\n").trim();

    if (joined) {
      return NextResponse.json({
        filename: file.name,
        pages: totalPages,
        chars: joined.length,
        text: joined,
        source: "text",
        format: "pdf",
      });
    }

    // ---- Path 2: scanned PDF → VLM OCR fallback ----
    if (!ocrConfigured()) {
      // No OCR key — surface the honest 422 the old code did. User can either
      // configure TUTORIUM_OCR_API_KEY or upload a text PDF instead.
      return NextResponse.json(
        {
          error:
            "no extractable text — the PDF looks like a scan, but OCR isn't configured " +
            "(set TUTORIUM_OCR_API_KEY in .env.local or Secret Manager).",
        },
        { status: 422 }
      );
    }

    // OCR is its own rate bucket — gating here means a user who hits the
    // ingest cap doesn't also burn the OCR budget (and vice versa).
    const ocrLimited = checkRateLimit(userId, "ocr");
    if (ocrLimited) {
      return NextResponse.json({ error: ocrLimited.friendly }, { status: 429 });
    }

    if (pageCount > MAX_OCR_PAGES) {
      return NextResponse.json(
        {
          error:
            `scanned PDF detected (${pageCount} pages) but OCR is capped at ${MAX_OCR_PAGES} pages ` +
            `per request — split the document or convert to a text PDF.`,
        },
        { status: 413 }
      );
    }

    // Render each page to a PNG. Sequential because pdf.js + node-canvas under
    // multi-process Cloud Run scale isn't worth the parallelism complexity for
    // a 3-page budget. If you bump MAX_OCR_PAGES, consider batching.
    const pngPages: Buffer[] = [];
    for (let i = 1; i <= pageCount; i++) {
      pngPages.push(await rasterizePage(pdf, i));
    }

    const ocr = await ocrImages(pngPages);
    // Count OCR calls toward the daily spend guard too — the VLM is the most
    // expensive call in the system. The "ingest" hourly cap already counted
    // this request; recordLlmCall adds it to the daily per-user budget.
    recordLlmCall(userId);
    return NextResponse.json({
      filename: file.name,
      pages: pageCount,
      chars: ocr.text.length,
      text: ocr.text,
      source: "ocr",
      ocrModel: ocr.model,
      format: "pdf",
    });
  } catch (err) {
    const msg = (err as Error)?.message || "file extraction failed";
    const invalid = /invalid|corrupt|password|structure|no readable|couldn't read|empty/i.test(msg);
    return NextResponse.json(
      { error: invalid ? msg : msg },
      { status: invalid ? 422 : 500 }
    );
  }
}