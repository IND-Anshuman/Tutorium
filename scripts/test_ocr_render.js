// Smoke test for the OCR path's rasterizer. Reads the fixture PDF, renders
// page 1 to a PNG via unpdf + @napi-rs/canvas, reports timing + size.
const { renderPageAsImage, getDocumentProxy } = require("unpdf");
const fs = require("fs");

(async () => {
  const pdfBytes = fs.readFileSync("scripts/fixture_scanned_notes.pdf");
  const pdf = await getDocumentProxy(new Uint8Array(pdfBytes));
  console.log("pages:", pdf.numPages);
  const t0 = Date.now();
  // unpdf needs an explicit canvas factory in Node (it can't auto-detect).
  const canvasImport = () => import("@napi-rs/canvas");
  // 1.5 = ~108 DPI (pdf.js base 72 * 1.5). Big enough for OCR, small enough
  // to keep each page well under 1MB (most VLMs cap image tokens).
  const pngBuf = await renderPageAsImage(pdf, 1, { scale: 1.5, canvasImport });
  const ms = Date.now() - t0;
  const buf = Buffer.from(pngBuf);
  console.log("render ms:", ms, "output bytes:", buf.length);
  fs.writeFileSync("C:/Users/HP/AppData/Local/Temp/page1.png", buf);
  console.log("saved C:/Users/HP/AppData/Local/Temp/page1.png");
})().catch(e => { console.error("ERR:", e); process.exit(1); });
