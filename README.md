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
