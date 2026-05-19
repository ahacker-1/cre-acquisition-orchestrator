#!/usr/bin/env python3
"""
Excel Parser for CRE Documents
Extracts structured data from rent rolls and T12 financials.

Usage:
    python parse_excel.py <file_path> [--type rent_roll|t12|auto]

Output:
    JSON to stdout
"""

import sys
import json
import re
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List

try:
    import pandas as pd
    import openpyxl
except ImportError:
    print(json.dumps({
        "error": "Missing dependencies. Install with: pip install pandas openpyxl",
        "success": False
    }))
    sys.exit(1)


def detect_document_type(df: pd.DataFrame, filename: str) -> str:
    """Detect if document is rent roll or T12 based on content."""
    filename_lower = filename.lower()

    # Check filename first
    if any(kw in filename_lower for kw in ['rent', 'roll', 'unit', 'roster']):
        return 'rent_roll'
    if any(kw in filename_lower for kw in ['t12', 'trailing', 'income', 'operating', 'financial']):
        return 't12'

    # Check column headers
    columns_str = ' '.join(str(c).lower() for c in df.columns)

    rent_roll_indicators = ['unit', 'apt', 'tenant', 'lease', 'sqft', 'sf']
    t12_indicators = ['revenue', 'expense', 'noi', 'income', 'vacancy']

    rent_score = sum(1 for ind in rent_roll_indicators if ind in columns_str)
    t12_score = sum(1 for ind in t12_indicators if ind in columns_str)

    if rent_score > t12_score:
        return 'rent_roll'
    elif t12_score > rent_score:
        return 't12'

    return 'unknown'


def find_header_row(df: pd.DataFrame, max_rows: int = 15) -> int:
    """Find the row containing column headers."""
    for i in range(min(max_rows, len(df))):
        row = df.iloc[i]
        non_null = row.dropna()
        if len(non_null) >= 3:
            row_str = ' '.join(str(v).lower() for v in non_null)
            # Look for common header indicators
            if any(kw in row_str for kw in ['unit', 'rent', 'type', 'status', 'revenue', 'expense']):
                return i
    return 0


def clean_currency(value: Any) -> Optional[float]:
    """Convert currency string to float."""
    if pd.isna(value):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).replace('$', '').replace(',', '').replace('(', '-').replace(')', '').strip()
    try:
        return float(s)
    except ValueError:
        return None


def clean_percentage(value: Any) -> Optional[float]:
    """Convert percentage string to decimal."""
    if pd.isna(value):
        return None
    if isinstance(value, (int, float)):
        return float(value) if value <= 1 else float(value) / 100
    s = str(value).replace('%', '').strip()
    try:
        v = float(s)
        return v / 100 if v > 1 else v
    except ValueError:
        return None


def normalize_unit_type(value: Any) -> str:
    """Normalize unit type to standard format."""
    if pd.isna(value):
        return "Unknown"

    s = str(value).upper().strip()

    # Handle common patterns
    patterns = [
        (r'(\d)[xX](\d)', r'\1BR/\2BA'),  # 2x2 -> 2BR/2BA
        (r'(\d)\s*BR?\s*/?\s*(\d)\s*BA?', r'\1BR/\2BA'),  # 2BR/2BA variants
        (r'^(\d)\s*BED.*(\d)\s*BATH', r'\1BR/\2BA'),  # 2 Bed / 2 Bath
        (r'STUDIO', '0BR/1BA'),
    ]

    for pattern, replacement in patterns:
        s = re.sub(pattern, replacement, s)

    # Ensure format is consistent
    match = re.search(r'(\d)BR/(\d)BA', s)
    if match:
        return f"{match.group(1)}BR/{match.group(2)}BA"

    return s


def parse_rent_roll(df: pd.DataFrame, filename: str) -> Dict[str, Any]:
    """Parse rent roll Excel file."""
    result = {
        "source": {
            "file": filename,
            "extractedAt": datetime.utcnow().isoformat() + "Z",
            "type": "rent_roll"
        },
        "units": [],
        "unitMix": [],
        "summary": {},
        "warnings": [],
        "success": True
    }

    # Find header row
    header_row = find_header_row(df)
    if header_row > 0:
        df.columns = df.iloc[header_row]
        df = df.iloc[header_row + 1:].reset_index(drop=True)

    # Map columns
    column_mapping = {}
    columns_lower = {str(c).lower(): c for c in df.columns}

    mappings = {
        'unit_id': ['unit', 'unit #', 'unit no', 'apt', 'apartment'],
        'unit_type': ['type', 'floorplan', 'floor plan', 'bed/bath', 'br/ba', 'unit type'],
        'sqft': ['sf', 'sqft', 'sq ft', 'square feet', 'size'],
        'market_rent': ['market', 'market rent', 'asking rent', 'quoted'],
        'actual_rent': ['rent', 'current rent', 'contract rent', 'actual', 'in-place'],
        'status': ['status', 'occupancy', 'occupied', 'occ'],
        'tenant': ['tenant', 'resident', 'name'],
        'lease_end': ['lease end', 'expiration', 'expires', 'end date']
    }

    for field, keywords in mappings.items():
        for kw in keywords:
            if kw in columns_lower:
                column_mapping[field] = columns_lower[kw]
                break

    # Parse each unit
    units = []
    for _, row in df.iterrows():
        unit = {}

        if 'unit_id' in column_mapping:
            unit['unitId'] = str(row.get(column_mapping['unit_id'], '')).strip()
            if not unit['unitId'] or unit['unitId'] == 'nan':
                continue  # Skip rows without unit ID
        else:
            continue

        if 'unit_type' in column_mapping:
            unit['type'] = normalize_unit_type(row.get(column_mapping['unit_type']))

        if 'sqft' in column_mapping:
            unit['sqft'] = clean_currency(row.get(column_mapping['sqft']))

        if 'market_rent' in column_mapping:
            unit['marketRent'] = clean_currency(row.get(column_mapping['market_rent']))

        if 'actual_rent' in column_mapping:
            unit['actualRent'] = clean_currency(row.get(column_mapping['actual_rent']))

        if 'status' in column_mapping:
            status_val = str(row.get(column_mapping['status'], '')).lower()
            unit['status'] = 'occupied' if any(s in status_val for s in ['occ', 'yes', 'leased', '1']) else 'vacant'

        units.append(unit)

    result['units'] = units

    # Calculate aggregates
    if units:
        total_units = len(units)
        occupied = sum(1 for u in units if u.get('status') == 'occupied')

        # Unit mix calculation
        type_groups = {}
        for unit in units:
            t = unit.get('type', 'Unknown')
            if t not in type_groups:
                type_groups[t] = {
                    'type': t,
                    'count': 0,
                    'sqft_sum': 0,
                    'market_sum': 0,
                    'actual_sum': 0,
                    'occupied': 0
                }
            type_groups[t]['count'] += 1
            if unit.get('sqft'):
                type_groups[t]['sqft_sum'] += unit['sqft']
            if unit.get('marketRent'):
                type_groups[t]['market_sum'] += unit['marketRent']
            if unit.get('actualRent'):
                type_groups[t]['actual_sum'] += unit['actualRent']
            if unit.get('status') == 'occupied':
                type_groups[t]['occupied'] += 1

        unit_mix = []
        for t, data in type_groups.items():
            unit_mix.append({
                'type': t,
                'count': data['count'],
                'avgSqFt': round(data['sqft_sum'] / data['count']) if data['count'] > 0 else None,
                'marketRent': round(data['market_sum'] / data['count']) if data['count'] > 0 else None,
                'inPlaceRent': round(data['actual_sum'] / data['count']) if data['count'] > 0 else None,
                'occupiedCount': data['occupied']
            })

        result['unitMix'] = sorted(unit_mix, key=lambda x: x['type'])

        # Summary metrics
        total_sqft = sum(u.get('sqft', 0) or 0 for u in units)
        total_market = sum(u.get('marketRent', 0) or 0 for u in units if u.get('marketRent'))
        total_actual = sum(u.get('actualRent', 0) or 0 for u in units if u.get('actualRent'))

        result['summary'] = {
            'totalUnits': total_units,
            'occupiedUnits': occupied,
            'vacantUnits': total_units - occupied,
            'occupancyRate': round(occupied / total_units, 4) if total_units > 0 else 0,
            'totalSqFt': round(total_sqft),
            'avgUnitSqFt': round(total_sqft / total_units) if total_units > 0 else 0,
            'grossPotentialRentMonthly': round(total_market),
            'grossPotentialRentAnnual': round(total_market * 12),
            'inPlaceRentMonthly': round(total_actual),
            'inPlaceRentAnnual': round(total_actual * 12),
            'lossToLeaseMonthly': round(total_market - total_actual),
            'lossToLeaseAnnual': round((total_market - total_actual) * 12),
            'lossToLeasePercent': round((total_market - total_actual) / total_market, 4) if total_market > 0 else 0
        }

    return result


def parse_t12(df: pd.DataFrame, filename: str) -> Dict[str, Any]:
    """Parse T12 financial statement."""
    result = {
        "source": {
            "file": filename,
            "extractedAt": datetime.utcnow().isoformat() + "Z",
            "type": "t12"
        },
        "revenue": {},
        "expenses": {},
        "summary": {},
        "warnings": [],
        "success": True
    }

    # Find total column (usually rightmost with numbers or labeled "Total", "T12", "Annual")
    total_col = None
    for col in reversed(df.columns):
        col_str = str(col).lower()
        if any(kw in col_str for kw in ['total', 't12', 'annual', 'trailing']):
            total_col = col
            break

    if total_col is None:
        # Use last numeric column
        for col in reversed(df.columns):
            if df[col].dtype in ['int64', 'float64']:
                total_col = col
                break

    if total_col is None:
        result['success'] = False
        result['warnings'].append("Could not identify total/annual column")
        return result

    # Build line item lookup
    revenue = {}
    expenses = {}
    current_section = None

    for _, row in df.iterrows():
        # Get the label (usually first column)
        label = str(row.iloc[0]).strip().lower() if pd.notna(row.iloc[0]) else ''
        value = clean_currency(row[total_col])

        if not label or label == 'nan':
            continue
        if value is None:
            continue

        # Revenue totals and line items
        if ('effective' in label and 'gross' in label) or ('total' in label and 'revenue' in label):
            revenue['effectiveGrossIncome'] = value
        elif 'gross' in label and 'rent' in label:
            revenue['grossPotentialRent'] = value
        elif 'vacancy' in label:
            revenue['vacancy'] = value
        elif 'concession' in label:
            revenue['concessions'] = value
        elif 'bad debt' in label or 'write' in label:
            revenue['badDebt'] = value
        elif 'other' in label and 'income' in label:
            revenue['otherIncome'] = value

        # Expense totals and line items
        elif 'total' in label and 'expense' in label:
            expenses['totalExpenses'] = value
        elif 'tax' in label and 'payroll' not in label:
            expenses['taxes'] = value
        elif 'insurance' in label:
            expenses['insurance'] = value
        elif 'utilit' in label:
            expenses['utilities'] = value
        elif 'repair' in label or 'maintenance' in label:
            expenses['repairs'] = value
        elif 'management' in label:
            expenses['management'] = value
        elif 'payroll' in label or 'personnel' in label or 'salary' in label:
            expenses['payroll'] = value
        elif 'admin' in label:
            expenses['admin'] = value
        elif 'marketing' in label or 'advertising' in label:
            expenses['marketing'] = value
        elif 'contract' in label:
            expenses['contractServices'] = value

        # NOI
        elif 'noi' in label or ('net' in label and 'operating' in label):
            result['summary']['noi'] = value

        # Detect section headers only after extracting valued total rows.
        elif any(kw in label for kw in ['revenue', 'income']):
            current_section = 'revenue'
            continue
        elif any(kw in label for kw in ['expense', 'operating']):
            current_section = 'expenses'
            continue

    result['revenue'] = revenue
    result['expenses'] = expenses

    # Calculate summary if we have enough data
    total_rev = revenue.get('effectiveGrossIncome') or revenue.get('totalRevenue', 0)
    total_exp = expenses.get('totalExpenses', 0)
    noi = result['summary'].get('noi') or (total_rev - total_exp if total_rev and total_exp else 0)

    result['summary'] = {
        'effectiveGrossIncome': total_rev,
        'totalExpenses': total_exp,
        'netOperatingIncome': noi,
        'expenseRatio': round(total_exp / total_rev, 4) if total_rev else 0,
        'noiMargin': round(noi / total_rev, 4) if total_rev else 0
    }

    return result


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python parse_excel.py <file_path> [--type rent_roll|t12|auto]",
            "success": False
        }))
        sys.exit(1)

    file_path = sys.argv[1]
    doc_type = 'auto'

    if '--type' in sys.argv:
        idx = sys.argv.index('--type')
        if idx + 1 < len(sys.argv):
            doc_type = sys.argv[idx + 1]

    try:
        # Read Excel file
        df = pd.read_excel(file_path, engine='openpyxl')
        filename = Path(file_path).name

        # Detect or use specified type
        if doc_type == 'auto':
            doc_type = detect_document_type(df, filename)

        # Parse based on type
        if doc_type == 'rent_roll':
            result = parse_rent_roll(df, filename)
        elif doc_type == 't12':
            result = parse_t12(df, filename)
        else:
            result = {
                "success": False,
                "error": f"Unknown document type: {doc_type}",
                "detectedType": doc_type
            }

        print(json.dumps(result, indent=2))

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "file": file_path
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
