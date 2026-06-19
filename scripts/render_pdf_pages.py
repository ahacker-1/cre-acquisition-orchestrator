#!/usr/bin/env python3
"""Render PDF pages to PNG files for the local OCR bridge."""

import argparse
import json
import sys
from pathlib import Path

try:
    import fitz
except ImportError:
    print(json.dumps({
        "success": False,
        "error": "Missing dependency. Install with: pip install PyMuPDF",
    }))
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Render PDF pages to PNG images.")
    parser.add_argument("pdf_path")
    parser.add_argument("output_dir")
    parser.add_argument("--dpi", type=int, default=240)
    args = parser.parse_args()

    pdf_path = Path(args.pdf_path)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        doc = fitz.open(pdf_path)
        images = []
        matrix = fitz.Matrix(args.dpi / 72, args.dpi / 72)
        for index, page in enumerate(doc, start=1):
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            image_path = output_dir / f"page-{index}.png"
            pix.save(image_path)
            images.append({
                "page": index,
                "path": str(image_path),
                "width": pix.width,
                "height": pix.height,
            })
        doc.close()
        print(json.dumps({
            "success": True,
            "pageCount": len(images),
            "images": images,
        }))
    except Exception as exc:
        print(json.dumps({
            "success": False,
            "error": str(exc),
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
