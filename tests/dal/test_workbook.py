from pathlib import Path

import pytest

from caad_erp.dal import workbook as dal_workbook


def test_open_workbook_returns_workbook_instance(tmp_workbook_path: Path) -> None:
    """
    GIVEN an existing workbook file
    WHEN open_workbook is called
    THEN it returns a live Workbook instance
    """
    # Arrange

    # Act
    workbook = dal_workbook.open_workbook(tmp_workbook_path)

    # Assert
    assert hasattr(workbook, "save")
    assert isinstance(workbook.sheetnames, list)


@pytest.mark.parametrize(
    "missing_path",
    [
        Path("missing.xlsx"),
        Path("nested") / "missing.xlsx",
    ],
)
def test_open_workbook_raises_file_not_found_for_missing_path(
    tmp_path: Path,
    missing_path,
) -> None:
    """
    GIVEN a missing workbook path
    WHEN open_workbook is called
    THEN it raises FileNotFoundError
    """
    # Arrange
    file_path = tmp_path / missing_path

    # Act / Assert
    with pytest.raises(FileNotFoundError, match="Workbook not found"):
        dal_workbook.open_workbook(file_path)


@pytest.mark.parametrize(
    "invalid_file_payload",
    [
        b"not an xlsx",
        b"PK\x03\x04broken-zip-content",
    ],
)
def test_open_workbook_raises_for_invalid_file_content(
    tmp_path: Path,
    invalid_file_payload,
) -> None:
    """
    GIVEN an invalid workbook file
    WHEN open_workbook is called
    THEN openpyxl raises a load or parsing error
    """
    # Arrange
    invalid_path = tmp_path / "invalid.xlsx"
    invalid_path.write_bytes(invalid_file_payload)

    # Act / Assert
    with pytest.raises(Exception):
        dal_workbook.open_workbook(invalid_path)


def test_save_workbook_writes_file_to_existing_directory(
    tmp_path: Path,
    tmp_workbook_path: Path,
) -> None:
    """
    GIVEN a writable existing directory
    WHEN save_workbook is called
    THEN the target file is created
    """
    # Arrange
    workbook = dal_workbook.open_workbook(tmp_workbook_path)
    target = tmp_path / "saved.xlsx"

    # Act
    dal_workbook.save_workbook(workbook, target)

    # Assert
    assert target.is_file()


def test_save_workbook_creates_missing_parent_directories(
    tmp_path: Path,
    tmp_workbook_path: Path,
) -> None:
    """
    GIVEN missing parent directories
    WHEN save_workbook is called
    THEN the directories are created automatically
    """
    # Arrange
    workbook = dal_workbook.open_workbook(tmp_workbook_path)
    target = tmp_path / "a" / "b" / "saved.xlsx"

    # Act
    dal_workbook.save_workbook(workbook, target)

    # Assert
    assert target.exists()
    assert target.parent.exists()


def test_save_workbook_saved_file_is_valid_xlsx(
    tmp_path: Path,
    tmp_workbook_path: Path,
) -> None:
    """
    GIVEN a saved workbook file
    WHEN it is reopened
    THEN it is a valid xlsx workbook
    """
    # Arrange
    workbook = dal_workbook.open_workbook(tmp_workbook_path)
    target = tmp_path / "valid.xlsx"

    # Act
    dal_workbook.save_workbook(workbook, target)
    reopened = dal_workbook.open_workbook(target)

    # Assert
    assert hasattr(reopened, "save")
    assert reopened.sheetnames


def test_save_workbook_propagates_permission_error_when_unwritable(
    tmp_path: Path,
    tmp_workbook_path: Path,
) -> None:
    """
    GIVEN an unwritable destination
    WHEN save_workbook is called
    THEN it propagates PermissionError
    """
    # Arrange
    workbook = dal_workbook.open_workbook(tmp_workbook_path)
    readonly_dir = tmp_path / "readonly"
    readonly_dir.mkdir()
    target = readonly_dir / "saved.xlsx"

    # Deny write permission on the directory so openpyxl cannot create file.
    readonly_dir.chmod(0o555)
    try:
        with pytest.raises(PermissionError):
            dal_workbook.save_workbook(workbook, target)
    finally:
        # Restore permissions so pytest temp cleanup can remove this path.
        readonly_dir.chmod(0o755)


@pytest.mark.parametrize(
    "lookup_key, expected_row_index",
    [
        ("P-001", 2),
        ("P-002", 3),
    ],
)
def test_locate_row_returns_correct_row_index(
    products_workbook,
    lookup_key,
    expected_row_index,
) -> None:
    """
    GIVEN a sheet containing the key
    WHEN locate_row is called
    THEN it returns the expected 1-based row index
    """
    # Arrange
    sheet = products_workbook["Products"]
    sheet.append(["P-001", "Soda", 5.5, True])
    sheet.append(["P-002", "Water", 3.0, True])

    # Act
    row_index = dal_workbook.locate_row(
        products_workbook, "Products", "ProductID", lookup_key
    )

    # Assert
    assert row_index == expected_row_index


@pytest.mark.parametrize("missing_key", ["P-404", "UNKNOWN"])
def test_locate_row_returns_none_when_value_not_found(
    products_workbook,
    missing_key,
) -> None:
    """
    GIVEN a sheet without the key
    WHEN locate_row is called
    THEN it returns None
    """
    # Arrange
    products_workbook["Products"].append(["P-001", "Soda", 5.5, True])

    # Act
    result = dal_workbook.locate_row(
        products_workbook, "Products", "ProductID", missing_key
    )

    # Assert
    assert result is None


@pytest.mark.parametrize("unknown_column", ["BadColumn", "Sku"])
def test_locate_row_raises_key_error_for_unknown_column(
    products_workbook,
    unknown_column,
) -> None:
    """
    GIVEN an unknown key column
    WHEN locate_row is called
    THEN it raises KeyError
    """
    # Arrange

    # Act / Assert
    with pytest.raises(KeyError, match="Unknown column"):
        dal_workbook.locate_row(products_workbook, "Products", unknown_column, "P-001")


def test_locate_row_returns_first_match_when_duplicates_exist(
    products_workbook,
) -> None:
    """
    GIVEN duplicate matching keys
    WHEN locate_row is called
    THEN it returns the first matching data row
    """
    # Arrange
    sheet = products_workbook["Products"]
    sheet.append(["P-001", "Soda", 5.5, True])
    sheet.append(["P-001", "Soda Duplicate", 6.0, False])

    # Act
    row_index = dal_workbook.locate_row(
        products_workbook, "Products", "ProductID", "P-001"
    )

    # Assert
    assert row_index == 2


def test_locate_row_excludes_header_row_from_search(products_workbook) -> None:
    """
    GIVEN a header containing the lookup value
    WHEN locate_row is called
    THEN header row is not matched
    """
    # Arrange

    # Act
    row_index = dal_workbook.locate_row(
        products_workbook, "Products", "ProductID", "ProductID"
    )

    # Assert
    assert row_index is None


def test_locate_row_returns_none_for_header_only_sheet(products_workbook) -> None:
    """
    GIVEN a header-only sheet
    WHEN locate_row is called
    THEN it returns None
    """
    # Arrange

    # Act
    row_index = dal_workbook.locate_row(
        products_workbook, "Products", "ProductID", "P-001"
    )

    # Assert
    assert row_index is None


@pytest.mark.parametrize("unknown_sheet", ["UnknownSheet", "Nope"])
def test_locate_row_raises_key_error_for_unknown_sheet(
    products_workbook,
    unknown_sheet,
) -> None:
    """
    GIVEN a non-existent sheet name
    WHEN locate_row is called
    THEN it raises KeyError
    """
    # Arrange

    # Act / Assert
    with pytest.raises(KeyError):
        dal_workbook.locate_row(products_workbook, unknown_sheet, "ProductID", "P-001")
