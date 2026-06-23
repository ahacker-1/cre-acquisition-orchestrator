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


# Each matcher is (path, label, regex, confidence, unit, transform). The first
# occurrence of each path across the pages wins; later duplicates are left for
# operator review. Transforms return None to skip a non-numeric / unparseable
# match.
HEADLINE_MATCHERS = [
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

# Legal-document matchers. Labels carry an explicit colon in real PSAs / title
# commitments / estoppels, so these anchor on "Label:" to avoid firing on prose
# or document headers. They are deliberately lean (a few high-signal terms per
# document type) -- the goal is source-backed candidate fields for review, not
# full contract understanding.
PSA_MATCHERS = [
    (
        "legal.psa.purchasePrice",
        "Purchase Price",
        re.compile(r"purchase price[:\s]*\$?([\d,]+)", re.IGNORECASE),
        0.82,
        "usd",
        lambda m: _number(m.group(1)),
    ),
    (
        "legal.psa.earnestMoneyDeposit",
        "Earnest Money Deposit",
        re.compile(r"(?:earnest money(?: deposit)?|deposit)[:\s]*\$?([\d,]+)", re.IGNORECASE),
        0.8,
        "usd",
        lambda m: _number(m.group(1)),
    ),
    (
        "legal.psa.dueDiligencePeriodDays",
        "Due Diligence Period",
        re.compile(r"(?:due diligence|inspection|feasibility) period[:\s]*(\d{1,3})\s*days", re.IGNORECASE),
        0.8,
        "days",
        lambda m: _number(m.group(1)),
    ),
    (
        "legal.psa.closingDate",
        "Closing Date",
        re.compile(r"closing date[:\s]*([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})", re.IGNORECASE),
        0.78,
        None,
        lambda m: m.group(1).strip(),
    ),
    (
        "legal.psa.financingContingency",
        "Financing Contingency",
        re.compile(r"financing contingency[:\s]*([A-Za-z]+)", re.IGNORECASE),
        0.72,
        None,
        lambda m: m.group(1).strip(),
    ),
]

TITLE_MATCHERS = [
    (
        "legal.title.effectiveDate",
        "Title Effective Date",
        re.compile(r"effective date[:\s]*([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})", re.IGNORECASE),
        0.8,
        None,
        lambda m: m.group(1).strip(),
    ),
    (
        "legal.title.commitmentAmount",
        "Commitment Amount",
        re.compile(r"commitment amount[:\s]*\$?([\d,]+)", re.IGNORECASE),
        0.8,
        "usd",
        lambda m: _number(m.group(1)),
    ),
]

ESTOPPEL_MATCHERS = [
    (
        "legal.estoppel.tenant",
        "Tenant",
        re.compile(r"tenant(?: name)?:\s*([A-Z][A-Za-z .,'\-&]+?)(?:\n|$)", re.IGNORECASE),
        0.78,
        None,
        lambda m: m.group(1).strip(),
    ),
    (
        "legal.estoppel.unit",
        "Unit",
        re.compile(r"unit(?: (?:no\.?|number))?:\s*([A-Za-z0-9\-]+)", re.IGNORECASE),
        0.78,
        None,
        lambda m: m.group(1).strip(),
    ),
    (
        "legal.estoppel.monthlyRent",
        "Monthly Rent",
        re.compile(r"(?:monthly|current|base) rent[:\s]*\$?([\d,]+)", re.IGNORECASE),
        0.8,
        "usd",
        lambda m: _number(m.group(1)),
    ),
    (
        "legal.estoppel.leaseStartDate",
        "Lease Start Date",
        re.compile(r"lease (?:start|commencement) date[:\s]*([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})", re.IGNORECASE),
        0.76,
        None,
        lambda m: m.group(1).strip(),
    ),
    (
        "legal.estoppel.leaseEndDate",
        "Lease End Date",
        re.compile(r"lease (?:end|expiration|termination) date[:\s]*([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})", re.IGNORECASE),
        0.76,
        None,
        lambda m: m.group(1).strip(),
    ),
    (
        "legal.estoppel.securityDeposit",
        "Security Deposit",
        re.compile(r"security deposit[:\s]*\$?([\d,]+)", re.IGNORECASE),
        0.78,
        "usd",
        lambda m: _number(m.group(1)),
    ),
]

MATCHERS_BY_TYPE = {
    "psa": PSA_MATCHERS,
    "title_commitment": TITLE_MATCHERS,
    "estoppel": ESTOPPEL_MATCHERS,
}


def extract_title_exceptions(pages: List[str]) -> Optional[Dict[str, Any]]:
    """Collect numbered Schedule B exceptions into a single array-valued field.

    Title commitments list encumbrances (taxes, easements, liens, covenants) as
    a numbered list under a "Schedule B" heading. We capture them as one
    review-only field rather than a flood of scalars; the operator and the legal
    agents read the array to spot blocking exceptions.
    """
    for page_index, page_text in enumerate(pages):
        if not page_text or "schedule b" not in page_text.lower():
            continue
        lower = page_text.lower()
        start = lower.index("schedule b")
        body = page_text[start:]
        exceptions = []
        for line_match in re.finditer(r"(?m)^\s*(\d{1,2})[.)]\s+(.+?)\s*$", body):
            description = line_match.group(2).strip()
            if len(description) < 4:
                continue
            exceptions.append({"number": _number(line_match.group(1)), "description": description})
        if exceptions:
            return _make_field(
                "legal.title.scheduleBExceptions",
                "Schedule B Exceptions",
                exceptions,
                0.74,
                page_index + 1,
                f"Schedule B: {len(exceptions)} exception(s)",
            )
    return None


def extract_fields(pages: List[str], doc_type: str = "auto") -> tuple[List[Dict[str, Any]], List[str]]:
    """Extract candidate fields with page provenance, dispatched by doc_type.

    Each matcher records the 1-based page index it fired on so the dashboard can
    populate location.page. Only the first occurrence of each metric is taken;
    duplicates across pages are left for operator review. Legal document types
    (psa / title_commitment / estoppel) use their own lean matcher sets;
    everything else falls back to the headline acquisition matchers.
    """
    fields: List[Dict[str, Any]] = []
    warnings: List[str] = []
    seen_paths: set = set()

    matchers = MATCHERS_BY_TYPE.get(doc_type, HEADLINE_MATCHERS)

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
            if value is None or value == "":
                continue
            seen_paths.add(path)
            fields.append(_make_field(path, label, value, confidence, page_number, match.group(0), unit))

    if doc_type == "title_commitment":
        exceptions_field = extract_title_exceptions(pages)
        if exceptions_field is not None:
            fields.append(exceptions_field)

    if not fields:
        label = {
            "psa": "PSA",
            "title_commitment": "title commitment",
            "estoppel": "estoppel",
        }.get(doc_type, "headline")
        warnings.append(f"No recognizable {label} fields were found in the PDF text layer.")

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

        fields, warnings = extract_fields(pages, doc_type)
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
