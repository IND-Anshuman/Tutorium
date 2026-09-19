"""
Build a realistic scanned-notes PDF fixture for the Phase 0 baseline.

We synthesize text content (so the OCR result is verifiable), render to PDF
via reportlab, then re-rasterize as a simulated phone scan (light noise + slight
rotation + JPEG-style recompression at 200 DPI). This gives PaddleOCR a fair
fight: clean enough text that the engine has a real chance, noisy enough that
it's not a trivial job.
"""
import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import fitz  # pymupdf

# 6 realistic-looking pages of "scanned notes" content. Verifiable text: we know
# what the OCR engine *should* return, so we can compute a rough CER.
PAGES = [
    "Chapter 3 — Photosynthesis\n\nLight reactions occur in the thylakoid membrane.\nThe Calvin cycle takes place in the stroma.\n\nKey equation: 6 CO2 + 6 H2O + light -> C6H12O6 + 6 O2",
    "Vocabulary\n- Thylakoid: membrane-bound compartment\n- Stroma: fluid inside the chloroplast\n- Chlorophyll: pigment that absorbs light\n- ATP: adenosine triphosphate, energy carrier",
    "Diagram — Light Reactions\n[PSII] -> [Plastoquinone] -> [Cyt b6f] -> [Plastocyanin] -> [PSI] -> [Ferredoxin] -> [NADP+ reductase]\n\nWater is split at PSII, releasing O2 as a byproduct.",
    "Practice Questions\n1. Where do the light reactions occur?\n2. What is the role of chlorophyll?\n3. Why is water necessary for photosynthesis?\n4. Compare ATP and NADPH — what does each carry?",
    "The Calvin Cycle\n1. Carbon fixation: CO2 joins RuBP via Rubisco\n2. Reduction: G3P formed using ATP and NADPH\n3. Regeneration: RuBP regenerated using ATP\n\nOutput: 1 G3P per 3 CO2 fixed; 6 turns make 1 glucose.",
    "Summary Table\nLight Reactions | Calvin Cycle\nLocation: Thylakoid | Stroma\nInput: H2O, light | CO2, ATP, NADPH\nOutput: O2, ATP, NADPH | G3P (sugar precursor)",
]

FONT_SIZE = 28
LINE_HEIGHT = 44
MARGIN = 90


def find_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\consola.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def text_to_clean_pdf(pages: list[str]) -> bytes:
    # A4 in points (72dpi): 595 x 842. Each page is an embedded PNG of the
    # rendered text — when later rasterized at 200 DPI, that yields ~1654x2339
    # pixels per page (~4MP). Anything larger explodes rasterize/preprocess time
    # and stops being representative of a typical scanned note.
    PAGE_W_PT, PAGE_H_PT = 595, 842
    RENDER_SCALE = 1  # PNG exactly matches page rect; rasterize step controls DPI
    doc = fitz.open()
    font = find_font(FONT_SIZE)
    for text in pages:
        page = doc.new_page(width=PAGE_W_PT, height=PAGE_H_PT)
        img_w, img_h = PAGE_W_PT * RENDER_SCALE, PAGE_H_PT * RENDER_SCALE
        img = Image.new("RGB", (img_w, img_h), "white")
        draw = ImageDraw.Draw(img)
        for i, line in enumerate(text.splitlines()):
            draw.text((MARGIN * RENDER_SCALE / 3, MARGIN * RENDER_SCALE / 3 + i * LINE_HEIGHT * RENDER_SCALE / 2), line, fill="black", font=font)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        page.insert_image(page.rect, stream=buf.getvalue())
    out = doc.tobytes()
    doc.close()
    return out


def simulate_phone_scan(clean_pdf_bytes: bytes) -> bytes:
    """Take a clean PDF, rasterize at 200 DPI, add light noise + tiny rotation,
    re-pack as a fresh PDF. Result is what a phone-scan of printed notes looks like."""
    src = fitz.open(stream=clean_pdf_bytes, filetype="pdf")
    out = fitz.open()
    zoom = DPI / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    for src_page in src:
        pix = src_page.get_pixmap(matrix=matrix, alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        # Slight rotation (skew)
        img = img.rotate(0.6, resample=Image.BICUBIC, fillcolor="white")
        # Light noise
        import random
        random.seed(42)
        px = img.load()
        for _ in range(img.width * img.height // 60):  # sparse salt-and-pepper
            x = random.randrange(img.width)
            y = random.randrange(img.height)
            px[x, y] = (random.choice([0, 255]),) * 3
        # Mild blur (phone lens)
        img = img.filter(ImageFilter.GaussianBlur(radius=0.6))
        # JPEG-style compression artefact
        buf = io.BytesIO()
        img.convert("L").save(buf, format="JPEG", quality=72)
        # New page with same dims
        new_page = out.new_page(width=img.width, height=img.height)
        new_page.insert_image(new_page.rect, stream=buf.getvalue())
    out_bytes = out.tobytes()
    src.close()
    out.close()
    return out_bytes


DPI = 200


def main() -> int:
    out_path = Path("scripts/fixture_scanned_notes.pdf")
    out_path.parent.mkdir(exist_ok=True)
    clean = text_to_clean_pdf(PAGES)
    scanned = simulate_phone_scan(clean)
    out_path.write_bytes(scanned)
    print(f"wrote {out_path} ({len(scanned)/1024:.0f} KB, {len(PAGES)} pages)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
