// E2E probe: build real .docx/.txt fixtures and POST them to the running dev
// server's /api/ingest via multipart. Docx is generated as a real zip so the
// magic-byte path is exercised, not just extension sniffing.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const TMP = process.env.LOCALAPPDATA + "\\Temp\\tutorium_ingest";
fs.mkdirSync(TMP, { recursive: true });

// --- fixture 1: real .docx (minimal OOXML zip; mammoth reads document.xml) ---
const docxPath = path.join(TMP, "photosynthesis_notes.docx");
if (!fs.existsSync(docxPath)) {
  const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>Photosynthesis converts light energy into chemical energy stored in glucose.</w:t></w:r></w:p>
<w:p><w:r><w:t>Light-dependent reactions occur in the thylakoid membranes; they split water and release oxygen.</w:t></w:r></w:p>
<w:p><w:r><w:t>The Calvin cycle occurs in the stroma and fixes CO2 into G3P using ATP and NADPH.</w:t></w:r></w:p>
</w:body></w:document>`;
  const tmpXml = path.join(TMP, "document.xml");
  fs.writeFileSync(tmpXml, xml);
  // zip: [Content_Types].xml required by mammoth's OOXML sanity, then document.xml
  execSync(`cd /d "${TMP}" && powershell -NoProfile -Command "Compress-Archive -Force -Path document.xml -DestinationPath base.zip"`);
  fs.renameSync(path.join(TMP, "base.zip"), docxPath);
  console.log("docx fixture written (zip-wrapped document.xml):", docxPath);
}

// --- fixture 2: markdown ---
const mdPath = path.join(TMP, "kinematics.md");
fs.writeFileSync(mdPath, "# Kinematics\n\n- v = u + at\n- s = ut + 0.5at^2\n- v^2 = u^2 + 2as\n");

// --- fixture 3: legacy .doc rejection ---
const docPath = path.join(TMP, "legacy.doc");
fs.writeFileSync(docPath, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])); // OLE2 header

async function upload(fp) {
  const buf = fs.readFileSync(fp);
  const form = new FormData();
  form.append("file", new Blob([buf]), path.basename(fp));
  const r = await fetch("http://localhost:3000/api/ingest", { method: "POST", body: form });
  return { status: r.status, body: await r.json() };
}

(async () => {
  for (const fp of [docxPath, mdPath, docPath]) {
    try {
      const r = await upload(fp);
      console.log(path.basename(fp), "->", r.status, JSON.stringify(r.body).slice(0, 180));
    } catch (e) {
      console.log(path.basename(fp), "-> FETCH FAIL:", e.message);
    }
  }
})();