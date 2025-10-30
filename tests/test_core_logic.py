from caad_erp import core_logic
import pytest

# The 'setup_test_environment' fixture is automatically injected


def test_add_product(setup_test_environment):
    """Test adding a product and then retrieving it."""
    core_logic.cli_add_product("P101", "Test Coke", 1.50)

    # Re-fetch data
    product = core_logic.get_product_by_id("P101")
    assert product is not None
    assert product["ProductName"] == "Test Coke"
    assert product["IsActive"] is True

    # Test duplicate prevention
    with pytest.raises(ValueError, match="already exists"):
        core_logic.cli_add_product("P101", "Another Coke", 2.00)


def test_calculate_stock(setup_test_environment):
    """Test the complete stock calculation logic."""
    core_logic.cli_add_product("P101", "Test Item", 1.50)

    # 1. Initial stock should be 0
    assert core_logic.calculate_stock("P101") == 0

    # 2. Restock
    core_logic.cli_record_restock("P101", 20, 20.0, "S1")
    assert core_logic.calculate_stock("P101") == 20

    # 3. Sale
    core_logic.cli_record_sale("P101", 3, "Cash", "S1")
    assert core_logic.calculate_stock("P101") == 17

    # 4. Write-off
    core_logic.cli_record_writeoff("P101", 2, "S1", "Spoiled")
    assert core_logic.calculate_stock("P101") == 15

    # 5. Donated restock (cost 0)
    core_logic.cli_record_restock("P101", 5, 0.0, "S1")
    assert core_logic.calculate_stock("P101") == 20


def test_sale_logic(setup_test_environment):
    """Test standard sale and discount sale."""
    core_logic.cli_add_product("P101", "Test Item", 1.50)

    # 1. Standard sale
    core_logic.cli_record_sale("P101", 2, "Cash", "S1")
    data = core_logic.get_data(force_refresh=True)
    tx1 = data["TransactionLog"][0]
    assert tx1["QuantityChange"] == -2
    assert tx1["TotalRevenue"] == 3.00  # 2 * 1.50

    # 2. Discounted sale (manual price override)
    core_logic.cli_record_sale("P101", 1, "Cash", "S1", total_revenue=1.00)
    data = core_logic.get_data(force_refresh=True)
    tx2 = data["TransactionLog"][1]
    assert tx2["QuantityChange"] == -1
    assert tx2["TotalRevenue"] == 1.00  # Manual price


def test_credit_sale_workflow(setup_test_environment):
    """Test the full 'On Credit' -> 'Pay Debt' workflow."""
    core_logic.cli_add_product("P101", "Credit Item", 1.75)

    # 1. Record the 'On Credit' sale
    core_logic.cli_record_sale("P101", 1, "On Credit", "S1")

    # Check that revenue was 0 and stock decreased
    data = core_logic.get_data(force_refresh=True)
    credit_sale_tx = data["TransactionLog"][0]
    assert credit_sale_tx["TransactionType"] == "SALE"
    assert credit_sale_tx["PaymentType"] == "On Credit"
    assert credit_sale_tx["TotalRevenue"] == 0.00
    assert core_logic.calculate_stock("P101") == -1

    # 2. Check that it appears in unpaid debts
    unpaid_debts = core_logic.get_unpaid_debts()
    assert len(unpaid_debts) == 1
    assert unpaid_debts[0]["TransactionID"] == credit_sale_tx["TransactionID"]

    # 3. Pay the debt
    core_logic.cli_pay_debt(credit_sale_tx["TransactionID"], "Cash", "S1")

    # 4. Check that debt is now paid
    unpaid_debts_after = core_logic.get_unpaid_debts()
    assert len(unpaid_debts_after) == 0

    # 5. Check the new CREDIT_PAYMENT transaction
    data = core_logic.get_data(force_refresh=True)
    payment_tx = data["TransactionLog"][1]
    assert payment_tx["TransactionType"] == "CREDIT_PAYMENT"
    assert payment_tx["LinkedTransactionID"] == credit_sale_tx["TransactionID"]
    assert payment_tx["QuantityChange"] == 0  # No stock change
    assert payment_tx["TotalRevenue"] == 1.75  # Revenue is now booked

    # 6. Stock should remain unchanged
    assert core_logic.calculate_stock("P101") == -1


def test_void_workflow(setup_test_environment):
    """Test the 'Reversal' (VOID) logic."""
    core_logic.cli_add_product("P101", "Test Item", 1.50)
    core_logic.cli_record_restock("P101", 10, 10.0, "S1")

    # Record a sale
    core_logic.cli_record_sale("P101", 3, "Cash", "S1")
    stock_before_void = core_logic.calculate_stock("P101")
    assert stock_before_void == 7  # 10 - 3

    # Get the ID of the sale
    data = core_logic.get_data(force_refresh=True)
    sale_tx_id = data["TransactionLog"][-1]["TransactionID"]

    # Void the sale
    core_logic.cli_void_transaction(sale_tx_id, "S1", "Test void")

    # Stock should be reversed
    stock_after_void = core_logic.calculate_stock("P101")
    assert stock_after_void == 10

    # Check the VOID transaction
    data = core_logic.get_data(force_refresh=True)
    void_tx = data["TransactionLog"][-1]
    assert void_tx["TransactionType"] == "VOID"
    assert void_tx["LinkedTransactionID"] == sale_tx_id
    assert void_tx["QuantityChange"] == 3  # Reversal of -3
    assert void_tx["TotalRevenue"] == -4.50  # Reversal of 4.50
    assert void_tx["Notes"] == "Test void"

    # Test voiding a void (should fail)
    with pytest.raises(ValueError, match="already been voided"):
        core_logic.cli_void_transaction(sale_tx_id, "S1")
