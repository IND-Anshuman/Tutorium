// PDF text extraction — pure JS via unpdf (pdf.js), in-memory, no disk writes.
// POST multipart/form-data with a single "file" field.
import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";

export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_PAGES = 200;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "multipart form with a 'file' field required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `file too large (max ${MAX_BYTES / 1024 / 1024} MB)` }, { status: 413 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(bytes);
    const pageCount = pdf.numPages;
    if (pageCount > MAX_PAGES) {
      return NextResponse.json({ error: `too many pages (max ${MAX_PAGES}, got ${pageCount})` }, { status: 413 });
    }
    const { text, totalPages } = await extractText(pdf, { mergePages: false });
    const pages: string[] = Array.isArray(text) ? text : [String(text)];
    const joined = pages.join("\n\n").trim();
    if (!joined) {
      return NextResponse.json({ error: "no extractable text — the PDF may be a scan (image-only)" }, { status: 422 });
    }
    return NextResponse.json({
      filename: file.name,
      pages: totalPages,
      chars: joined.length,
      text: joined,
    });
  } catch (err) {
    const msg = (err as Error)?.message || "pdf extraction failed";
    const invalid = /invalid|corrupt|password|structure/i.test(msg);
    return NextResponse.json(
      { error: invalid ? "that file doesn't look like a readable PDF" : msg },
      { status: invalid ? 422 : 500 }
    );
  }
}