"""Centralized business rules and validation runner for CAAD ERP.

This module defines all atomic business rules, their dedicated exception types,
and the rule runner framework used across the Business Logic Layer (BLL).
"""

import collections
import logging
import typing as t

from caad_erp import constants, dal
from caad_erp.bll import runtime

logger = logging.getLogger(__name__)


# =============================================================================
# Base exception and rule framework
# =============================================================================


class BusinessRuleViolation(Exception):
    """Master base exception for all BLL business rule violations."""


class BaseRule:
    """Base class for atomic business rules."""

    name: str = "Base Rule"
    exception_cls: type[BusinessRuleViolation] = BusinessRuleViolation

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        """Evaluate rule predicate against context and payload."""
        raise NotImplementedError

    def error_message(self, payload: t.Any) -> str:
        """Format human-readable error message upon violation."""
        return f"Business rule violation: {self.name}"

    def enforce(self, context: runtime.RuntimeContext, payload: t.Any) -> None:
        """Execute check and raise rule's exception_cls if check evaluates to False."""
        if not self.check(context, payload):
            msg = self.error_message(payload)
            prefix = f"[{self.name}] "
            full_msg = msg if msg.startswith(prefix) else f"{prefix}{msg}"
            raise self.exception_cls(full_msg)


def enforce_rules(
    context: runtime.RuntimeContext, payload: t.Any, rules: list[BaseRule]
) -> None:
    """Evaluate a sequence of rules in order, failing fast on the first violation."""
    for rule in rules:
        rule.enforce(context, payload)


# =============================================================================
# Specific exception subclasses and rule implementations
# =============================================================================

# --- Entity Duplication ---


class DuplicateEntityError(BusinessRuleViolation):
    """Raised when registering an entity with an already existing identifier."""


class DuplicateProductError(DuplicateEntityError):
    """Raised when registering a product with an existing product_id."""


class DuplicateSalesmanError(DuplicateEntityError):
    """Raised when registering a salesman with an existing salesman_id."""


# --- Product Exceptions & Rules ---


class ProductNotFoundError(BusinessRuleViolation):
    """Raised when a referenced product identifier does not exist in the catalog."""


class ProductInactiveError(BusinessRuleViolation):
    """Raised when an operation targets an inactive product."""


class ProductExistsRule(BaseRule):
    name = "Product Exists"
    exception_cls = ProductNotFoundError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        product_id = getattr(payload, "product_id", str(payload))
        bucket = runtime.get_cache_bucket(context, "products")
        if "by_id" not in bucket:
            all_products = list(dal.iter_products(context.workbook))
            bucket["all"] = all_products
            bucket["by_id"] = {p.product_id: p for p in all_products}
        if product_id not in bucket["by_id"]:
            logger.warning("Product lookup failed for id '%s'", product_id)
            raise ProductNotFoundError(
                f"[{self.name}] Unknown product id: {product_id}"
            )
        return True

    def error_message(self, payload: t.Any) -> str:
        product_id = getattr(payload, "product_id", str(payload))
        return f"Unknown product id: {product_id}"


class ProductIsActiveRule(BaseRule):
    name = "Product Is Active"
    exception_cls = ProductInactiveError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        product_id = getattr(payload, "product_id", str(payload))
        bucket = runtime.get_cache_bucket(context, "products")
        product = bucket["by_id"][product_id]
        if not product.is_active:
            logger.warning("Attempted operation on inactive product '%s'", product_id)
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        product_id = getattr(payload, "product_id", str(payload))
        return f"Product '{product_id}' is inactive"


# --- Salesman Exceptions & Rules ---


class SalesmanNotFoundError(BusinessRuleViolation):
    """Raised when a referenced salesman identifier does not exist in the catalog."""


class SalesmanInactiveError(BusinessRuleViolation):
    """Raised when an operation targets an inactive salesman."""


class SalesmanExistsRule(BaseRule):
    name = "Salesman Exists"
    exception_cls = SalesmanNotFoundError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        salesman_id = getattr(payload, "salesman_id", str(payload))
        bucket = runtime.get_cache_bucket(context, "salesmen")
        if "by_id" not in bucket:
            all_salesmen = list(dal.iter_salesmen(context.workbook))
            bucket["all"] = all_salesmen
            bucket["by_id"] = {s.salesman_id: s for s in all_salesmen}
        if salesman_id not in bucket["by_id"]:
            logger.warning("Salesman lookup failed for id '%s'", salesman_id)
            raise SalesmanNotFoundError(
                f"[{self.name}] Unknown salesman id: {salesman_id}"
            )
        return True

    def error_message(self, payload: t.Any) -> str:
        salesman_id = getattr(payload, "salesman_id", str(payload))
        return f"Unknown salesman id: {salesman_id}"


class SalesmanIsActiveRule(BaseRule):
    name = "Salesman Is Active"
    exception_cls = SalesmanInactiveError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        salesman_id = getattr(payload, "salesman_id", str(payload))
        bucket = runtime.get_cache_bucket(context, "salesmen")
        salesman = bucket["by_id"][salesman_id]
        if not salesman.is_active:
            logger.warning(
                "Attempted operation with inactive salesman '%s'", salesman_id
            )
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        salesman_id = getattr(payload, "salesman_id", str(payload))
        return f"Salesman '{salesman_id}' is inactive"


# --- Transaction Exceptions & Rules ---


class TransactionNotFoundError(BusinessRuleViolation):
    """Raised when a referenced transaction identifier is unknown."""


class TransactionExistsRule(BaseRule):
    name = "Transaction Exists"
    exception_cls = TransactionNotFoundError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        tx_id = getattr(payload, "linked_transaction_id", str(payload))
        bucket = runtime.get_cache_bucket(context, "transactions")
        if "by_id" not in bucket:
            all_txs = list(dal.iter_transactions(context.workbook))
            bucket["all"] = all_txs
            bucket["by_id"] = {t.transaction_id: t for t in all_txs}
        if tx_id not in bucket["by_id"]:
            logger.warning("Transaction lookup failed for id '%s'", tx_id)
            raise TransactionNotFoundError(
                f"[{self.name}] Unknown transaction id: {tx_id}"
            )
        return True

    def error_message(self, payload: t.Any) -> str:
        tx_id = getattr(payload, "linked_transaction_id", str(payload))
        return f"Unknown transaction id: {tx_id}"


# --- Inventory & Stock Exceptions & Rules ---


class InsufficientStockError(BusinessRuleViolation):
    """Raised when requested quantity exceeds available stock."""


class SufficientStockRule(BaseRule):
    name = "Sufficient Stock Required"
    exception_cls = InsufficientStockError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        from caad_erp.bll import reports

        inventory = reports.calculate_inventory(context)
        available_stock = inventory.get(payload.product_id, 0)
        if payload.quantity > available_stock:
            logger.warning(
                "Attempted operation exceeding stock for product '%s' (available=%s, requested=%s)",
                payload.product_id,
                available_stock,
                payload.quantity,
            )
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        from caad_erp.bll import reports

        inventory = (
            reports.calculate_inventory(
                payload._context if hasattr(payload, "_context") else None
            )
            if hasattr(payload, "_context")
            else {}
        )
        available_stock = inventory.get(payload.product_id, 0)
        return f"Insufficient stock for product '{payload.product_id}': available {available_stock}, requested {payload.quantity}"


class SufficientWriteOffStockRule(BaseRule):
    name = "Sufficient Write-Off Stock Required"
    exception_cls = InsufficientStockError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        from caad_erp.bll import reports

        inventory = reports.calculate_inventory(context)
        available_stock = inventory.get(payload.product_id, 0)
        if payload.quantity > available_stock:
            logger.warning(
                "Attempted write-off exceeding stock for product '%s' (available=%s, requested=%s)",
                payload.product_id,
                available_stock,
                payload.quantity,
            )
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        from caad_erp.bll import reports

        inventory = (
            reports.calculate_inventory(
                payload._context if hasattr(payload, "_context") else None
            )
            if hasattr(payload, "_context")
            else {}
        )
        available_stock = inventory.get(payload.product_id, 0)
        return f"Cannot write off {payload.quantity} units of product '{payload.product_id}': only {available_stock} available"


class BulkSufficientStockRule(BaseRule):
    name = "Bulk Sufficient Stock Required"
    exception_cls = InsufficientStockError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        from caad_erp.bll import reports

        inventory = reports.calculate_inventory(context)
        commands: list[t.Any] = payload
        aggregate_quantities: dict[str, int] = collections.defaultdict(int)
        for command in commands:
            aggregate_quantities[command.product_id] += command.quantity

        for product_id, total_requested in aggregate_quantities.items():
            available_stock = inventory.get(product_id, 0)
            if total_requested > available_stock:
                logger.warning(
                    "Bulk sale total requested exceeding stock for product '%s' (available=%s, total_requested=%s)",
                    product_id,
                    available_stock,
                    total_requested,
                )
                raise InsufficientStockError(
                    f"[{self.name}] Insufficient stock for product '{product_id}': available {available_stock}, total requested in cart {total_requested}"
                )
        return True

    def error_message(self, payload: t.Any) -> str:
        return "Insufficient stock for bulk sale"


# --- Quantity Validations ---


class InvalidQuantityError(BusinessRuleViolation):
    """Raised when quantity fails domain validation constraints."""


class PositiveQuantityRule(BaseRule):
    name = "Positive Quantity Required"
    exception_cls = InvalidQuantityError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        quantity = getattr(payload, "quantity", None)
        if quantity is None or quantity <= 0:
            logger.error("Quantity validation failed: %s", quantity)
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        return "Quantity must be greater than zero"


# --- Monetary Validations ---


class InvalidMonetaryValueError(BusinessRuleViolation):
    """Raised when monetary amounts fail validation constraints."""


class NonnegativeRevenueRule(BaseRule):
    name = "Nonnegative Revenue Required"
    exception_cls = InvalidMonetaryValueError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        revenue = getattr(payload, "total_revenue", None)
        if revenue is None or revenue < 0:
            logger.error("Monetary value validation failed: %s", revenue)
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        return "Amount must be zero or positive"


class PositiveRevenueRule(BaseRule):
    name = "Positive Revenue Required"
    exception_cls = InvalidMonetaryValueError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        revenue = getattr(payload, "total_revenue", None)
        if revenue is None or revenue <= 0:
            logger.error(
                "Credit payment validation failed: non-positive revenue '%s'", revenue
            )
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        return "Payment amount must be greater than zero"


class NonnegativeCostRule(BaseRule):
    name = "Nonnegative Cost Required"
    exception_cls = InvalidMonetaryValueError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        cost = getattr(payload, "total_cost", None)
        return not (cost is None or abs(cost) < 0)

    def error_message(self, payload: t.Any) -> str:
        return "Amount must be zero or positive"


class NonnegativeSellPriceRule(BaseRule):
    name = "Nonnegative Sell Price Required"
    exception_cls = InvalidMonetaryValueError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        price = getattr(payload, "sell_price", None)
        if price is not None and price < 0:
            logger.error("Product update rejected: negative sell_price '%s'", price)
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        return "Sell price must be zero or positive"


class RequiredSellPriceRule(BaseRule):
    name = "Sell Price Required"
    exception_cls = InvalidMonetaryValueError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        price = getattr(payload, "sell_price", None)
        if price is None:
            logger.error("Product creation rejected: missing sell_price")
            return False
        if price < 0:
            logger.error("Product creation rejected: negative sell_price '%s'", price)
            raise InvalidMonetaryValueError(
                f"[{self.name}] Sell price must be zero or positive"
            )
        return True

    def error_message(self, payload: t.Any) -> str:
        return "Sell price must be provided"


# --- Attribute Validations ---


class InvalidAttributeError(BusinessRuleViolation):
    """Raised when required entity identifiers or names are missing or blank."""


class NonEmptyProductIDRule(BaseRule):
    name = "Non-empty Product ID Required"
    exception_cls = InvalidAttributeError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        pid = getattr(payload, "product_id", "")
        if not pid or not pid.strip():
            logger.error("Product update rejected: blank product_id")
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        return "Product ID must be provided"


class NonEmptyProductNameRule(BaseRule):
    name = "Non-empty Product Name Required"
    exception_cls = InvalidAttributeError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        name = getattr(payload, "product_name", None)
        if name is not None and not name.strip():
            logger.error("Product update rejected: blank product_name")
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        return "Product name must be provided"


class RequiredProductNameRule(BaseRule):
    name = "Product Name Required"
    exception_cls = InvalidAttributeError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        name = getattr(payload, "product_name", None)
        if name is None or not name.strip():
            logger.error("Product creation rejected: missing or blank product_name")
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        return "Product name must be provided"


class RequiredIsActiveRule(BaseRule):
    name = "IsActive Required"
    exception_cls = InvalidAttributeError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        is_active = getattr(payload, "is_active", None)
        if is_active is None:
            logger.error("Creation rejected: missing is_active")
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        return "is_active must be provided"


class NonEmptySalesmanIDRule(BaseRule):
    name = "Non-empty Salesman ID Required"
    exception_cls = InvalidAttributeError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        sid = getattr(payload, "salesman_id", "")
        if not sid or not sid.strip():
            logger.error("Salesman update rejected: blank salesman_id")
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        return "Salesman ID must be provided"


class NonEmptySalesmanNameRule(BaseRule):
    name = "Non-empty Salesman Name Required"
    exception_cls = InvalidAttributeError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        name = getattr(payload, "salesman_name", None)
        if name is not None and not name.strip():
            logger.error("Salesman update rejected: blank salesman_name")
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        return "Salesman name must be provided"


class RequiredSalesmanNameRule(BaseRule):
    name = "Salesman Name Required"
    exception_cls = InvalidAttributeError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        name = getattr(payload, "salesman_name", None)
        if name is None or not name.strip():
            logger.error("Salesman creation rejected: missing or blank salesman_name")
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        return "Salesman name must be provided"


class AtLeastOneProductFieldProvidedRule(BaseRule):
    name = "At Least One Product Field Required"
    exception_cls = InvalidAttributeError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        has_fields = (
            payload.product_name is not None
            or payload.sell_price is not None
            or payload.is_active is not None
        )
        if not has_fields:
            logger.error("Product update rejected: no fields provided")
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        return "At least one field must be provided to update"


class AtLeastOneSalesmanFieldProvidedRule(BaseRule):
    name = "At Least One Salesman Field Required"
    exception_cls = InvalidAttributeError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        has_fields = payload.salesman_name is not None or payload.is_active is not None
        if not has_fields:
            logger.error("Salesman update rejected: no fields provided")
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        return "At least one field must be provided to update"


# --- Credit & Void Link Eligibility ---


class IneligibleCreditSaleError(BusinessRuleViolation):
    """Raised when a transaction linked to credit payment is ineligible."""


class CreditSaleLinkEligibilityRule(BaseRule):
    name = "Credit Sale Link Eligibility"
    exception_cls = IneligibleCreditSaleError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        linked_tx_id = payload.linked_transaction_id
        bucket = runtime.get_cache_bucket(context, "transactions")
        if "by_id" not in bucket:
            all_txs = list(dal.iter_transactions(context.workbook))
            bucket["all"] = all_txs
            bucket["by_id"] = {t.transaction_id: t for t in all_txs}

        if linked_tx_id not in bucket["by_id"]:
            logger.warning("Transaction lookup failed for id '%s'", linked_tx_id)
            raise TransactionNotFoundError(
                f"[Transaction Exists] Unknown transaction id: {linked_tx_id}"
            )

        linked_sale = bucket["by_id"][linked_tx_id]
        if linked_sale.transaction_type != constants.TransactionType.SALE.value:
            logger.error(
                "Credit payment validation failed: transaction '%s' is not a sale",
                linked_sale.transaction_id,
            )
            raise IneligibleCreditSaleError(
                f"[{self.name}] Credit payments must reference a SALE transaction"
            )

        if linked_sale.payment_type != constants.PaymentType.ON_CREDIT.value:
            logger.error(
                "Credit payment validation failed: transaction '%s' payment type is '%s'",
                linked_sale.transaction_id,
                linked_sale.payment_type,
            )
            raise IneligibleCreditSaleError(
                f"[{self.name}] Linked sale is not recorded as credit"
            )

        voided_tx_ids = {
            tx.linked_transaction_id
            for tx in bucket["all"]
            if tx.transaction_type == constants.TransactionType.VOID.value
            and tx.linked_transaction_id
        }
        if linked_sale.transaction_id in voided_tx_ids:
            logger.error(
                "Credit payment validation failed: sale transaction '%s' is voided",
                linked_sale.transaction_id,
            )
            raise IneligibleCreditSaleError(
                f"[{self.name}] Cannot process credit payment for voided transaction"
            )

        return True

    def error_message(self, payload: t.Any) -> str:
        return "Linked transaction is ineligible for credit payment"


class IneligibleVoidTargetError(BusinessRuleViolation):
    """Raised when attempting to void an ineligible target transaction."""


class VoidTargetEligibilityRule(BaseRule):
    name = "Void Target Eligibility"
    exception_cls = IneligibleVoidTargetError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        tx = payload
        if tx.transaction_type == constants.TransactionType.VOID.value:
            logger.error(
                "Cannot void transaction '%s' because it is already a void",
                tx.transaction_id,
            )
            return False
        return True

    def error_message(self, payload: t.Any) -> str:
        return "Cannot void a VOID transaction"


class EmptyBulkOperationError(BusinessRuleViolation):
    """Raised when a bulk transaction operation is submitted with zero items."""


class NonEmptyBulkSaleRule(BaseRule):
    name = "Non-empty Bulk Sale Required"
    exception_cls = EmptyBulkOperationError

    def check(self, context: runtime.RuntimeContext, payload: t.Any) -> bool:
        return bool(payload)

    def error_message(self, payload: t.Any) -> str:
        return "Bulk sale requires at least one item"


# =============================================================================
# Instantiated Rule Singletons for Workflow Execution
# =============================================================================

PRODUCT_EXISTS = ProductExistsRule()
PRODUCT_IS_ACTIVE = ProductIsActiveRule()
SALESMAN_EXISTS = SalesmanExistsRule()
SALESMAN_IS_ACTIVE = SalesmanIsActiveRule()
TRANSACTION_EXISTS = TransactionExistsRule()
SUFFICIENT_STOCK = SufficientStockRule()
SUFFICIENT_WRITE_OFF_STOCK = SufficientWriteOffStockRule()
BULK_SUFFICIENT_STOCK = BulkSufficientStockRule()
POSITIVE_QUANTITY = PositiveQuantityRule()
NONNEGATIVE_REVENUE = NonnegativeRevenueRule()
POSITIVE_REVENUE = PositiveRevenueRule()
NONNEGATIVE_COST = NonnegativeCostRule()
NONNEGATIVE_SELL_PRICE = NonnegativeSellPriceRule()
REQUIRED_SELL_PRICE = RequiredSellPriceRule()
NON_EMPTY_PRODUCT_ID = NonEmptyProductIDRule()
NON_EMPTY_PRODUCT_NAME = NonEmptyProductNameRule()
REQUIRED_PRODUCT_NAME = RequiredProductNameRule()
NON_EMPTY_SALESMAN_ID = NonEmptySalesmanIDRule()
NON_EMPTY_SALESMAN_NAME = NonEmptySalesmanNameRule()
REQUIRED_SALESMAN_NAME = RequiredSalesmanNameRule()
REQUIRED_IS_ACTIVE = RequiredIsActiveRule()
AT_LEAST_ONE_PRODUCT_FIELD = AtLeastOneProductFieldProvidedRule()
AT_LEAST_ONE_SALESMAN_FIELD = AtLeastOneSalesmanFieldProvidedRule()
CREDIT_SALE_LINK_ELIGIBLE = CreditSaleLinkEligibilityRule()
VOID_TARGET_ELIGIBLE = VoidTargetEligibilityRule()
NON_EMPTY_BULK_SALE = NonEmptyBulkSaleRule()
