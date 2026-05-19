#!/usr/bin/env python3
"""Generate committed XLSX parser fixtures used by parser-service tests."""

from pathlib import Path

from openpyxl import Workbook


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DIR = ROOT / "fixtures" / "parsers"


def save_workbook(workbook: Workbook, file_name: str) -> None:
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    workbook.save(FIXTURE_DIR / file_name)


def rent_roll_alternate_headers() -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Alt Headers"
    sheet.append(["Apt No.", "Floor Plan", "Net Rentable SF", "Market / Asking", "In Place Rent", "Lease Status"])
    sheet.append(["101", "1 Bed / 1 Bath", 720, 1650, 1600, "Current"])
    sheet.append(["102", "1 Bed / 1 Bath", 720, 1650, 0, "Available"])
    sheet.append(["201", "2x2", 1050, 2250, 2200, "Leased"])
    sheet.append(["202", "Studio", 500, 1400, 1375, "Occupied"])
    save_workbook(workbook, "rent-roll-alternate-headers.xlsx")


def rent_roll_totals_and_blanks() -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Rent Roll"
    sheet.append(["Parkview Apartments", None, None, None, None, None])
    sheet.append([None, None, None, None, None, None])
    sheet.append(["Unit Number", "Beds/Baths", "Sq Ft", "Market Rent", "Contract Rent", "Occupancy Status"])
    sheet.append(["101", "1BR/1BA", 700, 1600, 1550, "Occupied"])
    sheet.append(["102", "1BR/1BA", 700, 1600, 0, "Vacant"])
    sheet.append([None, None, None, None, None, None])
    sheet.append(["201", "2BR/2BA", 1050, 2250, 2150, "Occupied"])
    sheet.append(["202", "2BR/2BA", 1050, 2250, 2200, "Occupied"])
    sheet.append(["Total", None, 3500, 7700, 5900, None])
    save_workbook(workbook, "rent-roll-totals-and-blanks.xlsx")


def rent_roll_occupancy_conventions() -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Occupancy"
    sheet.append(["Apartment", "Layout", "NRSF", "Quoted Rent", "Monthly Rent", "Resident", "Occ?"])
    sheet.append(["301", "1x1", 710, 1700, 1680, "Jordan Lee", "Yes"])
    sheet.append(["302", "1x1", 710, 1700, 0, None, "No"])
    sheet.append(["303", "2 Bed / 2 Bath", 1080, 2350, 2300, "Morgan Chen", "Notice"])
    sheet.append(["304", "2 Bed / 2 Bath", 1080, 2350, 2325, "Taylor Brooks", None])
    save_workbook(workbook, "rent-roll-occupancy-conventions.xlsx")


def t12_multi_sheet() -> None:
    workbook = Workbook()
    cover = workbook.active
    cover.title = "Cover"
    cover.append(["Parkview Apartments"])
    cover.append(["Workbook includes notes and trailing twelve financials."])
    cover.append(["Prepared for parser fixture coverage."])

    sheet = workbook.create_sheet("Trailing 12")
    sheet.append(["Parkview Apartments T12", None, None, None, None, None, None, None, None, None, None, None, None, None])
    sheet.append(["Account Name", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Annual"])
    sheet.append(["Gross Potential Rent", 150000, 150000, 150000, 150000, 150000, 150000, 150000, 150000, 150000, 150000, 150000, 150000, 1800000])
    sheet.append(["Vacancy Loss", -20000, -20000, -20000, -20000, -20000, -20000, -20000, -20000, -20000, -20000, -20000, -20000, -240000])
    sheet.append(["Effective Gross Income", 130000, 130000, 130000, 130000, 130000, 130000, 130000, 130000, 130000, 130000, 130000, 130000, 1560000])
    sheet.append(["Total Operating Expenses", 51667, 51667, 51667, 51667, 51667, 51667, 51667, 51667, 51667, 51667, 51667, 51663, 620000])
    sheet.append(["Net Operating Income", 78333, 78333, 78333, 78333, 78333, 78333, 78333, 78333, 78333, 78333, 78333, 78337, 940000])
    save_workbook(workbook, "t12-multi-sheet.xlsx")


def main() -> None:
    rent_roll_alternate_headers()
    rent_roll_totals_and_blanks()
    rent_roll_occupancy_conventions()
    t12_multi_sheet()


if __name__ == "__main__":
    main()
