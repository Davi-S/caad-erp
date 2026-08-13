"""Unit tests for the centralized business rules engine and atomic rules catalog."""

from pathlib import Path

import pytest
from openpyxl.workbook import Workbook

from caad_erp import constants
from caad_erp.bll import rules, runtime, transactions
from caad_erp.settings import AppSettings


def _make_context(workbook: Workbook) -> runtime.RuntimeContext:
    settings = AppSettings(
        data_file=Path("/tmp/data.xlsx"),
        lounge_name="Test Lounge",
        schema_version=constants.EXPECTED_SCHEMA_VERSION,
    )
    return runtime.RuntimeContext(settings=settings, workbook=workbook)


def test_base_rule_enforce_success(products_workbook: Workbook):
    """Given a rule whose check returns True, when enforce is called, then no exception is raised."""
    context = _make_context(products_workbook)

    class AlwaysPassRule(rules.BaseRule):
        name = "Always Pass"

        def check(self, context, payload):
            return True

    rule = AlwaysPassRule()
    rule.enforce(context, None)


def test_base_rule_enforce_failure(products_workbook: Workbook):
    """Given a rule whose check returns False, when enforce is called, then its exception_cls is raised with the rule name prefix."""
    context = _make_context(products_workbook)

    class AlwaysFailError(rules.BusinessRuleViolation):
        pass

    class AlwaysFailRule(rules.BaseRule):
        name = "Always Fail"
        exception_cls = AlwaysFailError

        def check(self, context, payload):
            return False

        def error_message(self, payload):
            return "Test failure"

    rule = AlwaysFailRule()
    with pytest.raises(AlwaysFailError, match=r"\[Always Fail\] Test failure"):
        rule.enforce(context, None)


def test_enforce_rules_fail_fast(products_workbook: Workbook):
    """Given a list of rules where the first rule fails, when enforce_rules is executed, then it fails fast on the first rule."""
    context = _make_context(products_workbook)

    class FailRule(rules.BaseRule):
        name = "First Rule"
        exception_cls = rules.InvalidQuantityError

        def check(self, context, payload):
            return False

        def error_message(self, payload):
            return "First rule failed"

    class NeverReachedRule(rules.BaseRule):
        name = "Second Rule"

        def check(self, context, payload):
            raise RuntimeError("Should not be evaluated")

    with pytest.raises(
        rules.InvalidQuantityError, match=r"\[First Rule\] First rule failed"
    ):
        rules.enforce_rules(context, None, [FailRule(), NeverReachedRule()])


def test_product_exists_rule_unknown(products_workbook: Workbook):
    """Given an unknown product ID, when ProductExistsRule is enforced, then ProductNotFoundError is raised."""
    context = _make_context(products_workbook)
    with pytest.raises(
        rules.ProductNotFoundError,
        match=r"\[Product Exists\] Unknown product id: UNKNOWN_P",
    ):
        rules.PRODUCT_EXISTS.enforce(context, "UNKNOWN_P")


def test_salesman_exists_rule_unknown(salesmen_workbook: Workbook):
    """Given an unknown salesman ID, when SalesmanExistsRule is enforced, then SalesmanNotFoundError is raised."""
    context = _make_context(salesmen_workbook)
    with pytest.raises(
        rules.SalesmanNotFoundError,
        match=r"\[Salesman Exists\] Unknown salesman id: UNKNOWN_S",
    ):
        rules.SALESMAN_EXISTS.enforce(context, "UNKNOWN_S")


def test_transaction_exists_rule_unknown(transactions_workbook: Workbook):
    """Given an unknown transaction ID, when TransactionExistsRule is enforced, then TransactionNotFoundError is raised."""
    context = _make_context(transactions_workbook)
    with pytest.raises(
        rules.TransactionNotFoundError,
        match=r"\[Transaction Exists\] Unknown transaction id: UNKNOWN_T",
    ):
        rules.TRANSACTION_EXISTS.enforce(context, "UNKNOWN_T")


def test_positive_quantity_rule(products_workbook: Workbook):
    """Given zero or negative quantity, when PositiveQuantityRule is enforced, then InvalidQuantityError is raised."""
    context = _make_context(products_workbook)
    cmd = transactions.SaleCommand(
        product_id="P1",
        salesman_id="S1",
        quantity=0,
        total_revenue=100,
        payment_type=constants.PaymentType.CASH,
    )
    with pytest.raises(
        rules.InvalidQuantityError,
        match=r"\[Positive Quantity Required\] Quantity must be greater than zero",
    ):
        rules.POSITIVE_QUANTITY.enforce(context, cmd)


def test_nonnegative_revenue_rule(products_workbook: Workbook):
    """Given negative total revenue, when NonnegativeRevenueRule is enforced, then InvalidMonetaryValueError is raised."""
    context = _make_context(products_workbook)
    cmd = transactions.SaleCommand(
        product_id="P1",
        salesman_id="S1",
        quantity=1,
        total_revenue=-10,
        payment_type=constants.PaymentType.CASH,
    )
    with pytest.raises(
        rules.InvalidMonetaryValueError,
        match=r"\[Nonnegative Revenue Required\] Amount must be zero or positive",
    ):
        rules.NONNEGATIVE_REVENUE.enforce(context, cmd)


def test_positive_revenue_rule(products_workbook: Workbook):
    """Given zero or negative total revenue for credit payment, when PositiveRevenueRule is enforced, then InvalidMonetaryValueError is raised."""
    context = _make_context(products_workbook)
    cmd = transactions.CreditPaymentCommand(
        linked_transaction_id="T1",
        salesman_id="S1",
        total_revenue=0,
        payment_type=constants.PaymentType.CASH,
    )
    with pytest.raises(
        rules.InvalidMonetaryValueError,
        match=r"\[Positive Revenue Required\] Payment amount must be greater than zero",
    ):
        rules.POSITIVE_REVENUE.enforce(context, cmd)
