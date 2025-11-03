from decimal import Decimal

from caad_erp import dal, constants


def test_iter_transactions_yields_transaction_rows(master_workbook_path):
    """Given workbook ledger data When iter_transactions runs Then TransactionRow objects are produced."""

    # Arrange
    workbook = dal.open_workbook(master_workbook_path)
    transactions = workbook[constants.SheetName.TRANSACTION_LOG.value]
    transactions.append(
        [
            "T1",
            "2025-10-29T20:00:00",
            constants.TransactionType.SALE.value,
            "P300",
            "S-DEFAULT",
            constants.PaymentType.CASH.value,
            "-1",
            "5.00",
            "0.00",
            None,
            "Notes",
        ]
    )
    dal.save_workbook(workbook, master_workbook_path)

    # Act
    refreshed = dal.open_workbook(master_workbook_path)
    rows = list(dal.iter_transactions(refreshed))

    # Assert
    assert rows[0].transaction_id == "T1"
    assert rows[0].quantity_change == Decimal("-1")


def test_append_transaction_adds_row(master_workbook_path):
    """Given a transaction row When append_transaction executes Then the ledger stores it."""

    # Arrange
    workbook = dal.open_workbook(master_workbook_path)
    record = dal.TransactionRow(
        transaction_id="T2",
        timestamp_iso="2025-10-29T21:00:00",
        transaction_type=constants.TransactionType.RESTOCK.value,
        product_id="P400",
        salesman_id=None,
        payment_type=constants.PaymentType.CASH.value,
        quantity_change=Decimal("10"),
        total_revenue=Decimal("0.00"),
        total_cost=Decimal("-20.00"),
        linked_transaction_id=None,
        notes="Restock",
    )

    # Act
    dal.append_transaction(workbook, record)
    dal.save_workbook(workbook, master_workbook_path)
    refreshed = dal.open_workbook(master_workbook_path)
    rows = list(dal.iter_transactions(refreshed))

    # Assert
    assert any(row.transaction_id == "T2" for row in rows)


def test_serialize_transaction_preserves_order():
    """Given a TransactionRow When serialize_transaction runs Then the column order matches the sheet schema."""

    # Arrange
    record = dal.TransactionRow(
        transaction_id="T3",
        timestamp_iso="2025-10-29T22:00:00",
        transaction_type=constants.TransactionType.SALE.value,
        product_id="P1",
        salesman_id="S1",
        payment_type=constants.PaymentType.CASH.value,
        quantity_change=Decimal("-1"),
        total_revenue=Decimal("3.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes="Note",
    )

    # Act
    serialized = dal.serialize_transaction(record)

    # Assert
    assert serialized == [
        "T3",
        "2025-10-29T22:00:00",
        constants.TransactionType.SALE.value,
        "P1",
        "S1",
        constants.PaymentType.CASH.value,
        Decimal("-1"),
        Decimal("3.00"),
        Decimal("0.00"),
        None,
        "Note",
    ]


def test_deserialize_transaction_constructs_dataclass():
    """Given raw ledger values When deserialize_transaction executes Then a TransactionRow is produced with parsed fields."""

    # Arrange
    raw_row = [
        "T9",
        "2025-10-29T23:00:00",
        constants.TransactionType.WRITE_OFF.value,
        "P9",
        "S9",
        constants.PaymentType.CASH.value,
        "-2",
        "0.00",
        "0.00",
        "T8",
        None,
    ]

    # Act
    record = dal.deserialize_transaction(raw_row)

    # Assert
    assert record.transaction_id == "T9"
    assert record.quantity_change == Decimal("-2")
    assert record.linked_transaction_id == "T8"
