#!/usr/bin/env python3
"""Synthesize the deliberately nasty "real-world pile" ingestion fixture set.

Builds fixtures/real-world-pile/ from a mix of (a) copies of existing messy
fixtures under fixtures/parsers/ and (b) freshly synthesized junk files a real
operator would realistically drop into a deal folder.

Run with a Python that has openpyxl + reportlab:
    "C:\\Program Files\\Python310\\python.exe" scripts/build-real-world-pile.py

Idempotent: overwrites the pile each run. Does NOT touch fixtures/parsers/.
"""

import os
import shutil
import struct
import zipfile
import zlib
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / "fixtures" / "parsers"
PILE = REPO / "fixtures" / "real-world-pile"


def copy_existing(src_name: str, dst_name: str) -> None:
    src = SRC / src_name
    if not src.exists():
        raise FileNotFoundError(f"Expected existing fixture missing: {src}")
    shutil.copyfile(src, PILE / dst_name)
    print(f"copied  {src_name} -> {dst_name}")


def make_offering_brochure_pdf(path: Path) -> None:
    """A one-page text PDF with NO extractable headline metrics (pure marketing)."""
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter

    c = canvas.Canvas(str(path), pagesize=letter)
    text = c.beginText(72, 720)
    for line in [
        "PROPERTY BROCHURE",
        "Welcome to The Lofts at Maple Grove.",
        "A vibrant community with resort-style amenities, a sparkling pool,",
        "and a state-of-the-art fitness center. Pet friendly. Walk to dining.",
        "Contact our leasing office today to schedule a tour!",
        "Managed by Acme Residential. Equal Housing Opportunity.",
    ]:
        text.textLine(line)
    c.drawText(text)
    c.showPage()
    c.save()
    print(f"made    {path.name} (text PDF, no metrics)")


def make_minimal_docx(path: Path) -> None:
    """A minimal but valid .docx (Open XML zip) with a tiny body."""
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/></Relationships>'
    )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body><w:p><w:r><w:t>Deal summary memo. Asking price 12,500,000. "
        "120-unit garden-style asset, 94% occupancy, NOI 845,000.</w:t></w:r></w:p>"
        "</w:body></w:document>"
    )
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", document)
    print(f"made    {path.name} (valid docx)")


def _png_chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def make_png(path: Path, width: int = 8, height: int = 8) -> bytes:
    """Return bytes of a tiny valid PNG; also write to path if given."""
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)  # 8-bit RGB
    raw = bytearray()
    for _ in range(height):
        raw.append(0)  # filter byte per scanline
        raw.extend(b"\x9d\x9d\x9d" * width)  # gray-ish pixels
    idat = zlib.compress(bytes(raw))
    png = sig + _png_chunk(b"IHDR", ihdr) + _png_chunk(b"IDAT", idat) + _png_chunk(b"IEND", b"")
    if path is not None:
        path.write_bytes(png)
        print(f"made    {path.name} (valid PNG photo-of-rent-roll stand-in)")
    return png


def make_large_csv(path: Path, target_mb: int = 35) -> None:
    """A valid rent-roll-shaped CSV large enough to probe the 15s timeout / memory."""
    header = "Unit,Unit Type,SqFt,Market Rent,Current Rent,Status\n"
    row = "{i},2BR/2BA,1050,2150,2025,Occupied\n"
    target_bytes = target_mb * 1024 * 1024
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(header)
        written = len(header)
        i = 0
        while written < target_bytes:
            line = row.format(i=i)
            f.write(line)
            written += len(line)
            i += 1
    size_mb = path.stat().st_size / 1024 / 1024
    print(f"made    {path.name} ({size_mb:.1f} MB, {i} data rows)")


def make_mislabeled_blob(path: Path) -> None:
    """Random/binary bytes (PNG header + noise) saved with a .csv extension."""
    blob = make_png(None, 16, 16) + os.urandom(2048)
    path.write_bytes(blob)
    print(f"made    {path.name} (binary blob mislabeled .csv)")


def make_corrupt_xlsx(path: Path) -> None:
    """Garbage bytes with an .xlsx extension (not a valid zip/OOXML)."""
    path.write_bytes(b"This is not a real spreadsheet. " + os.urandom(512))
    print(f"made    {path.name} (corrupt xlsx)")


def make_rentroll_csv_named_t12(path: Path) -> None:
    """Name/content mismatch: file named t12.xlsx-style but content is a rent roll.

    We emit it as t12.csv so the CSV/native path exercises the mismatch through
    the text parser; classification keys on the 't12' filename token.
    """
    rows = [
        "Unit,Unit Type,SqFt,Market Rent,Current Rent,Status",
        "101,1BR/1BA,720,1450,1400,Occupied",
        "102,2BR/2BA,1050,2150,2025,Occupied",
        "103,2BR/2BA,1050,2150,0,Vacant",
        "104,Studio,520,1200,1175,Occupied",
    ]
    path.write_text("\n".join(rows) + "\n", encoding="utf-8")
    print(f"made    {path.name} (rent-roll content, t12 filename)")


def main() -> None:
    PILE.mkdir(parents=True, exist_ok=True)

    # 1. messy but valid rent roll xlsx
    copy_existing("rent-roll-merged-headers.xlsx", "rent-roll.xlsx")
    # 2. messy but valid T12 xlsx
    copy_existing("t12-multi-sheet.xlsx", "t12.xlsx")
    # 3. text-based offering memo pdf
    copy_existing("offering-memo-text.pdf", "offering-memo.pdf")
    # 4. scanned / image-only pdf -> needs OCR
    copy_existing("scanned-rent-roll.pdf", "scanned-rent-roll.pdf")

    # 5. docx
    make_minimal_docx(PILE / "deal-summary.docx")
    # 6. image of a rent roll
    make_png(PILE / "rent-roll-photo.png")
    # 7. unrelated text pdf with no metrics
    make_offering_brochure_pdf(PILE / "property-brochure.pdf")
    # 8. zip archive
    zpath = PILE / "deal-docs.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(SRC / "rent-roll-basic.xlsx", "rent-roll-basic.xlsx")
        z.write(SRC / "offering-memo-text.pdf", "offering-memo-text.pdf")
    print(f"made    {zpath.name} (zip archive)")
    # 9. empty 0-byte csv
    (PILE / "empty.csv").write_bytes(b"")
    print("made    empty.csv (0 bytes)")
    # 10. very large csv (timeout/memory probe)
    make_large_csv(PILE / "huge-rent-roll.csv", target_mb=35)
    # 11. mislabeled binary blob .csv
    make_mislabeled_blob(PILE / "not-really.csv")
    # 12. name/content mismatch
    make_rentroll_csv_named_t12(PILE / "t12-but-actually-rentroll.csv")
    # 13. corrupt xlsx
    make_corrupt_xlsx(PILE / "corrupt.xlsx")

    print("\nPile contents:")
    for p in sorted(PILE.iterdir()):
        print(f"  {p.name:35s} {p.stat().st_size:>12,d} bytes")


if __name__ == "__main__":
    main()
