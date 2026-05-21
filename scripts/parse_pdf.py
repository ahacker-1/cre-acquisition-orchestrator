#!/usr/bin/env python3
"""
PDF Parser for CRE Documents
Extracts structured headline metrics and rent-roll figures from text-based PDFs
(offering memoranda, rent rolls exported to PDF) with page-level provenance.

Usage:
    python parse_pdf.py <file_path> [--type offering_memo|rent_roll|t12|auto]

Output:
    JSON to stdout

Contract (mirrors parse_excel.py so parser-service.ts can consume both):
    success:   bool
    needsOcr:  bool        -> true when no extractable text layer (scanned PDF)
    status:    string      -> "extracted" | "needs-ocr"
    fields:    list[dict]   -> {path,label,value,valueType,unit,confidence,
                               page,raw} candidate fields with page provenance
    warnings:  list[str]
    provenance: dict        -> {pageCount, textChars}

Deterministic: no timestamps or random values are emitted. Page numbers are
1-based to match ParserSourceReference.location.page in the dashboard schema.
"""

import sys
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import pdfplumber
except ImportError:
    print(json.dumps({
        "error": "Missing dependency. Install with: pip install pdfplumber",
        "success": False
    }))
    sys.exit(1)


# Minimum total extractable characters across all pages for a PDF to be treated
# as having a real text layer. Below this threshold the document is almost
# certainly a scan/image export and must be routed to OCR rather than parsed
# into bogus empty fields.
MIN_TEXT_CHARS = 12


def _value_type(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, list):
        return "array"
    if isinstance(value, str):
        return "string"
    return "object"


def _number(raw: str) -> Optional[float]:
    cleaned = raw.replace(",", "").replace("$", "").strip()
    if not cleaned:
        return None
    try:
        value = float(cleaned)
    except ValueError:
        return None
    return int(value) if value.is_integer() else value


def _make_field(
    path: str,
    label: str,
    value: Any,
    confidence: float,
    page: int,
    raw: str,
    unit: Optional[str] = None,
) -> Dict[str, Any]:
    field: Dict[str, Any] = {
        "path": path,
        "label": label,
        "value": value,
        "valueType": _value_type(value),
        "confidence": confidence,
        "page": page,
        "raw": raw.strip(),
    }
    if unit is not None:
        field["unit"] = unit
    return field


def extract_pages(file_path: str) -> List[str]:
    """Return per-page extracted text (1-based page order)."""
    pages: List[str] = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    return pages


def extract_fields(pages: List[str]) -> tuple[List[Dict[str, Any]], List[str]]:
    """Extract candidate headline + rent-roll fields with page provenance.

    Each matcher records the 1-based page index it fired on so the dashboard can
    populate location.page. Only the first occurrence of each metric is taken;
    duplicates across pages are left for operator review.
    """
    fields: List[Dict[str, Any]] = []
    warnings: List[str] = []
    seen_paths: set = set()

    # (path, label, regex, confidence, unit, transform)
    matchers = [
        (
            "financials.askingPrice",
            "Asking Price",
            re.compile(r"(?:offering price|asking price)[:\s#*$]+([\d,]+)", re.IGNORECASE),
            0.86,
            "usd",
            lambda m: _number(m.group(1)),
        ),
        (
            "property.totalUnits",
            "Total Units",
            re.compile(r"(?:total units[:\s|]*?|\b)(\d{2,5})\s*[- ]?units?\b", re.IGNORECASE),
            0.8,
            "count",
            lambda m: _number(m.group(1)),
        ),
        (
            "property.yearBuilt",
            "Year Built",
            re.compile(r"year built[:\s|]*?(\d{4})", re.IGNORECASE),
            0.8,
            None,
            lambda m: _number(m.group(1)),
        ),
        (
            "financials.inPlaceOccupancy",
            "In-Place Occupancy",
            re.compile(r"(\d{1,3}(?:\.\d+)?)\s*%\s*occupancy", re.IGNORECASE),
            0.76,
            "decimal",
            lambda m: round(float(m.group(1)) / 100, 4),
        ),
        (
            "financials.currentNOI",
            "Current NOI",
            re.compile(r"(?:net operating income|noi)[:\s*$]+([\d,]+)", re.IGNORECASE),
            0.75,
            "usd",
            lambda m: _number(m.group(1)),
        ),
    ]

    for page_index, page_text in enumerate(pages):
        if not page_text:
            continue
        page_number = page_index + 1
        for path, label, regex, confidence, unit, transform in matchers:
            if path in seen_paths:
                continue
            match = regex.search(page_text)
            if not match:
                continue
            value = transform(match)
            if value is None:
                continue
            seen_paths.add(path)
            fields.append(_make_field(path, label, value, confidence, page_number, match.group(0), unit))

    if not fields:
        warnings.append("No recognizable headline metrics were found in the PDF text layer.")

    return fields, warnings


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python parse_pdf.py <file_path> [--type offering_memo|rent_roll|t12|auto]",
            "success": False
        }))
        sys.exit(1)

    file_path = sys.argv[1]
    doc_type = "auto"
    if "--type" in sys.argv:
        idx = sys.argv.index("--type")
        if idx + 1 < len(sys.argv):
            doc_type = sys.argv[idx + 1]

    try:
        pages = extract_pages(file_path)
        filename = Path(file_path).name
        total_chars = sum(len(text.strip()) for text in pages)

        # W21: Scanned / image-only PDF detection. A PDF with no extractable
        # text layer must degrade gracefully to a needs-OCR status rather than
        # crash or silently emit empty fields.
        if total_chars < MIN_TEXT_CHARS:
            print(json.dumps({
                "success": True,
                "needsOcr": True,
                "status": "needs-ocr",
                "source": {"file": filename, "type": doc_type},
                "provenance": {"pageCount": len(pages), "textChars": total_chars},
                "warnings": [
                    f"PDF '{filename}' has {len(pages)} page(s) and only {total_chars} "
                    "extractable text character(s); it appears to be a scanned/image-only "
                    "document that requires OCR. No text-layer fields could be extracted."
                ],
                "fields": [],
            }, indent=2))
            return

        fields, warnings = extract_fields(pages)
        print(json.dumps({
            "success": True,
            "needsOcr": False,
            "status": "extracted",
            "source": {"file": filename, "type": doc_type},
            "provenance": {"pageCount": len(pages), "textChars": total_chars},
            "warnings": warnings,
            "fields": fields,
        }, indent=2))

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "file": file_path,
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
