// Document type detection + extraction dispatch for /api/ingest.
// Detection is MAGIC-BYTES-FIRST: the client-supplied MIME type and filename
// are hints, not truth. A .pdf renamed to .docx is still a PDF.
//
// Supported: PDF (via unpdf, handled in the route), DOCX (via mammoth),
// plain text / markdown (decoded directly). Legacy .doc is NOT supported —
// it's a binary format with no JS parser; users get a clear message.

export type DocKind = "pdf" | "docx" | "text" | "txt";

const DOCX_SIG = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04 zip local file header
const PDF_SIG = [0x25, 0x50, 0x44, 0x46]; // %PDF

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  return sig.every((b, i) => bytes[i] === b);
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

// The client accept attribute — keep in sync with page.tsx's file input.
export const SUPPORTED_UPLOAD_TYPES = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  "application/pdf",
  "text/plain",
  "text/markdown",
];

export function detectDocKind(bytes: Uint8Array, mime: string, filename = ""): DocKind | null {
  if (startsWith(bytes, PDF_SIG)) return "pdf";
  if (startsWith(bytes, DOCX_SIG)) return "docx";
  const ext = extOf(filename);
  if (ext === "docx") return "docx";
  if (ext === "txt" || ext === "md") return "txt";
  if (ext === "doc") return null; // legacy binary Word — unsupported on purpose
  // MIME heuristics for byte-ambiguous inputs (e.g. empty-ish text files)
  if (/^text\//.test(mime) || ext === "") return "text";
  if (/pdf/i.test(mime)) return "pdf";
  if (/wordprocessingml|officedocument|msword/i.test(mime)) return "docx";
  return null;
}

export interface DocxExtractResult {
  text: string;
  pages: number | null; // docx has no fixed page count
}

// DOCX text extraction via mammoth (pure JS, in-memory Buffer, no disk).
// Throws Error with a user-safe message on failure — the route maps it to 422.
export async function extractDocxText(bytes: Uint8Array, filename: string): Promise<DocxExtractResult> {
  const mammoth = (await import("mammoth")).default;
  try {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    const text = (value || "").trim();
    if (!text) {
      throw new Error(`no readable text in ${filename} — if it's a scanned Word doc, export it as a PDF and try again`);
    }
    return { text, pages: null };
  } catch (err) {
    const msg = (err as Error)?.message || "";
    if (/no readable text/i.test(msg)) throw err; // our own friendly error
    throw new Error(`couldn't read ${filename} — the file may be corrupt or not a real .docx`);
  }
}

// Plain text / markdown: decode directly. Strip BOM, don't guess harder.
export function extractTextBytes(bytes: Uint8Array): string {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("that file is empty");
  return text;
}