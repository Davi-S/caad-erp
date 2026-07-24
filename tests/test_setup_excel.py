from pathlib import Path
import openpyxl
import pytest

from setup_excel import create_master_workbook, run_from_config


def test_create_master_workbook_creates_dashboard_sheet(tmp_path: Path):
    target_path = tmp_path / "master_workbook.xlsx"
    create_master_workbook(target_path, default_salesman_id="GRR00000000")

    assert target_path.exists()
    wb = openpyxl.load_workbook(target_path)

    # 1. Verify sheet ordering and active sheet
    assert wb.sheetnames[0] == "Dashboard"
    assert "Products" in wb.sheetnames
    assert "Salesmen" in wb.sheetnames
    assert "TransactionLog" in wb.sheetnames
    assert wb.active.title == "Dashboard"

    dashboard = wb["Dashboard"]

    # 2. Verify charts presence
    assert len(dashboard._charts) == 2

    # 3. Verify KPI card cell contents and formulas
    assert dashboard["B2"].value == "CAAD ERP Executive Summary"
    assert dashboard["B3"].value == "Total Revenue"
    assert dashboard["C3"].value == "=SUM(TransactionLog!H:H)"
    assert dashboard["C4"].value == "=SUM(TransactionLog!I:I)"
    assert dashboard["C5"].value == "=C3+C4"
    assert dashboard["C6"].value == "=IFERROR((C3+C4)/C3, 0)"

    # 4. Verify Payment Breakdown table
    assert dashboard["E3"].value == "Cash"
    assert dashboard["F3"].value == '=SUMIFS(TransactionLog!H:H, TransactionLog!F:F, "Cash", TransactionLog!C:C, "SALE")'
    assert dashboard["G3"].value == "=IFERROR(F3/$C$3, 0)"

    # 5. Verify Sales Leaderboard
    assert dashboard["A11"].value == "=RANK(D11, $D$11:$D$15)"
    assert dashboard["B11"].value == "=Salesmen!B2"
    assert dashboard["C11"].value == '=COUNTIFS(TransactionLog!E:E, Salesmen!A2, TransactionLog!C:C, "SALE")'

    # 6. Verify Product Table
    assert dashboard["A19"].value == "=Products!A2"
    assert dashboard["C19"].value == "=SUMIF(TransactionLog!D:D, A19, TransactionLog!G:G)"


def test_run_from_config_generates_dashboard(tmp_path: Path):
    config_path = tmp_path / "config.ini"
    data_file = tmp_path / "data" / "master_workbook.xlsx"
    config_path.write_text(
        f"[System]\nDataFile = {data_file}\n\n[Defaults]\nDefaultSalesman = GRR00000000\n"
    )

    output = run_from_config(config_path, overwrite=True)
    assert output == data_file.resolve()

    wb = openpyxl.load_workbook(output)
    assert wb.sheetnames[0] == "Dashboard"
