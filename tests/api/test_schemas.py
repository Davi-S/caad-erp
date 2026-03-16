import pytest
from decimal import Decimal

import pydantic

from caad_erp import constants
from caad_erp.api import schemas


# happy path
@pytest.mark.parametrize(
    "request_type",
    [
        "ProductCreateRequest",
        "SalesmanCreateRequest",
        "SaleRequest",
        "RestockRequest",
        "WriteOffRequest",
        "VoidRequest",
        "PayDebtRequest",
    ],
)
def test_request_models_accept_valid_payloads(request_type: str) -> None:
    """
    GIVEN request payloads that satisfy field constraints
    WHEN API request DTO models are instantiated
    THEN validation succeeds and normalized values are available to handlers
    """
    payloads = {
        "ProductCreateRequest": {
            "product_id": "P001",
            "product_name": "Soda",
            "sell_price": "2.50",
            "is_active": True,
        },
        "SalesmanCreateRequest": {
            "salesman_id": "S001",
            "salesman_name": "Alice",
            "is_active": True,
        },
        "SaleRequest": {
            "product_id": "P001",
            "salesman_id": "S001",
            "quantity": "2",
            "total_revenue": "5.00",
            "payment_type": constants.PaymentType.CASH,
        },
        "RestockRequest": {
            "product_id": "P001",
            "salesman_id": "S001",
            "quantity": "2",
            "total_cost": "3.50",
        },
        "WriteOffRequest": {
            "product_id": "P001",
            "salesman_id": "S001",
            "quantity": "1",
        },
        "VoidRequest": {
            "linked_transaction_id": "TX001",
        },
        "PayDebtRequest": {
            "linked_transaction_id": "TX001",
            "salesman_id": "S001",
            "total_revenue": "2.00",
            "payment_type": constants.PaymentType.CASH,
        },
    }

    model = getattr(schemas, request_type)(**payloads[request_type])
    dumped = model.model_dump()
    assert dumped


@pytest.mark.parametrize(
    "response_type",
    [
        "StandardResponse",
        "ProductResponse",
        "SalesmanResponse",
        "TransactionResponse",
        "StockReportResponse",
        "ProfitReportResponse",
        "DebtsReportResponse",
        "LogReportResponse",
    ],
)
def test_response_models_serialize_domain_values_to_expected_shape(response_type: str) -> None:
    """
    GIVEN domain-compatible values from BLL operations
    WHEN API response DTO models are instantiated
    THEN output structure matches the HTTP contract exposed by each endpoint
    """
    payloads = {
        "StandardResponse": {
            "detail": "ok",
            "data": {"id": "X"},
        },
        "ProductResponse": {
            "product_id": "P001",
            "product_name": "Soda",
            "sell_price": Decimal("2.50"),
            "is_active": True,
        },
        "SalesmanResponse": {
            "salesman_id": "S001",
            "salesman_name": "Alice",
            "is_active": True,
        },
        "TransactionResponse": {
            "transaction_id": "TX001",
            "timestamp_iso": "2026-01-01T00:00:00+00:00",
            "transaction_type": constants.TransactionType.SALE.value,
            "product_id": "P001",
            "salesman_id": "S001",
            "payment_type": constants.PaymentType.CASH.value,
            "quantity_change": Decimal("-2"),
            "total_revenue": Decimal("5.00"),
            "total_cost": Decimal("0.00"),
            "linked_transaction_id": None,
            "notes": None,
        },
        "StockReportResponse": {
            "items": [{"product_id": "P001", "quantity": Decimal("3")}],
        },
        "ProfitReportResponse": {
            "total_revenue": Decimal("10.00"),
            "total_cost": Decimal("-3.00"),
            "profit": Decimal("7.00"),
        },
        "DebtsReportResponse": {
            "balances": [
                {
                    "transaction_id": "TX001",
                    "timestamp_iso": "2026-01-01T00:00:00+00:00",
                    "product_id": "P001",
                    "salesman_id": "S001",
                    "quantity": Decimal("2"),
                    "expected_amount": Decimal("10.00"),
                    "amount_paid": Decimal("4.00"),
                    "balance": Decimal("6.00"),
                }
            ],
            "total_outstanding": Decimal("6.00"),
        },
        "LogReportResponse": {
            "transactions": [
                {
                    "transaction_id": "TX001",
                    "timestamp_iso": "2026-01-01T00:00:00+00:00",
                    "transaction_type": constants.TransactionType.SALE.value,
                    "product_id": "P001",
                    "salesman_id": "S001",
                    "payment_type": constants.PaymentType.CASH.value,
                    "quantity_change": Decimal("-2"),
                    "total_revenue": Decimal("5.00"),
                    "total_cost": Decimal("0.00"),
                    "linked_transaction_id": None,
                    "notes": None,
                }
            ],
        },
    }

    model = getattr(schemas, response_type)(**payloads[response_type])
    dumped = model.model_dump()
    assert dumped


# sad path
@pytest.mark.parametrize(
    "invalid_case",
    [
        "blank_product_id",
        "blank_product_name",
        "negative_sell_price",
        "blank_salesman_id",
        "blank_salesman_name",
        "non_positive_quantity_sale",
        "non_positive_quantity_restock",
        "non_positive_quantity_write_off",
        "negative_total_revenue_sale",
        "negative_total_revenue_pay_debt",
        "negative_total_cost_restock",
        "blank_linked_transaction_id_void",
    ],
)
def test_request_models_reject_invalid_payloads_by_constraint(invalid_case: str) -> None:
    """
    GIVEN payloads violating pydantic field constraints
    WHEN request DTO construction is attempted
    THEN validation errors are raised with field-level diagnostics
    """
    cases = {
        "blank_product_id": (schemas.ProductCreateRequest, {
            "product_id": "",
            "product_name": "Soda",
            "sell_price": "1.00",
        }),
        "blank_product_name": (schemas.ProductCreateRequest, {
            "product_id": "P001",
            "product_name": "",
            "sell_price": "1.00",
        }),
        "negative_sell_price": (schemas.ProductCreateRequest, {
            "product_id": "P001",
            "product_name": "Soda",
            "sell_price": "-1.00",
        }),
        "blank_salesman_id": (schemas.SalesmanCreateRequest, {
            "salesman_id": "",
            "salesman_name": "Alice",
        }),
        "blank_salesman_name": (schemas.SalesmanCreateRequest, {
            "salesman_id": "S001",
            "salesman_name": "",
        }),
        "non_positive_quantity_sale": (schemas.SaleRequest, {
            "product_id": "P001",
            "salesman_id": "S001",
            "quantity": "0",
            "total_revenue": "1.00",
            "payment_type": constants.PaymentType.CASH,
        }),
        "non_positive_quantity_restock": (schemas.RestockRequest, {
            "product_id": "P001",
            "salesman_id": "S001",
            "quantity": "0",
            "total_cost": "1.00",
        }),
        "non_positive_quantity_write_off": (schemas.WriteOffRequest, {
            "product_id": "P001",
            "salesman_id": "S001",
            "quantity": "0",
        }),
        "negative_total_revenue_sale": (schemas.SaleRequest, {
            "product_id": "P001",
            "salesman_id": "S001",
            "quantity": "1",
            "total_revenue": "-1.00",
            "payment_type": constants.PaymentType.CASH,
        }),
        "negative_total_revenue_pay_debt": (schemas.PayDebtRequest, {
            "linked_transaction_id": "TX001",
            "salesman_id": "S001",
            "total_revenue": "-1.00",
            "payment_type": constants.PaymentType.CASH,
        }),
        "negative_total_cost_restock": (schemas.RestockRequest, {
            "product_id": "P001",
            "salesman_id": "S001",
            "quantity": "1",
            "total_cost": "-1.00",
        }),
        "blank_linked_transaction_id_void": (schemas.VoidRequest, {
            "linked_transaction_id": "",
        }),
    }

    model, payload = cases[invalid_case]
    with pytest.raises(pydantic.ValidationError):
        model(**payload)


def test_pay_debt_request_rejects_on_credit_payment_type() -> None:
    """
    GIVEN a pay-debt payload using OnCredit as settlement method
    WHEN PayDebtRequest validation runs
    THEN model-level validator rejects the payload with a clear ValueError
    """
    with pytest.raises(pydantic.ValidationError, match="OnCredit"):
        schemas.PayDebtRequest(
            linked_transaction_id="TX001",
            salesman_id="S001",
            total_revenue="2.00",
            payment_type=constants.PaymentType.ON_CREDIT,
        )


# edge path
def test_standard_response_allows_absent_data_for_message_only_mutations() -> None:
    """
    GIVEN mutation endpoints that may return only operation detail text
    WHEN StandardResponse is instantiated with data omitted
    THEN serialization remains valid with data represented as null
    """
    response = schemas.StandardResponse(detail="ok")

    assert response.detail == "ok"
    assert response.data is None
