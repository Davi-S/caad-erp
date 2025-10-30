import configparser
import os
import sys
import openpyxl
from openpyxl.styles import Font

# Define the schema exactly as specified in the architecture
SHEET_COLUMNS = {
    "Products": [
        "ProductID", "ProductName", "SellPrice", "IsActive"
    ],
    "Salesmen": [
        "SalesmanID", "SalesmanName", "IsActive"
    ],
    "TransactionLog": [
        "TransactionID", "Timestamp", "TransactionType", "ProductID", "SalesmanID",
        "PaymentType", "QuantityChange", "TotalRevenue", "TotalCost",
        "LinkedTransactionID", "Notes"
    ]
}

# Define the default salesman
DEFAULT_SALESMAN = {
    "SalesmanID": "GRR00000000",
    "SalesmanName": "Lounge Sale",
    "IsActive": True
}

CONFIG_FILE = 'config.ini'

def main():
    """
    Main function to create and initialize the Excel data file.
    """
    print("--- Lounge ERP Setup Script ---")

    # 1. Read the configuration file
    if not os.path.exists(CONFIG_FILE):
        print(f"\n[ERROR] Configuration file '{CONFIG_FILE}' not found.")
        print("Please create it based on the architecture document before running setup.")
        sys.exit(1)
        
    config = configparser.ConfigParser()
    config.read(CONFIG_FILE)

    try:
        data_file_path = config.get('System', 'DataFile')
        default_salesman_id = config.get('Defaults', 'DefaultSalesman')
    except (configparser.NoSectionError, configparser.NoOptionError) as e:
        print(f"\n[ERROR] Your '{CONFIG_FILE}' is missing a required section or key.")
        print(f"Details: {e}")
        sys.exit(1)

    print(f"Target data file: '{data_file_path}'")

    # 2. Check if the data file already exists
    if os.path.exists(data_file_path):
        print(f"[ERROR] The file '{data_file_path}' already exists.")
        print("To prevent data loss, setup will not continue.")
        print("If you want to start over, please delete the file manually and re-run this script.")
        sys.exit(1)

    # 3. Create the new Excel Workbook
    try:
        wb = openpyxl.Workbook()
        
        # Remove the default "Sheet"
        if "Sheet" in wb.sheetnames:
            del wb["Sheet"]
            
        bold_font = Font(bold=True)

        # 4. Create each sheet and write the headers
        for sheet_name, columns in SHEET_COLUMNS.items():
            ws = wb.create_sheet(title=sheet_name)
            print(f"Creating sheet: '{sheet_name}'...")
            
            for col_idx, column_name in enumerate(columns, 1):
                cell = ws.cell(row=1, column=col_idx)
                cell.value = column_name
                cell.font = bold_font
        
        # 5. Add the default salesman
        print(f"Adding default salesman (ID: '{default_salesman_id}')...")
        ws_salesmen = wb["Salesmen"]
        
        # Use the ID from the config file, but the data from our constant
        default_data_row = DEFAULT_SALESMAN.copy()
        default_data_row["SalesmanID"] = default_salesman_id
        
        # Append the values in the correct column order
        ws_salesmen.append([
            default_data_row["SalesmanID"],
            default_data_row["SalesmanName"],
            default_data_row["IsActive"]
        ])

        # 6. Save the file
        wb.save(data_file_path)
        print(f"\n[SUCCESS] Successfully created '{data_file_path}'.")
        print("You can now start testing the application.")

    except (PermissionError, IOError) as e:
        print(f"\n[ERROR] Could not write the file '{data_file_path}'.")
        print(f"Please check your permissions in this directory.")
        print(f"Details: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] An unexpected error occurred.")
        print(f"Details: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

