// OCR module — unit tests with a mocked fetch. We can't smoke-test the live
// Featherless call from this machine (Cloudflare blocks our egress IP), so
// every test stubs `fetch` and asserts the request shape we send.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// Lazy import so env reads happen AFTER we set them in each test
async function loadOcr(env: Record<string, string>) {
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  // Reset modules so the env-constant capture in ocr.ts re-runs
  vi.resetModules();
  return await import("@/lib/ocr");
}

describe("ocr module", () => {
  it("reports not-configured when no API key is set", async () => {
    const ocr = await loadOcr({
      TUTORIUM_LLM_API_KEY: "",
      TUTORIUM_OCR_API_KEY: "",
      FEATHERLESS_API_KEY: "",
    });
    expect(ocr.ocrConfigured()).toBe(false);
    expect(ocr.ocrModelLabel()).toBe("not-configured");
  });

  it("falls back to TUTORIUM_LLM_API_KEY when OCR_API_KEY is absent", async () => {
    const ocr = await loadOcr({
      TUTORIUM_LLM_API_KEY: "llm-key",
      TUTORIUM_OCR_API_KEY: "",
      TUTORIUM_OCR_MODEL: "Qwen/Qwen3-VL-30B-A3B-Instruct",
      TUTORIUM_LLM_BASE_URL: "https://api.featherless.ai/v1",
    });
    expect(ocr.ocrConfigured()).toBe(true);
    expect(ocr.ocrModelLabel()).toBe("Qwen/Qwen3-VL-30B-A3B-Instruct");
  });

  it("uses dedicated OCR key when provided", async () => {
    const ocr = await loadOcr({
      TUTORIUM_LLM_API_KEY: "llm-key",
      TUTORIUM_OCR_API_KEY: "ocr-key",
      TUTORIUM_OCR_MODEL: "Qwen/Qwen3-VL-30B-A3B-Instruct",
    });
    expect(ocr.ocrConfigured()).toBe(true);
    // The actual auth header sent should reflect the dedicated OCR key
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "hello world" } }] }),
    });
    await ocr.ocrImages([Buffer.from("fake-png")]);
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer ocr-key");
  });

  it("builds an OpenAI-shaped multimodal request", async () => {
    const ocr = await loadOcr({
      TUTORIUM_OCR_API_KEY: "test",
      TUTORIUM_OCR_MODEL: "Qwen/Qwen3-VL-30B-A3B-Instruct",
      TUTORIUM_LLM_BASE_URL: "https://api.featherless.ai/v1",
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Chapter 3 — Photosynthesis\nLight reactions..." } }] }),
    });
    const result = await ocr.ocrImages([Buffer.from("page1"), Buffer.from("page2")]);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.featherless.ai/v1/chat/completions");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("Qwen/Qwen3-VL-30B-A3B-Instruct");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content).toHaveLength(3); // text + 2 images
    expect(body.messages[0].content[0].type).toBe("text");
    expect(body.messages[0].content[1].type).toBe("image_url");
    expect(body.messages[0].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
    expect(body.messages[0].content[2].image_url.url).toMatch(/^data:image\/png;base64,/);
    // Deliberately no response_format — OCR is free text
    expect(body.response_format).toBeUndefined();
    expect(result.text).toContain("Photosynthesis");
    expect(result.pages).toBe(2);
  });

  it("rejects more than MAX_OCR_PAGES pages", async () => {
    const ocr = await loadOcr({ TUTORIUM_OCR_API_KEY: "test" });
    const pages = Array.from({ length: ocr.MAX_OCR_PAGES + 1 }, () => Buffer.from("x"));
    await expect(ocr.ocrImages(pages)).rejects.toThrow(/capped at/);
    // Should not have made any fetch call
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty page arrays", async () => {
    const ocr = await loadOcr({ TUTORIUM_OCR_API_KEY: "test" });
    await expect(ocr.ocrImages([])).rejects.toThrow(/no pages/);
  });

  it("surfaces provider errors with status + body preview", async () => {
    const ocr = await loadOcr({ TUTORIUM_OCR_API_KEY: "test" });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "rate limited — try again later",
    });
    await expect(ocr.ocrImages([Buffer.from("p")])).rejects.toThrow(/OCR provider 429/);
  });

  it("throws on empty provider response", async () => {
    const ocr = await loadOcr({ TUTORIUM_OCR_API_KEY: "test" });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "   " } }] }),
    });
    await expect(ocr.ocrImages([Buffer.from("p")])).rejects.toThrow(/empty text/);
  });
});
