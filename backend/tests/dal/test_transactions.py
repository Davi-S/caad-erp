import pytest

from caad_erp.dal import transactions


def _sample_transaction(
    transaction_id: str = "T-001",
    timestamp_iso: str = "2026-03-15T12:00:00",
    transaction_type: str = "SALE",
    product_id: str = "P-001",
    salesman_id: str = "S-001",
    payment_type: str | None = "Cash",
    quantity_change: int = -1,
    total_revenue: int = 550,
    total_cost: int = -200,
    linked_transaction_id: str | None = None,
    notes: str | None = "ok",
) -> transactions.TransactionRow:
    return transactions.TransactionRow(
        transaction_id=transaction_id,
        timestamp_iso=timestamp_iso,
        transaction_type=transaction_type,
        product_id=product_id,
        salesman_id=salesman_id,
        payment_type=payment_type,
        quantity_change=quantity_change,
        total_revenue=total_revenue,
        total_cost=total_cost,
        linked_transaction_id=linked_transaction_id,
        notes=notes,
    )


def test_iter_transactions_yields_transaction_row_instances(
    transactions_workbook,
) -> None:
    """
    GIVEN a transaction log sheet with populated rows
    WHEN iter_transactions is called
    THEN it yields TransactionRow instances
    """
    # Arrange
    transactions_workbook["TransactionLog"].append(
        [
            "T-001",
            "2026-03-15T12:00:00",
            "SALE",
            "P-001",
            "S-001",
            "Cash",
            -1,
            550,
            -200,
            None,
            "ok",
        ]
    )

    # Act
    records = list(transactions.iter_transactions(transactions_workbook))

    # Assert
    assert len(records) == 1
    assert isinstance(records[0], transactions.TransactionRow)


def test_iter_transactions_yields_all_non_empty_rows(transactions_workbook) -> None:
    """
    GIVEN a transaction log sheet with non-empty data rows
    WHEN iter_transactions is called
    THEN it yields all non-empty rows
    """
    # Arrange
    sheet = transactions_workbook["TransactionLog"]
    sheet.append(
        [
            "T-001",
            "2026-03-15T12:00:00",
            "SALE",
            "P-001",
            "S-001",
            "Cash",
            -1,
            55,
            -2,
            None,
            "a",
        ]
    )
    sheet.append([None, None, None, None, None, None, None, None, None, None, None])
    sheet.append(
        [
            "T-002",
            "2026-03-15T12:01:00",
            "RESTOCK",
            "P-001",
            None,
            None,
            10,
            0,
            -20,
            None,
            "b",
        ]
    )

    # Act
    records = list(transactions.iter_transactions(transactions_workbook))

    # Assert
    assert [record.transaction_id for record in records] == ["T-001", "T-002"]


def test_iter_transactions_empty_sheet_yields_nothing(transactions_workbook) -> None:
    """
    GIVEN a header-only transaction log sheet
    WHEN iter_transactions is called
    THEN it yields no rows
    """
    # Arrange

    # Act
    records = list(transactions.iter_transactions(transactions_workbook))

    # Assert
    assert not records


def test_iter_transactions_skips_fully_empty_rows(transactions_workbook) -> None:
    """
    GIVEN a transaction log sheet containing fully empty rows
    WHEN iter_transactions is called
    THEN fully empty rows are skipped
    """
    # Arrange
    sheet = transactions_workbook["TransactionLog"]
    sheet.append([None, None, None, None, None, None, None, None, None, None, None])
    sheet.append(
        [
            "T-001",
            "2026-03-15T12:00:00",
            "SALE",
            "P-001",
            "S-001",
            "Cash",
            -1,
            55,
            -2,
            None,
            "ok",
        ]
    )
    sheet.append([None, None, None, None, None, None, None, None, None, None, None])

    # Act
    records = list(transactions.iter_transactions(transactions_workbook))

    # Assert
    assert len(records) == 1
    assert records[0].transaction_id == "T-001"


def test_iter_transactions_optional_fields_are_none_when_blank(
    transactions_workbook,
) -> None:
    """
    GIVEN rows with blank optional fields
    WHEN iter_transactions is called
    THEN optional fields remain None
    """
    # Arrange
    transactions_workbook["TransactionLog"].append(
        [
            "T-001",
            "2026-03-15T12:00:00",
            "SALE",
            "P-001",
            "S-001",
            None,
            -1,
            0,
            0,
            None,
            None,
        ]
    )

    # Act
    record = next(iter(transactions.iter_transactions(transactions_workbook)))

    # Assert
    assert record.payment_type is None
    assert record.linked_transaction_id is None
    assert record.notes is None


def test_iter_transactions_raises_key_error_for_missing_sheet(make_workbook) -> None:
    """
    GIVEN a workbook without a TransactionLog sheet
    WHEN iter_transactions is called
    THEN it raises KeyError
    """
    # Arrange
    workbook = make_workbook(
        "Products", ["ProductID", "ProductName", "SellPrice", "IsActive"]
    )

    # Act / Assert
    with pytest.raises(KeyError):
        list(transactions.iter_transactions(workbook))


def test_append_transaction_increases_row_count_by_one(transactions_workbook) -> None:
    """
    GIVEN a transaction log sheet with existing rows
    WHEN append_transaction is called
    THEN row count increases by one
    """
    # Arrange
    sheet = transactions_workbook["TransactionLog"]
    before_count = sheet.max_row

    # Act
    transactions.append_transaction(transactions_workbook, _sample_transaction())

    # Assert
    assert sheet.max_row == before_count + 1


def test_append_transaction_stores_correct_values(transactions_workbook) -> None:
    """
    GIVEN a transaction record
    WHEN append_transaction is called
    THEN record values are persisted unchanged
    """
    # Arrange
    record = _sample_transaction()

    # Act
    transactions.append_transaction(transactions_workbook, record)
    last_row = list(
        transactions_workbook["TransactionLog"].iter_rows(min_row=2, values_only=True)
    )[-1]

    # Assert
    assert last_row == (
        "T-001",
        "2026-03-15T12:00:00",
        "SALE",
        "P-001",
        "S-001",
        "Cash",
        -1,
        550,
        -200,
        None,
        "ok",
    )


def test_append_transaction_column_ordering(transactions_workbook) -> None:
    """
    GIVEN a transaction record
    WHEN append_transaction is called
    THEN values are written in canonical 11-column order
    """
    # Arrange
    record = transactions.TransactionRow(
        transaction_id="T-010",
        timestamp_iso="2026-03-15T10:00:00",
        transaction_type="RESTOCK",
        product_id="P-010",
        salesman_id=None,
        payment_type=None,
        quantity_change=15,
        total_revenue=0,
        total_cost=-4000,
        linked_transaction_id="L-001",
        notes="batch",
    )

    # Act
    transactions.append_transaction(transactions_workbook, record)
    row = next(
        iter(
            transactions_workbook["TransactionLog"].iter_rows(
                min_row=2, values_only=True
            )
        )
    )

    # Assert
    assert row == (
        "T-010",
        "2026-03-15T10:00:00",
        "RESTOCK",
        "P-010",
        None,
        None,
        15,
        0,
        -4000,
        "L-001",
        "batch",
    )


def test_append_transaction_stores_none_for_optional_fields(
    transactions_workbook,
) -> None:
    """
    GIVEN a transaction record with optional None fields
    WHEN append_transaction is called
    THEN optional None values are retained
    """
    # Arrange
    record = _sample_transaction(
        payment_type=None,
        linked_transaction_id=None,
        notes=None,
    )

    # Act
    transactions.append_transaction(transactions_workbook, record)
    row = next(
        iter(
            transactions_workbook["TransactionLog"].iter_rows(
                min_row=2, values_only=True
            )
        )
    )

    # Assert
    assert row[5] is None
    assert row[9] is None
    assert row[10] is None


def test_append_transaction_raises_key_error_for_missing_sheet(make_workbook) -> None:
    """
    GIVEN a workbook without a TransactionLog sheet
    WHEN append_transaction is called
    THEN it raises KeyError
    """
    # Arrange
    workbook = make_workbook(
        "Products", ["ProductID", "ProductName", "SellPrice", "IsActive"]
    )

    # Act / Assert
    with pytest.raises(KeyError):
        transactions.append_transaction(workbook, _sample_transaction())


def test_serialize_transaction_returns_list_of_eleven_elements() -> None:
    """
    GIVEN a TransactionRow record
    WHEN _serialize_transaction is called
    THEN it returns a list with exactly eleven values
    """
    # Arrange
    record = _sample_transaction()

    # Act
    serialized = transactions._serialize_transaction(record)

    # Assert
    assert len(serialized) == 11


def test_serialize_transaction_returns_correct_column_order() -> None:
    """
    GIVEN a TransactionRow record
    WHEN _serialize_transaction is called
    THEN values are returned in canonical transaction column order
    """
    # Arrange
    record = _sample_transaction(linked_transaction_id="L-001", notes="note")

    # Act
    serialized = transactions._serialize_transaction(record)

    # Assert
    assert serialized == [
        "T-001",
        "2026-03-15T12:00:00",
        "SALE",
        "P-001",
        "S-001",
        "Cash",
        -1,
        550,
        -200,
        "L-001",
        "note",
    ]


def test_serialize_transaction_preserves_none_for_optional_fields() -> None:
    """
    GIVEN a TransactionRow with optional None values
    WHEN _serialize_transaction is called
    THEN optional None values are preserved
    """
    # Arrange
    record = _sample_transaction(
        payment_type=None,
        linked_transaction_id=None,
        notes=None,
    )

    # Act
    serialized = transactions._serialize_transaction(record)

    # Assert
    assert serialized[5] is None
    assert serialized[9] is None
    assert serialized[10] is None


def test_deserialize_transaction_returns_transaction_row_instance() -> None:
    """
    GIVEN a valid raw transaction row
    WHEN _deserialize_transaction is called
    THEN it returns a TransactionRow instance
    """
    # Arrange
    raw_row = [
        "T-001",
        "2026-03-15T12:00:00",
        "SALE",
        "P-001",
        "S-001",
        "Cash",
        -1,
        55,
        -20,
        None,
        "ok",
    ]

    # Act
    result = transactions._deserialize_transaction(raw_row)

    # Assert
    assert isinstance(result, transactions.TransactionRow)


@pytest.mark.parametrize(
    "raw_row, expected_quantity_change, expected_total_revenue, expected_total_cost",
    [
        (
            ["T-001", "ts", "SALE", None, None, None, None, None, None, None, None],
            0,
            0,
            0,
        ),
        (
            ["T-001", "ts", "SALE", None, None, None, 2, 1000, -300, None, None],
            2,
            1000,
            -300,
        ),
    ],
)
def test_deserialize_transaction_normalizes_numeric_fields(
    raw_row,
    expected_quantity_change,
    expected_total_revenue,
    expected_total_cost,
) -> None:
    """
    GIVEN raw rows with None quantity and totals
    WHEN _deserialize_transaction is called
    THEN numeric fields are normalized to expected integer values
    """
    # Arrange

    # Act
    result = transactions._deserialize_transaction(raw_row)

    # Assert
    assert result.quantity_change == expected_quantity_change
    assert result.total_revenue == expected_total_revenue
    assert result.total_cost == expected_total_cost
    assert isinstance(result.quantity_change, int)
    assert isinstance(result.total_revenue, int)
    assert isinstance(result.total_cost, int)


def test_deserialize_transaction_preserves_none_for_optional_text_fields() -> None:
    """
    GIVEN a raw row with blank optional text and link fields
    WHEN _deserialize_transaction is called
    THEN optional fields remain None
    """
    # Arrange
    raw_row = [
        "T-001",
        "2026-03-15T12:00:00",
        "SALE",
        "P-001",
        "S-001",
        None,
        -1,
        0,
        0,
        None,
        None,
    ]

    # Act
    result = transactions._deserialize_transaction(raw_row)

    # Assert
    assert result.payment_type is None
    assert result.linked_transaction_id is None
    assert result.notes is None


@pytest.mark.parametrize(
    "raw_row, expected_timestamp_iso, expected_transaction_type",
    [
        (["T-001", None, None, None, None, None, 0, 0, 0, None, None], "", ""),
        (
            [
                "T-001",
                "2026-03-15T12:00:00",
                "SALE",
                None,
                None,
                None,
                0,
                0,
                0,
                None,
                None,
            ],
            "2026-03-15T12:00:00",
            "SALE",
        ),
    ],
)
def test_deserialize_transaction_defaults_required_text_fields_when_none(
    raw_row,
    expected_timestamp_iso,
    expected_transaction_type,
) -> None:
    """
    GIVEN raw rows with None timestamp or transaction type
    WHEN _deserialize_transaction is called
    THEN required text fields default to expected values
    """
    # Arrange

    # Act
    result = transactions._deserialize_transaction(raw_row)

    # Assert
    assert result.timestamp_iso == expected_timestamp_iso
    assert result.transaction_type == expected_transaction_type


def test_deserialize_transaction_coerces_transaction_id_to_str() -> None:
    """
    GIVEN a raw row with non-string TransactionID
    WHEN _deserialize_transaction is called
    THEN TransactionID is coerced to string
    """
    # Arrange
    raw_row = [
        12345,
        "2026-03-15T12:00:00",
        "SALE",
        None,
        None,
        None,
        0,
        0,
        0,
        None,
        None,
    ]

    # Act
    result = transactions._deserialize_transaction(raw_row)

    # Assert
    assert result.transaction_id == "12345"
    assert isinstance(result.transaction_id, str)


@pytest.mark.parametrize("raw_row", [["T-001"], ["T-001", "ts", "SALE"]])
def test_deserialize_transaction_raises_value_error_for_short_row(raw_row) -> None:
    """
    GIVEN a short raw row missing required columns
    WHEN _deserialize_transaction is called
    THEN it raises ValueError
    """
    # Arrange

    # Act / Assert
    with pytest.raises(ValueError):
        transactions._deserialize_transaction(raw_row)


@pytest.mark.parametrize(
    "raw_row",
    [
        ["T-001", "ts", "SALE", None, None, None, "not-a-number", 0, 0, None, None],
        ["T-001", "ts", "SALE", None, None, None, 0, 12.34, 0, None, None],
    ],
)
def test_deserialize_transaction_raises_value_error_for_invalid_numeric_values(
    raw_row,
) -> None:
    """
    GIVEN a raw row with invalid numeric values
    WHEN _deserialize_transaction is called
    THEN it raises a value error
    """
    # Arrange

    # Act / Assert
    with pytest.raises(ValueError):
        transactions._deserialize_transaction(raw_row)
