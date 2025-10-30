# CAAD ERP

## Project Architecture & Guiding Principles

### Student Lounge ERP System

#### 1. Project Overview

The objective of this project is to build a simple, robust, and maintainable "Enterprise Resource Planning" (ERP) system for the student lounge. The system will primarily manage product inventory, sales transactions, and provide data for analysis.

#### 2. Guiding Principles & Constraints

1. **Maintainability is the Priority:** The system *must* be easily understood and transferable to new, non-technical student managers. Simplicity and transparency are valued over technical performance.

2. **Single-User Access:** The system will be used by one person at a time on a single computer. Concurrency (multiple simultaneous users) is not a design concern.

3. **Low Transaction Volume:** The system will handle hundreds of transactions per month, not thousands per second. Scalability is not a primary driver of design.

4. **Python-Centric:** The core logic will be implemented in Python.

5. **User Familiarity with Excel:** The system must integrate with Microsoft Excel, as it is the tool users will know and use for data analysis.

6. **Inventory-Centric:** The system is focused purely on inventory and sales. Cash-only events are *only* permitted when directly linked to a prior inventory transaction (i.e., paying for a credit sale).

#### 3. Core Architectural Decisions

##### 3.1. Data Storage: Excel-as-Storage (not a Database)

- **Decision:** The system's "source of truth" will be stored in a single Microsoft Excel (`.xlsx`) file.

- **Rationale:** This model is chosen for maximum maintainability. It avoids the need for database maintenance, custom drivers, or special knowledge.

##### 3.2. Core Logic: The "Transaction Log" Principle

- **Decision:** The system will be built on an **append-only Transaction Log**. This log will be the single, immutable source of truth for all inventory and sales data.

- **Rationale:** This is the project's key to robustness.

  - **Audit Trail:** It provides a complete history of every event.

  - **Integrity:** Data is never deleted or overwritten.

- **Core Transaction Types:** The log is built on a minimal set of inventory-focused actions: `OPEN_STOCK`, `SALE`, `RESTOCK`, `WRITE_OFF`, `CREDIT_PAYMENT`, and **`VOID`**.

##### 3.3. Data Access Model: Segregation of Read/Write

- **WRITE Access (Locked):**

  - The "master" Excel file will be protected, and users will **not** interact with it directly.

  - A **User Interface** (see 4.2) will be the *only* gateway for writing new data.

- **READ Access (Open):**

  - Users will get data for analysis via an **"Export" function** in the UI.

  - This function will read the master file and generate a **new, unprotected Excel copy**.

  - **Smart Report:** This exported file will be a "smart report" containing:

        1. A pre-formatted `Summary` sheet with key metrics calculated using **live Excel formulas**.

        2. Sheets containing the raw `TransactionLog`, `Products`, and `Salesmen` data for power-users.

##### 3.4. Long-Term Management: Archiving

- **Decision:** At the end of a defined period, a Python script will be run.

- **Action:** This script will:

    1. Calculate the final inventory state from the old Transaction Log.

    2. Create a new, blank master file for the new period.

    3. Populate the new file with `OPEN_STOCK` transactions, one for each product that has a non-zero stock level.

    4. Copy over the `Products` and `Salesmen` sheets, automatically pruning (deleting) any product or salesman where **`IsActive` is `FALSE`** ***and*** **their calculated stock/sale history is zero.**

    5. The old file will be renamed.

#### 4. High-Level System Components

##### 4.1. Data Storage ("Backend")

The backend consists of two distinct parts:

- **a) The Data File:** A single protected `.xlsx` file.

  - **`Products` Sheet:** Acts as a "Sales Catalog," storing `ProductID`, `ProductName`, `SellPrice`, and `IsActive`.

  - **`Salesmen` Sheet:** Stores `SalesmanID`, `SalesmanName`, `IsActive`.

  - **`TransactionLog` Sheet:** Stores all transactions. Every row *must* be linked to a valid `ProductID`.

- **b) The Config File:** A plain-text file.

  - Contains application-level settings like `SchemaVersion` or `LoungeName`.

##### 4.2. User Interface ("Frontend") - TBD

- **Status: To Be Decided.**

- This component will provide the user-friendly "front door" for all data-writing operations.

##### 4.3. Business Logic (Python)

- A set of Python scripts and libraries that sit between the UI and the Data Storage.

- Responsible for all logic, including:

  - **Discount Handling:** The UI will permit the user to **edit the `TotalRevenue` field** when making a sale. The value logged is the *actual revenue collected*, which robustly handles discounts.

  - **Restock Logic:** The `RESTOCK` transaction type handles both paid and donated inventory. The UI will prompt for `Quantity` and `Total Cost`, logging `0.00` as the cost for donated items.

  - **"Sell on Credit" Logic:** This is handled by a two-event process.

        1. **Event 1 (Credit Sale):** A `SALE` transaction is logged with `PaymentType: "On Credit"`, `QtyChange: -1`, and `TotalRevenue: 0.00`.

        2. **Event 2 (Payment):** The UI logs a new **`CREDIT_PAYMENT`** transaction. This transaction has `QtyChange: 0`, the correct `TotalRevenue` (e.g., `1.50`), and uses the `LinkedTransactionID` to point to the original `SALE`.

    - This maintains a perfect audit trail and keeps the system inventory-centric.

  - **Correcting an Error (Voiding):** This is handled by a **"Reversal and Re-entry"** method.

        1. The user finds the incorrect transaction in the UI and indicates they want to "Fix" it.

        2. The UI presents the *correct* data

        3. When submitted, the Python logic *automatically* appends **two** new transactions:

            - A **`VOID`** transaction that is a *perfect mathematical reversal* of the original error. It uses `LinkedTransactionID` to point to the error.

            - A new transaction with the correct data.

    - This maintains a perfect audit trail where the `SUM()` of the log is always the correct, current state.

##### 4.4. Analysis Environment (Excel)

- This is not part of the core application.

- It consists of the user's local Microsoft Excel instance, which they use to analyze the exported data copies.


## Lounge ERP: Developer Onboarding & Project Internals

### 1. Project Overview & Core Philosophy

#### What Are We Building?

We are building a simple, robust, and maintainable **Enterprise Resource Planning (ERP)** system for a student lounge. The system's primary goal is to manage:

1. **Inventory:** What snacks do we have?
    
2. **Sales:** What did we sell?
    
3. **Reporting:** How much profit did we make?

#### Who Is It For?

The system is for a student-run organization. This has critical implications for our design:

- **Maintainers** (like us) are developers who can manage the code.
    
- **End-Users** are non-technical student managers who will use the system.
    
- **Turnover** is high, so the system must be simple to pass on.

#### Our Guiding Principles

Every decision in this document is based on these three principles:

1. **Robustness & Integrity:** The system must never "lie." The data must be trustworthy, even if users make mistakes.
    
2. **Ease of Analysis:** The system's primary output is for non-technical users to open a report in **Microsoft Excel** and easily understand it using basic tools (SUM, filters, Pivot Tables). Clarity in the data is more important than code "elegance."
    
3. **Maintainability:** The codebase must be clean, modular, testable, and well-documented so a new developer can understand it quickly.

### 2. System Architecture: The "Immutable Log"

#### The Core Problem: "Excel as a Database"

The lounge managers need to use Excel. The simplest idea is to use an Excel file as our database.

- **Problem:** This is extremely fragile. If you have a `Products` sheet with `CurrentStock` and a `Sales` sheet, what happens when a user deletes a `Sales` row by mistake? The `CurrentStock` is now wrong forever. The data is corrupted.

#### Our Solution: The `TransactionLog` as the "Source of Truth"

We solve this by borrowing a core concept from accounting: an **immutable, append-only ledger**.

- **How it works:** We have a sheet called `TransactionLog`. This is the *only* "truth" in our system.
    
- We **never** delete or edit a row in this log.
    
- A "sale" is just a new row *appended* to the log.
    
- A "mistake" is fixed by appending *new* transactions that reverse the old one (see `VOID` logic below).

The `CurrentStock` is not a value we *store* in a cell; it is a value we *calculate* at any time by simply summing all the `QuantityChange` columns for that product in the entire `TransactionLog`.

**`SUM(TransactionLog)` = The Truth**

This model is incredibly robust. It's impossible to "corrupt" the stock level because the entire history of every item is preserved.

### 3. The Data Model (The "Backend")

Our "database" consists of two files, which live in the project's root directory.

#### 3.1. File: `config.ini`

This is a user-editable configuration file. It tells the application where to find its data. It is **kept out of the `src` directory** because it is user-specific and should not be overwritten on a package update.

- `[System]`
    
    - `DataFile`: The path to the Excel file (e.g., `lounge_master_data.xlsx`).
        
    - `SchemaVersion`: Used by the app to check for compatibility.
        
- `[Defaults]`
    
    - `DefaultSalesman`: The `SalesmanID` to use if one isn't specified.

#### 3.2. File: `lounge_master_data.xlsx`

This is the "database." It is "locked" and should **only** be accessed by the Python application. Users will *never* touch this file directly. They will get "Smart Reports" exported from it.

It contains three sheets:

##### Sheet 1: `Products`

This is the "Sales Catalog" of items we sell.

- `ProductID`: A unique, permanent ID (e.g., `P1001`).
    
- `ProductName`: The human-readable name (e.g., "Snickers").
    
- `SellPrice`: The *default* selling price. This is just a suggestion for the UI.
    
- `IsActive`: A boolean (`TRUE`/`FALSE`). We use this to "soft delete" products. When set to `FALSE`, the product no longer appears in the UI, but its historical data is preserved.

##### Sheet 2: `Salesmen`

A list of all users who can make sales.

- `SalesmanID`: A unique ID (e.g., `S1`).
    
- `SalesmanName`: The user's name (e.g., "Davi").
    
- `IsActive`: `TRUE`/`FALSE`. Used to "soft delete" users.

##### Sheet 3: `TransactionLog`

This is the heart of the system. It is an **append-only** log of every event.

- `TransactionID`: A unique ID for this event (e.g., `T20251029...`).
    
- `Timestamp`: When the event happened.
    
- `TransactionType`: The "verb" of the event. (See section 4.1).
    
- `ProductID`: Links to the `Products` sheet.
    
- `SalesmanID`: Links to the `Salesmen` sheet.
    
- `PaymentType`: How it was paid (e.g., "Cash", "Card", "On Credit").
    
- `QuantityChange`: The change in stock (e.g., `-1` for a sale, `+20` for a restock).
    
- **`TotalRevenue`**: This is a critical column. It tracks **money coming IN**. For a `SALE`, it's the *actual* amount the customer paid (which handles discounts).
    
- **`TotalCost`**: The other critical column. It tracks **money going OUT** for inventory. It's only used for `RESTOCK` transactions (e.g., `-22.00`).
    
- `LinkedTransactionID`: Used *only* by `VOID` and `CREDIT_PAYMENT` to link back to the original transaction they are related to.
    
- `Notes`: An optional field for comments.

#### 3.3. Key Design Decision: `TotalRevenue` vs. `TotalCost`

We intentionally use two separate columns for money (instead of one `Amount` column) to make analysis *vastly* simpler for the end-user in Excel.

- To get total sales: `=SUM(TotalRevenue)`
    
- To get total cost of stock: `=SUM(TotalCost)`
    
- To get total profit: `=SUM(TotalRevenue) + SUM(TotalCost)`

This is explicit and far less error-prone for a non-technical user than a single `Amount` column, which would require complex `SUMIFS` formulas.

### 4. Core Business Logic (The "Rules")

This is how we handle real-world events.

#### 4.1. The 6 Core Transaction Types

1. **`OPEN_STOCK`**: A special type created *only* by the archive script. It sets the starting inventory (`+Qty`) and value (`+Revenue`) for a new period.
    
2. **`SALE`**: A normal sale. (`-Qty`, `+Revenue`).
    
3. **`RESTOCK`**: Buying new inventory. (`+Qty`, `-Cost`). This *also* handles product donations if `TotalCost` is `0.00`.
    
4. **`WRITE_OFF`**: Removing stock for non-sale reasons (spoilage, theft). (`-Qty`, `0` Revenue/Cost).
    
5. **`CREDIT_PAYMENT`**: A "cash-only" event that logs the payment of a previous "On Credit" sale. (`0 Qty`, `+Revenue`).
    
6. **`VOID`**: A special transaction that perfectly reverses a previous transaction, used for fixing errors.

#### 4.2. How "Smart" Workflows are Handled

##### How Discounts Work

This is handled naturally. The UI suggests the `SellPrice` from the `Products` sheet, but the user can **edit the `TotalRevenue` field** before finalizing the sale. The `TransactionLog` simply records the *actual* revenue received.

##### How "Sell on Credit" Works (2 Events)

This is our most complex workflow.

- Event 1: The "Sale"

    A new SALE transaction is created, but with two special properties:
    
    - `PaymentType`: "On Credit"
        
    - `TotalRevenue`: **`0.00`**
        
    - *Result:* Inventory is correctly reduced, but no money is logged.
        
- Event 2: The "Payment"

    When the seller pays their debt, a new transaction is created:
    
    - `TransactionType`: **`CREDIT_PAYMENT`**
        
    - `LinkedTransactionID`: The ID of the original `SALE` transaction.
        
    - `QuantityChange`: **`0`** (this is a cash-only event)
        
    - `TotalRevenue`: **`1.50`** (the cash received)
        
    - *Result:* Cash is now correct, and the debt is "closed" by the link.

##### How Errors are Handled ("Reversal and Re-entry")

We **never** edit or delete. When a user wants to "fix" a mistake, the system performs a **Reversal and Re-entry**.

- **Example:** A `SALE` (`T1001`) was for `-3` Snickers, but should have been `-1`.
    
- The user clicks `[Fix]` on `T1001` in the UI and re-enters the correct data.
    
- The application *automatically* creates **two** new transactions:

1. **The `VOID` (Reversal):**
    
    - `TransactionType`: **`VOID`**
        
    - `LinkedTransactionID`: `T1001`
        
    - `QuantityChange`: **`+3`** (perfectly reverses `T1001`)
        
    - `TotalRevenue`: (perfectly reverses `T1001`'s revenue)
        
2. **The `SALE` (Re-entry):**
    
    - `TransactionType`: **`SALE`**
        
    - `QuantityChange`: **`-1`** (the correct value)
        
    - `TotalRevenue`: (the correct value)

- **Result:** The `SUM()` of the log is now 100% correct, and we have a full audit trail of the error and its correction.

### 5. Codebase & Development

#### 5.1. Project Structure (The `src` Layout)

We use a `src` layout to prevent import ambiguity and ensure our tests run against the *installed* package, not the local folder.

```
caad_erp/                 <-- Project Root
├── src/
│   └── lounge_erp/       <-- The Python package
│       ├── __init__.py   # Handles logger setup
│       ├── data_manager.py
│       └── core_logic.py
├── tests/                <-- The test suite
├── setup_excel.py        <-- One-time setup utility
├── config.ini            <-- User-specific config
├── pyproject.toml
└── README.md
```

#### 5.2. The 3-Layer Architecture

1. **Data Access Layer (DAL): `data_manager.py`**
    
    - This is the "hands." Its *only* job is to read and write to the Excel file. It imports `openpyxl`. It has no business logic.
        
    - Functions: `get_all_data()`, `append_transaction()`, `update_row()`.
        
2. **Business Logic Layer (BLL): `core_logic.py`**
    
    - This is the "brain." It contains all the rules. It imports `data_manager.py`. It has no idea if it's being called by a test, a CLI, or a web app.
        
    - Functions: `process_sale()`, `process_credit_payment()`, `process_void()`, `get_unpaid_debts()`, `calculate_stock()`.
        
3. **Presentation Layer (UI): (Not built yet)**
    
    - This is the "face" (e.g., a future `cli.py` or `app.py`). It will be a thin "wrapper" that imports `core_logic.py` and calls its functions.

#### 5.3. Development Workflow & Standards

- **Test-Driven Development (TDD):** We do not build a UI first. We build the logic in `core_logic.py` and write `pytest` tests in the `tests/` directory to *prove* it works. Our test suite is our first "user interface."
    
- **Logging:** We use Python's built-in `logging` module, configured in `src/lounge_erp/__init__.py`. All modules get their own logger (`log = logging.getLogger(__name__)`).
    
- **Docstrings:** We use **Google-style** docstrings for all functions to ensure clean, readable, and auto-generatable documentation.
