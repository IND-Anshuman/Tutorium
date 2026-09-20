// Build a REAL .docx (proper OOXML structure) and verify mammoth reads it.
// Pure-JS zip writer: no shell, no Compress-Archive quirks. STORE (no
// compress) is valid zip — mammoth/jszip reads stored entries fine.
const fs = require("fs");
const path = require("path");

function crc32(buf) {
  let table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

// Minimal stored-entry zip writer
function makeZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x548c, 12); // date (fixed, deterministic)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, data);

    const cen = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x548c, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    central.writeUInt32LE(0x02014b50, 0); // keep writer happy
    // rewrite needed fields (writeUInt32LE at 0 overwrote signature pattern)
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    central.push; // noop
    // store name via extra write
    const nameAt = central.length;
    parts.push(central.slice(0, 0)); // noop to keep structure obvious
    centralFiles.push({ buf: central, nameBuf });
    offset += local.length + nameBuf.length + data.length;
  }
  // This hand-rolled writer grew fiddly; fall through to a simpler assembly below.
  throw new Error("unused");
}

(async () => {
  // Simpler, reliable approach: use the 'zod'-free approach — build zip via
  // Node's zlib deflateRaw + manual central directory, kept minimal.
  const base = path.join(process.env.LOCALAPPDATA, "Temp", "tutorium_ingest");
  const dir = path.join(base, "src");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "_rels"), { recursive: true });
  fs.mkdirSync(path.join(dir, "word"), { recursive: true });

  fs.writeFileSync(path.join(dir, "[Content_Types].xml"),
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  fs.writeFileSync(path.join(dir, "_rels", ".rels"),
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  fs.writeFileSync(path.join(dir, "word", "document.xml"),
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Photosynthesis converts light energy into chemical energy stored in glucose.</w:t></w:r></w:p><w:p><w:r><w:t>Light-dependent reactions occur in the thylakoid membranes and split water, releasing oxygen.</w:t></w:r></w:p><w:p><w:r><w:t>The Calvin cycle fixes CO2 in the stroma using ATP and NADPH.</w:t></w:r></w:p></w:body></w:document>');

  const files = [
    ["[Content_Types].xml", fs.readFileSync(path.join(dir, "[Content_Types].xml"))],
    ["_rels/.rels", fs.readFileSync(path.join(dir, "_rels", ".rels"))],
    ["word/document.xml", fs.readFileSync(path.join(dir, "word", "document.xml"))],
  ];

  // --- minimal zip (stored entries) ---
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x548c, 12);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);

    const cdir = Buffer.alloc(46);
    cdir.writeUInt32LE(0x02014b50, 0);
    cdir.writeUInt16LE(20, 4);
    cdir.writeUInt16LE(20, 6);
    cdir.writeUInt16LE(0, 8);
    cdir.writeUInt16LE(0, 10);
    cdir.writeUInt16LE(0, 12);
    cdir.writeUInt16LE(0x548c, 14);
    cdir.writeUInt32LE(crc32(data), 16);
    cdir.writeUInt32LE(data.length, 20);
    cdir.writeUInt32LE(data.length, 24);
    cdir.writeUInt16LE(nameBuf.length, 28);
    cdir.writeUInt16LE(0, 30);
    cdir.writeUInt16LE(0, 32);
    cdir.writeUInt16LE(0, 34);
    cdir.writeUInt16LE(0, 36);
    cdir.writeUInt32LE(0, 38);
    cdir.writeUInt32LE(offset, 42);
    central.push(cdir, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  const zip = Buffer.concat([...chunks, centralBuf, eocd]);
  const out = path.join(base, "real.docx");
  fs.writeFileSync(out, zip);

  const mammoth = (await import("mammoth")).default;
  const r = await mammoth.extractRawText({ buffer: zip });
  console.log("mammoth reads real.docx OK:", JSON.stringify(r.value.slice(0, 70)));
  console.log("WROTE:", out);
})().catch((e) => { console.error("FAILED:", e.message.slice(0, 200)); process.exit(1); });