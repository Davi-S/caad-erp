import pytest

from caad_erp import bll, constants, exceptions


def _add_product(
    context: bll.RuntimeContext, product_id: str, price: int = 1000
) -> None:
    bll.add_product(
        context,
        bll.ProductCommand(
            product_id=product_id,
            product_name=f"Product {product_id}",
            sell_price=price,
            is_active=True,
        ),
    )


def _add_salesman(context: bll.RuntimeContext, salesman_id: str) -> None:
    bll.add_salesman(
        context,
        bll.SalesmanCommand(
            salesman_id=salesman_id,
            salesman_name=f"Salesman {salesman_id}",
            is_active=True,
        ),
    )


def test_add_product_then_list_products_includes_new_active_item(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN an initialized workbook context without a specific product id
    WHEN bll.add_product is executed and bll.list_products is called
    THEN the new product appears in active listings with expected values
    """
    _add_product(initialized_context, "WF-P001")
    products = bll.list_products(initialized_context)
    assert any(product.product_id == "WF-P001" for product in products)


def test_add_salesman_then_list_salesmen_includes_new_active_item(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN an initialized workbook context without a specific salesman id
    WHEN bll.add_salesman is executed and bll.list_salesmen is called
    THEN the new salesman appears in active listings with expected values
    """
    _add_salesman(initialized_context, "WF-S001")
    salesmen = bll.list_salesmen(initialized_context)
    assert any(salesman.salesman_id == "WF-S001" for salesman in salesmen)


def test_record_sale_updates_transaction_log_and_inventory_report(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN active product and salesman with initial stock baseline
    WHEN bll.record_sale is executed
    THEN transaction log gains SALE entry and inventory reflects stock decrement
    """
    _add_product(initialized_context, "WF-P003")
    _add_salesman(initialized_context, "WF-S003")
    bll.record_open_stock(
        initialized_context,
        bll.OpenStockCommand(
            product_id="WF-P003",
            salesman_id="WF-S003",
            quantity=10,
            total_revenue=0,
        ),
    )
    sale = bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="WF-P003",
            salesman_id="WF-S003",
            quantity=2,
            total_revenue=2000,
            payment_type=constants.PaymentType.CASH,
        ),
    )
    assert sale.transaction_type == constants.TransactionType.SALE.value
    assert bll.calculate_inventory(initialized_context)["WF-P003"] == 8


def test_record_restock_updates_transaction_log_inventory_and_profit_summary(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN active product and salesman with known baseline
    WHEN bll.record_restock is executed
    THEN transaction log gains RESTOCK entry inventory increases and cost affects profit summary
    """
    _add_product(initialized_context, "WF-P004")
    _add_salesman(initialized_context, "WF-S004")
    restock = bll.record_restock(
        initialized_context,
        bll.RestockCommand(
            product_id="WF-P004",
            salesman_id="WF-S004",
            quantity=5,
            total_cost=1250,
        ),
    )
    assert restock.transaction_type == constants.TransactionType.RESTOCK.value
    assert bll.calculate_inventory(initialized_context)["WF-P004"] == 5
    assert bll.calculate_profit_summary(initialized_context)["total_cost"] == -1250


def test_record_write_off_updates_inventory_without_revenue_or_cost_change(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN active product and salesman with available stock
    WHEN bll.record_write_off is executed
    THEN inventory decreases while revenue and cost totals remain unchanged for that operation
    """
    _add_product(initialized_context, "WF-P005")
    _add_salesman(initialized_context, "WF-S005")
    bll.record_open_stock(
        initialized_context,
        bll.OpenStockCommand(
            product_id="WF-P005",
            salesman_id="WF-S005",
            quantity=5,
            total_revenue=0,
        ),
    )
    before = bll.calculate_profit_summary(initialized_context)
    bll.record_write_off(
        initialized_context,
        bll.WriteOffCommand(
            product_id="WF-P005",
            salesman_id="WF-S005",
            quantity=2,
        ),
    )
    after = bll.calculate_profit_summary(initialized_context)
    assert bll.calculate_inventory(initialized_context)["WF-P005"] == 3
    assert before == after


def test_credit_sale_then_payment_reduces_outstanding_debt(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN a sale recorded with payment type OnCredit and outstanding balance
    WHEN bll.record_credit_payment is executed against that sale
    THEN debts report shows reduced outstanding total and linked payment traceability
    """
    _add_product(initialized_context, "WF-P006", price=1000)
    _add_salesman(initialized_context, "WF-S006")
    sale = bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="WF-P006",
            salesman_id="WF-S006",
            quantity=2,
            total_revenue=0,
            payment_type=constants.PaymentType.ON_CREDIT,
        ),
    )
    before = bll.calculate_outstanding_debts(initialized_context)
    bll.record_credit_payment(
        initialized_context,
        bll.CreditPaymentCommand(
            linked_transaction_id=sale.transaction_id,
            salesman_id="WF-S006",
            total_revenue=500,
            payment_type=constants.PaymentType.CASH,
        ),
    )
    after = bll.calculate_outstanding_debts(initialized_context)
    assert before["total_outstanding"] == 2000
    assert after["total_outstanding"] == 1500


def test_void_transaction_reverses_inventory_and_financial_effects(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN a previously recorded mutable transaction affecting inventory and totals
    WHEN bll.record_void is executed for that transaction
    THEN reversal entry negates quantity revenue and cost effects in downstream reports
    """
    _add_product(initialized_context, "WF-P007")
    _add_salesman(initialized_context, "WF-S007")
    restock = bll.record_restock(
        initialized_context,
        bll.RestockCommand(
            product_id="WF-P007",
            salesman_id="WF-S007",
            quantity=4,
            total_cost=1000,
        ),
    )
    bll.record_void(
        initialized_context,
        bll.VoidCommand(linked_transaction_id=restock.transaction_id),
    )
    assert bll.calculate_inventory(initialized_context).get("WF-P007", 0) == 0
    assert bll.calculate_profit_summary(initialized_context)["total_cost"] == 0


@pytest.mark.parametrize(
    "workflow_name",
    [
        "sale_inactive_product",
        "restock_inactive_salesman",
        "credit_payment_unknown_link",
    ],
)
def test_invalid_workflows_raise_domain_errors_without_partial_state_changes(
    workflow_name: str,
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN invalid workflow inputs such as inactive references unknown ids or invalid monetary values
    WHEN corresponding business operation is attempted
    THEN domain error is raised and workbook state remains unchanged for that failed attempt
    """
    context = initialized_context
    _add_product(context, "WF-P008")
    _add_salesman(context, "WF-S008")

    baseline = len(bll.list_transactions(context))
    if workflow_name == "sale_inactive_product":
        bll.update_product(
            context, bll.ProductCommand(product_id="WF-P008", is_active=False)
        )
        with pytest.raises(exceptions.BusinessRuleViolation):
            bll.record_sale(
                context,
                bll.SaleCommand(
                    product_id="WF-P008",
                    salesman_id="WF-S008",
                    quantity=1,
                    total_revenue=100,
                    payment_type=constants.PaymentType.CASH,
                ),
            )
    elif workflow_name == "restock_inactive_salesman":
        bll.update_salesman(
            context, bll.SalesmanCommand(salesman_id="WF-S008", is_active=False)
        )
        with pytest.raises(exceptions.BusinessRuleViolation):
            bll.record_restock(
                context,
                bll.RestockCommand(
                    product_id="WF-P008",
                    salesman_id="WF-S008",
                    quantity=1,
                    total_cost=100,
                ),
            )
    else:
        with pytest.raises(exceptions.MissingReferenceError):
            bll.record_credit_payment(
                context,
                bll.CreditPaymentCommand(
                    linked_transaction_id="UNKNOWN-TX",
                    salesman_id="WF-S008",
                    total_revenue=100,
                    payment_type=constants.PaymentType.CASH,
                ),
            )

    assert len(bll.list_transactions(context)) == baseline


def test_cache_consistency_after_multiple_mutations_and_reports(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN a sequence of product salesman and transaction mutations in one runtime context
    WHEN multiple report and listing APIs are called interleaved with mutations
    THEN cache invalidation keeps all read APIs consistent with final workbook state
    """
    _add_product(initialized_context, "WF-P009")
    _add_salesman(initialized_context, "WF-S009")
    bll.record_open_stock(
        initialized_context,
        bll.OpenStockCommand(
            product_id="WF-P009",
            salesman_id="WF-S009",
            quantity=8,
            total_revenue=0,
        ),
    )
    _ = bll.list_products(initialized_context)
    _ = bll.list_transactions(initialized_context)
    bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="WF-P009",
            salesman_id="WF-S009",
            quantity=3,
            total_revenue=3000,
            payment_type=constants.PaymentType.CASH,
        ),
    )
    inventory = bll.calculate_inventory(initialized_context)
    transactions = bll.list_transactions(initialized_context)
    assert inventory["WF-P009"] == 5
    assert any(
        t.transaction_type == constants.TransactionType.SALE.value for t in transactions
    )


def test_data_persists_across_context_reload_for_full_workflow(
    integration_config_path,
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN a complete workflow with several successful mutations and explicit persistence
    WHEN a fresh runtime context is loaded from the same files
    THEN products salesmen transactions inventory and summary outputs match persisted state
    """
    _add_product(initialized_context, "WF-P010")
    _add_salesman(initialized_context, "WF-S010")
    bll.record_open_stock(
        initialized_context,
        bll.OpenStockCommand(
            product_id="WF-P010",
            salesman_id="WF-S010",
            quantity=6,
            total_revenue=0,
        ),
    )
    bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="WF-P010",
            salesman_id="WF-S010",
            quantity=2,
            total_revenue=2000,
            payment_type=constants.PaymentType.CASH,
        ),
    )
    bll.persist_context(initialized_context)

    reloaded = bll.load_context(integration_config_path)
    assert bll.get_product(reloaded, "WF-P010").product_name == "Product WF-P010"
    assert bll.get_salesman(reloaded, "WF-S010").salesman_name == "Salesman WF-S010"
    assert bll.calculate_inventory(reloaded)["WF-P010"] == 4


def test_multi_entity_workflow_reconciles_inventory_profit_and_debts(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN two products and two salesmen participating in mixed sale restock write-off credit and void operations
    WHEN all reports are computed at the end of the chained workflow
    THEN inventory profit and outstanding debts reconcile with the combined ledger effects
    """
    _add_product(initialized_context, "WF-P011", price=1000)
    _add_product(initialized_context, "WF-P012", price=500)
    _add_salesman(initialized_context, "WF-S011")
    _add_salesman(initialized_context, "WF-S012")

    bll.record_open_stock(
        initialized_context,
        bll.OpenStockCommand(
            product_id="WF-P011",
            salesman_id="WF-S011",
            quantity=10,
            total_revenue=0,
        ),
    )
    voided_sale = bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="WF-P011",
            salesman_id="WF-S011",
            quantity=2,
            total_revenue=2000,
            payment_type=constants.PaymentType.CASH,
        ),
    )
    bll.record_void(
        initialized_context,
        bll.VoidCommand(linked_transaction_id=voided_sale.transaction_id),
    )
    bll.record_restock(
        initialized_context,
        bll.RestockCommand(
            product_id="WF-P012",
            salesman_id="WF-S012",
            quantity=12,
            total_cost=1800,
        ),
    )
    credit_sale = bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="WF-P012",
            salesman_id="WF-S012",
            quantity=4,
            total_revenue=0,
            payment_type=constants.PaymentType.ON_CREDIT,
        ),
    )
    bll.record_credit_payment(
        initialized_context,
        bll.CreditPaymentCommand(
            linked_transaction_id=credit_sale.transaction_id,
            salesman_id="WF-S012",
            total_revenue=600,
            payment_type=constants.PaymentType.PIX,
        ),
    )
    bll.record_write_off(
        initialized_context,
        bll.WriteOffCommand(
            product_id="WF-P012",
            salesman_id="WF-S012",
            quantity=1,
        ),
    )

    inventory = bll.calculate_inventory(initialized_context)
    profit = bll.calculate_profit_summary(initialized_context)
    debts = bll.calculate_outstanding_debts(initialized_context)

    assert inventory["WF-P011"] == 10
    assert inventory["WF-P012"] == 7
    assert profit["total_revenue"] == 600
    assert profit["total_cost"] == -1800
    assert profit["profit"] == -1200
    assert debts["total_outstanding"] == 1400
    assert len(debts["balances"]) == 1
    assert debts["balances"][0].transaction_id == credit_sale.transaction_id


def test_invalid_void_chains_raise_without_creating_partial_rows(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN a credit-sale lifecycle with a settlement payment and a valid sale void
    WHEN invalid void attempts target a credit-payment row and then a void row
    THEN business errors are raised and transaction count only changes for the valid void
    """
    _add_product(initialized_context, "WF-P013", price=900)
    _add_salesman(initialized_context, "WF-S013")

    credit_sale = bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="WF-P013",
            salesman_id="WF-S013",
            quantity=2,
            total_revenue=0,
            payment_type=constants.PaymentType.ON_CREDIT,
        ),
    )
    payment = bll.record_credit_payment(
        initialized_context,
        bll.CreditPaymentCommand(
            linked_transaction_id=credit_sale.transaction_id,
            salesman_id="WF-S013",
            total_revenue=500,
            payment_type=constants.PaymentType.CASH,
        ),
    )

    before_invalid_voids = len(bll.list_transactions(initialized_context))

    with pytest.raises(exceptions.BusinessRuleViolation):
        bll.record_void(
            initialized_context,
            bll.VoidCommand(linked_transaction_id=payment.transaction_id),
        )

    valid_void = bll.record_void(
        initialized_context,
        bll.VoidCommand(linked_transaction_id=credit_sale.transaction_id),
    )

    with pytest.raises(exceptions.BusinessRuleViolation):
        bll.record_void(
            initialized_context,
            bll.VoidCommand(linked_transaction_id=valid_void.transaction_id),
        )

    final_transactions = bll.list_transactions(initialized_context)
    assert len(final_transactions) == before_invalid_voids + 1
