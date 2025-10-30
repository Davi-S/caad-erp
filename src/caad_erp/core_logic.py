import datetime

from . import data_manager

# --- Data Caching ---
# For a CLI, we can load the data once at the start of the command
# This is a simple cache.
_data_cache = None


def _invalidate_cache() -> None:
    """Clears the in-memory cache so subsequent reads fetch fresh data."""
    global _data_cache
    _data_cache = None


def get_data(force_refresh=False):
    """Loads all data from the Excel file into a cache."""
    global _data_cache
    if _data_cache is None or force_refresh:
        _data_cache = data_manager.get_all_data()
    return _data_cache


# --- Product Functions ---


def get_product_by_id(product_id: str) -> dict | None:
    """Finds a product by its ID."""
    products = get_data().get("Products", [])
    for p in products:
        if p.get("ProductID") == product_id:
            return p
    return None


def get_active_products() -> list[dict]:
    """Returns a list of all products where IsActive is True."""
    products = get_data().get("Products", [])
    return [p for p in products if p.get("IsActive")]


# --- Salesman Functions ---


def get_salesman_by_id(salesman_id: str) -> dict | None:
    """Finds a salesman by their ID."""
    salesmen = get_data().get("Salesmen", [])
    for s in salesmen:
        if s.get("SalesmanID") == salesman_id:
            return s
    return None


def get_active_salesmen() -> list[dict]:
    """Returns a list of all active salesmen."""
    salesmen = get_data().get("Salesmen", [])
    return [s for s in salesmen if s.get("IsActive")]


# --- Transaction & Logic Functions ---


def calculate_stock(product_id: str) -> int:
    """Calculates the current stock for a given ProductID."""
    transactions = get_data().get("TransactionLog", [])
    stock = 0
    for t in transactions:
        if t.get("ProductID") == product_id:
            qty_change = t.get("QuantityChange", 0) or 0
            stock += qty_change
    return stock


def get_transaction_by_id(tx_id: str) -> dict | None:
    """Finds a transaction by its ID."""
    transactions = get_data().get("TransactionLog", [])
    for t in transactions:
        if t.get("TransactionID") == tx_id:
            return t
    return None


def get_unpaid_debts() -> list[dict]:
    """
    Returns a list of all 'SALE' transactions with
    PaymentType 'On Credit' that have not been paid.
    """
    transactions = get_data().get("TransactionLog", [])

    # 1. Find all 'On Credit' sales
    credit_sales = {
        t["TransactionID"]: t
        for t in transactions
        if t.get("TransactionType") == "SALE" and t.get("PaymentType") == "On Credit"
    }

    # 2. Find all 'CREDIT_PAYMENT' transactions
    paid_tx_ids = {
        t["LinkedTransactionID"]
        for t in transactions
        if t.get("TransactionType") == "CREDIT_PAYMENT" and t.get("LinkedTransactionID")
    }

    # 3. Find the difference
    unpaid_tx_ids = set(credit_sales.keys()) - paid_tx_ids

    return [credit_sales[tx_id] for tx_id in unpaid_tx_ids]


def log_transaction(
    tx_type: str,
    product_id: str,
    salesman_id: str,
    payment_type: str = None,
    qty_change: int = 0,
    total_revenue: float = 0.0,
    total_cost: float = 0.0,
    linked_tx_id: str = None,
    notes: str = None,
) -> dict:
    """
    Validates and logs a new transaction.
    This is the primary function for all CLI commands.
    """
    # Validation
    if not get_product_by_id(product_id):
        raise ValueError(f"Invalid ProductID: {product_id}")
    if not get_salesman_by_id(salesman_id):
        raise ValueError(f"Invalid SalesmanID: {salesman_id}")

    tx_data = {
        "TransactionID": data_manager.generate_transaction_id(),
        "Timestamp": datetime.datetime.now(),
        "TransactionType": tx_type,
        "ProductID": product_id,
        "SalesmanID": salesman_id,
        "PaymentType": payment_type,
        "QuantityChange": qty_change,
        "TotalRevenue": total_revenue,
        "TotalCost": total_cost,
        "LinkedTransactionID": linked_tx_id,
        "Notes": notes,
    }

    data_manager.append_transaction(tx_data)
    _invalidate_cache()
    return tx_data


# --- Main CLI Command Functions ---


def cli_add_product(product_id: str, name: str, price: float):
    """Adds a new product."""
    if get_product_by_id(product_id):
        raise ValueError(f"Product ID '{product_id}' already exists.")

    data = {
        "ProductID": product_id,
        "ProductName": name,
        "SellPrice": price,
        "IsActive": True,
    }
    data_manager.add_new_row("Products", data)
    _invalidate_cache()
    print(f"Successfully added product: {name}")


def cli_record_sale(
    product_id: str,
    qty: int,
    payment_type: str,
    salesman_id: str,
    total_revenue: float = None,
):
    """Records a SALE transaction."""
    product = get_product_by_id(product_id)
    if not product:
        raise ValueError(f"Product '{product_id}' not found.")

    if payment_type == "On Credit":
        # Per our logic, credit sales log 0 revenue initially
        revenue = 0.0
    elif total_revenue is not None:
        # Handle manual discount
        revenue = total_revenue
    else:
        # Standard sale
        revenue = (product.get("SellPrice") or 0.0) * qty

    tx = log_transaction(
        tx_type="SALE",
        product_id=product_id,
        salesman_id=salesman_id,
        payment_type=payment_type,
        qty_change=-abs(qty),  # Ensure negative
        total_revenue=revenue,
    )
    print("Sale recorded successfully:")
    print(f"  ID: {tx['TransactionID']}")
    print(
        f"  Item: {product['ProductName']}, Qty: {tx['QuantityChange']}, Total: ${tx['TotalRevenue']:.2f}"
    )


def cli_record_restock(product_id: str, qty: int, total_cost: float, salesman_id: str):
    """Records a RESTOCK transaction."""
    product = get_product_by_id(product_id)
    if not product:
        raise ValueError(f"Product '{product_id}' not found.")

    tx = log_transaction(
        tx_type="RESTOCK",
        product_id=product_id,
        salesman_id=salesman_id,
        qty_change=abs(qty),  # Ensure positive
        total_cost=-abs(total_cost),  # Ensure negative
    )
    print("Restock recorded successfully:")
    print(f"  ID: {tx['TransactionID']}")
    print(
        f"  Item: {product['ProductName']}, Qty: {tx['QuantityChange']}, Cost: ${abs(tx['TotalCost']):.2f}"
    )


def cli_record_writeoff(product_id: str, qty: int, salesman_id: str, notes: str = None):
    """Records a WRITE_OFF transaction."""
    product = get_product_by_id(product_id)
    if not product:
        raise ValueError(f"Product '{product_id}' not found.")

    tx = log_transaction(
        tx_type="WRITE_OFF",
        product_id=product_id,
        salesman_id=salesman_id,
        qty_change=-abs(qty),  # Ensure negative
        notes=notes,
    )
    print("Write-off recorded successfully:")
    print(f"  ID: {tx['TransactionID']}")
    print(f"  Item: {product['ProductName']}, Qty: {tx['QuantityChange']}")


def cli_pay_debt(transaction_id: str, payment_type: str, salesman_id: str):
    """Records a CREDIT_PAYMENT against an 'On Credit' SALE."""
    unpaid_debts = get_unpaid_debts()

    debt_to_pay = None
    for debt in unpaid_debts:
        if debt["TransactionID"] == transaction_id:
            debt_to_pay = debt
            break

    if not debt_to_pay:
        raise ValueError(f"No unpaid debt found with ID: {transaction_id}")

    # Get the original product to find its current sell price
    product = get_product_by_id(debt_to_pay["ProductID"])
    if not product:
        # This should not happen, but good to check
        raise ValueError(f"Original product {debt_to_pay['ProductID']} not found!")

    revenue_to_log = product.get("SellPrice") or 0.0

    tx = log_transaction(
        tx_type="CREDIT_PAYMENT",
        product_id=debt_to_pay["ProductID"],
        salesman_id=salesman_id,  # Logged by the person paying
        payment_type=payment_type,
        total_revenue=revenue_to_log,
        linked_tx_id=transaction_id,
        notes=f"Payment for {transaction_id}",
    )
    print("Debt paid successfully:")
    print(f"  ID: {tx['TransactionID']}")
    print(f"  Original Sale ID: {tx['LinkedTransactionID']}")
    print(f"  Amount: ${tx['TotalRevenue']:.2f}")


def cli_void_transaction(transaction_id: str, salesman_id: str, notes: str = None):
    """
    Voids a transaction using the 'Reversal and Re-entry' model.
    For a CLI, this is complex. A simpler 'Reversal-only' VOID is safer for V1.
    Let's implement the simpler VOID-only logic.
    The user must manually re-enter the correct transaction.
    """
    original_tx = get_transaction_by_id(transaction_id)
    if not original_tx:
        raise ValueError(f"Transaction not found: {transaction_id}")

    # Check if already voided
    transactions = get_data().get("TransactionLog", [])
    for t in transactions:
        if (
            t.get("TransactionType") == "VOID"
            and t.get("LinkedTransactionID") == transaction_id
        ):
            raise ValueError(f"Transaction {transaction_id} has already been voided.")

    # Create the perfect reversal
    tx = log_transaction(
        tx_type="VOID",
        product_id=original_tx["ProductID"],
        salesman_id=salesman_id,  # Person performing the void
        payment_type=original_tx.get("PaymentType"),
        qty_change=-(original_tx.get("QuantityChange") or 0),
        total_revenue=-(original_tx.get("TotalRevenue") or 0),
        total_cost=-(original_tx.get("TotalCost") or 0),
        linked_tx_id=transaction_id,
        notes=notes or f"Voiding transaction {transaction_id}",
    )
    print(f"Transaction {transaction_id} voided successfully.")
    print(f"  Voiding TX ID: {tx['TransactionID']}")
    print("  Stock and revenue have been reversed.")
    print("  You must now manually re-enter the correct transaction if needed.")


def cli_show_stock():
    """Calculates and prints current stock for all active products."""
    print("--- Current Stock Report ---")
    active_products = get_active_products()
    if not active_products:
        print("No active products found.")
        return

    for product in active_products:
        pid = product["ProductID"]
        name = product["ProductName"]
        stock = calculate_stock(pid)
        print(f"  {pid:<10} | {name:<25} | Stock: {stock}")
