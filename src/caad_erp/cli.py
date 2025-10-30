import argparse
import sys

from . import core_logic
from . import data_manager


def main():
    parser = argparse.ArgumentParser(description="Lounge ERP Backend CLI")
    parser.add_argument(
        "-s",
        "--salesman",
        help="Salesman ID for the transaction.",
        default=data_manager.DEFAULT_SALESMAN_ID,
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # --- 'sale' command ---
    sale_parser = subparsers.add_parser("sale", help="Record a new sale.")
    sale_parser.add_argument("product_id", help="The ProductID to sell (e.g., P1001)")
    sale_parser.add_argument("quantity", type=int, help="The number of items sold.")
    sale_parser.add_argument(
        "payment_type",
        choices=["Cash", "Card", "On Credit"],
        help="The payment method.",
    )
    sale_parser.add_argument(
        "--price", type=float, help="Override the total revenue (for discounts)."
    )

    # --- 'restock' command ---
    restock_parser = subparsers.add_parser("restock", help="Record a restock.")
    restock_parser.add_argument("product_id", help="The ProductID to restock.")
    restock_parser.add_argument(
        "quantity", type=int, help="The number of items bought."
    )
    restock_parser.add_argument(
        "total_cost", type=float, help="The total cost for this batch (e.g., 22.50)."
    )

    # --- 'writeoff' command ---
    writeoff_parser = subparsers.add_parser(
        "writeoff", help="Write off spoiled or lost stock."
    )
    writeoff_parser.add_argument("product_id", help="The ProductID to write off.")
    writeoff_parser.add_argument(
        "quantity", type=int, help="The number of items to write off."
    )
    writeoff_parser.add_argument("--notes", help="Reason for the write-off.")

    # --- 'addproduct' command ---
    add_parser = subparsers.add_parser(
        "addproduct", help="Add a new product to the catalog."
    )
    add_parser.add_argument(
        "product_id", help="The new unique ProductID (e.g., P1002)."
    )
    add_parser.add_argument("name", help="The product's name (e.g., 'Coke Zero').")
    add_parser.add_argument("price", type=float, help="The selling price (e.g., 1.50).")

    # --- 'stock' command ---
    stock_parser = subparsers.add_parser(
        "stock", help="Show current stock for all active products."
    )

    # --- 'debts' command ---
    debt_parser = subparsers.add_parser(
        "debts", help="Show all unpaid 'On Credit' sales."
    )

    # --- 'paydebt' command ---
    pay_parser = subparsers.add_parser(
        "paydebt", help="Pay an outstanding 'On Credit' sale."
    )
    pay_parser.add_argument(
        "transaction_id", help="The TransactionID of the original 'On Credit' sale."
    )
    pay_parser.add_argument(
        "payment_type", choices=["Cash", "Card"], help="The payment method."
    )

    # --- 'void' command ---
    void_parser = subparsers.add_parser(
        "void", help="Void (reverse) a past transaction."
    )
    void_parser.add_argument(
        "transaction_id", help="The TransactionID of the transaction to void."
    )
    void_parser.add_argument("--notes", help="Reason for the void.")

    args = parser.parse_args()

    # --- Command Handling ---
    try:
        # We refresh data on every command to get the latest info
        core_logic.get_data(force_refresh=True)

        if args.command == "sale":
            core_logic.cli_record_sale(
                args.product_id,
                args.quantity,
                args.payment_type,
                args.salesman,
                args.price,
            )

        elif args.command == "restock":
            core_logic.cli_record_restock(
                args.product_id, args.quantity, args.total_cost, args.salesman
            )

        elif args.command == "writeoff":
            core_logic.cli_record_writeoff(
                args.product_id, args.quantity, args.salesman, args.notes
            )

        elif args.command == "addproduct":
            core_logic.cli_add_product(args.product_id, args.name, args.price)

        elif args.command == "stock":
            core_logic.cli_show_stock()

        elif args.command == "debts":
            print("--- Unpaid Debts Report ---")
            debts = core_logic.get_unpaid_debts()
            if not debts:
                print("No unpaid debts found.")
            else:
                salesmen = {
                    s["SalesmanID"]: s["ProductName"]
                    for s in core_logic.get_active_salesmen()
                }
                products = {
                    p["ProductID"]: p["ProductName"]
                    for p in core_logic.get_data()["Products"]
                }

                for debt in debts:
                    pid = debt["ProductID"]
                    sid = debt["SalesmanID"]
                    product_name = products.get(pid, "Unknown Product")
                    salesman_name = salesmen.get(sid, "Unknown Salesman")
                    print(f"  ID: {debt['TransactionID']}")
                    print(f"    Date: {debt['Timestamp'].strftime('%Y-%m-%d')}")
                    print(f"    By: {salesman_name} ({sid})")
                    print(
                        f"    Item: {product_name} ({pid}), Qty: {abs(debt['QuantityChange'])}"
                    )
                    print("-" * 20)

        elif args.command == "paydebt":
            core_logic.cli_pay_debt(
                args.transaction_id, args.payment_type, args.salesman
            )

        elif args.command == "void":
            core_logic.cli_void_transaction(
                args.transaction_id, args.salesman, args.notes
            )

    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        print("Please run 'python setup_excel.py' first.", file=sys.stderr)
        sys.exit(1)
    except (ValueError, KeyError, Exception) as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
