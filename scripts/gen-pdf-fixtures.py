#!/usr/bin/env python3
"""
Deterministic generator for PDF parser fixtures (W20 / W21).

Regenerates the text-based PDF fixture (W20: an offering-memo / rent-roll style
document exported to a real text-layer PDF) and the scanned/image-only PDF
fixture (W21: a PDF whose only page content is a rasterized image with NO
extractable text layer). Existing Excel/CSV fixtures are NOT touched.

Usage:
    python scripts/gen-pdf-fixtures.py

The produced PDFs contain no timestamps or random values so the parsed output
stays deterministic across runs. The canvas is created in reportlab's
"invariant" mode, which suppresses both the wall-clock timestamps and the
random document /ID fingerprint that reportlab would otherwise stamp into every
file. That keeps the PDF bytes — and therefore the SHA-256 file hash used for
provenance — stable run-to-run.
"""

import struct
import zlib
from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "parsers"


def _new_canvas(path: Path) -> canvas.Canvas:
    # invariant=1 makes reportlab emit deterministic bytes: it freezes the
    # CreationDate/ModDate timestamps and replaces the random document /ID
    # fingerprint with a content-derived digest. Without it, every run produces
    # a different file hash and provenance assertions become flaky.
    c = canvas.Canvas(str(path), pagesize=letter, invariant=1)
    c.setTitle("CRE Fixture")
    c.setAuthor("Fixture Generator")
    c.setSubject("Deterministic test fixture")
    c.setCreator("gen-pdf-fixtures")
    c.setProducer("gen-pdf-fixtures")
    return c


# ---------------------------------------------------------------------------
# W20 - Text-based PDF (real extractable text layer)
# ---------------------------------------------------------------------------

def gen_text_offering_memo_pdf():
    """A two-page offering-memo / rent-roll style PDF with a real text layer.

    Page 1 carries headline acquisition metrics; page 2 carries a small rent
    roll table. Both must yield real candidate fields with page-level
    provenance (location.page == 1 or 2).
    """
    path = FIXTURES / "offering-memo-text.pdf"
    c = _new_canvas(path)

    # --- Page 1: headline metrics ---
    text = c.beginText(1 * inch, 10 * inch)
    text.setFont("Helvetica-Bold", 16)
    text.textLine("Maplewood Commons - Offering Memorandum")
    text.setFont("Helvetica", 12)
    text.textLine("")
    text.textLine("Investment Highlights")
    text.textLine("Offering Price: $12,500,000")
    text.textLine("Total Units: 120 units")
    text.textLine("Year Built: 1998")
    text.textLine("In-Place Occupancy: 94% occupancy")
    text.textLine("Net Operating Income: $845,000")
    text.textLine("")
    text.textLine("Maplewood Commons is a 120-unit garden-style community located")
    text.textLine("in a strong submarket with significant value-add upside.")
    c.drawText(text)
    c.showPage()

    # --- Page 2: rent roll table ---
    text = c.beginText(1 * inch, 10 * inch)
    text.setFont("Helvetica-Bold", 14)
    text.textLine("Rent Roll Summary")
    text.setFont("Helvetica", 11)
    text.textLine("")
    text.textLine("Unit Type    Count    Avg SqFt    Market Rent")
    text.textLine("1BR/1BA      48       720         1650")
    text.textLine("2BR/2BA      72       1050        2250")
    c.drawText(text)
    c.showPage()

    c.save()


# ---------------------------------------------------------------------------
# W21 - Scanned / image-only PDF (NO extractable text layer)
# ---------------------------------------------------------------------------

def make_png_bytes(width: int = 96, height: int = 96) -> bytes:
    """Build a tiny deterministic solid-color PNG without external assets.

    Mirrors the helper in gen-parser-fixtures.py so the image-only PDF needs no
    binary asset checked into the repo.
    """
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    # One filter byte (0) per scanline, then RGB pixels (steel blue).
    raw = b"".join(b"\x00" + b"\x46\x82\xb4" * width for _ in range(height))
    idat = zlib.compress(raw, 9)
    return signature + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def gen_scanned_image_only_pdf():
    """A single-page PDF whose only content is a rasterized image - i.e. a
    scanned document with NO extractable text layer. pdfplumber must report
    zero extractable text so the bridge degrades to needs-OCR."""
    from reportlab.lib.utils import ImageReader

    path = FIXTURES / "scanned-rent-roll.pdf"
    png_path = FIXTURES / "_scanned-rr-page.png"
    png_path.write_bytes(make_png_bytes())

    c = _new_canvas(path)
    # Draw the raster image to fill most of the page. No text is drawn at all,
    # so there is no extractable text layer.
    c.drawImage(ImageReader(str(png_path)), 1 * inch, 1 * inch, width=6 * inch, height=8 * inch)
    c.showPage()
    c.save()

    # The PNG is embedded inside the PDF stream; remove the loose helper so the
    # fixtures dir stays clean.
    png_path.unlink(missing_ok=True)


def main():
    FIXTURES.mkdir(parents=True, exist_ok=True)
    gen_text_offering_memo_pdf()
    gen_scanned_image_only_pdf()
    print("Generated PDF fixtures in", FIXTURES)


if __name__ == "__main__":
    main()
