import { describe, expect, it, vi, beforeEach } from "vitest";

// mammoth is mocked at the module boundary — the unit under test is the
// dispatcher logic (type detection, extension fallback, error mapping).
const mammothExtract = vi.hoisted(() => vi.fn());
vi.mock("mammoth", () => ({
  default: { extractRawText: mammothExtract },
}));

import { extractDocxText, detectDocKind, SUPPORTED_UPLOAD_TYPES } from "./docextract";

beforeEach(() => {
  mammothExtract.mockReset();
});

describe("detectDocKind", () => {
  it("detects by magic bytes, not MIME (MIME is client-controlled)", () => {
    // %PDF- header
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
    expect(detectDocKind(pdfBytes, "application/octet-stream")).toBe("pdf");
    // PK\x03\x04 = zip container (docx)
    const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(detectDocKind(zipBytes, "")).toBe("docx");
  });
  it("falls back to extension when bytes are ambiguous", () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x03]);
    expect(detectDocKind(bytes, "", "notes.docx")).toBe("docx");
    expect(detectDocKind(bytes, "", "notes.txt")).toBe("txt");
    expect(detectDocKind(bytes, "", "notes.md")).toBe("txt"); // md rides the txt path
  });
  it("plain text detected for utf8-ish bytes", () => {
    const bytes = new TextEncoder().encode("hello world");
    expect(detectDocKind(bytes, "text/plain")).toBe("text");
  });
  it("unknown returns null", () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    expect(detectDocKind(bytes, "", "file.xyz")).toBeNull();
  });
});

describe("extractDocxText", () => {
  it("extracts text via mammoth.extractRawText from a Buffer", async () => {
    mammothExtract.mockResolvedValueOnce({ value: "Hello docx body.", messages: [] });
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const r = await extractDocxText(bytes, "paper.docx");
    expect(mammothExtract).toHaveBeenCalledTimes(1);
    expect(mammothExtract.mock.calls[0][0]).toEqual({ buffer: expect.any(Buffer) });
    expect(r.text).toBe("Hello docx body.");
    expect(r.pages).toBeNull(); // docx has no fixed page count
  });
  it("maps empty extraction to a friendly error", async () => {
    mammothExtract.mockResolvedValueOnce({ value: "   ", messages: [] });
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    await expect(extractDocxText(bytes, "empty.docx")).rejects.toThrow(/no readable text/i);
  });
  it("maps mammoth failures to a friendly message with filename", async () => {
    mammothExtract.mockRejectedValueOnce(new Error("zip bomb"));
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    await expect(extractDocxText(bytes, "bad.docx")).rejects.toThrow("bad.docx");
  });
});

describe("SUPPORTED_UPLOAD_TYPES", () => {
  it("covers the formats the client accept attribute advertises", () => {
    const joined = SUPPORTED_UPLOAD_TYPES.join(",");
    for (const ext of ["pdf", "docx", "txt", "md"]) {
      expect(joined).toContain(ext);
    }
  });
});