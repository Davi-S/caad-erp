# CAAD ERP

> Excel-backed inventory, sales tracker, and web point-of-sale system for
> student lounges.

![Web UI Home Page](./frontend/images/caad-erp-frontend-home-page.png)
![Excel Dashboard Sheet](./backend/images/dashboard.png)

## Motivation

When managing inventory, sales, and tab debts, student lounges had to rely on
over-engineered commercial POS systems or fragile spreadsheet setups.

To solve this, **CAAD ERP** provides a lightweight, highly responsive inventory
and sales management system specifically tailored for student lounge operations.

---

## Key Features

### Web Application (Frontend)

- **Point of Sale (POS):** Interactive cart and checkout flow, salesman
  selection screen, and payment confirmation via Cash, PIX QR code (Mercado
  Pago), or Other payment methods.
- **Discounts:** Apply percentage or fixed-amount discounts to an entire cart or
  specific items.
- **Customer Display Mode:** Dedicated customer-facing display view for
  real-time checkout transparency.
- **Product Management:** Tools to add, edit, or toggle active status of items
  in the catalog.
- **Salesmen Management:** Register, update, and manage salespeople.
- **Stock Management:** Direct control over inventory levels with restock and
  write-off modal workflows.
- **System Settings:** UI-driven configuration.
- **Dark Mode:** Full light/dark/system color scheme support, persisted per
  browser. You will need to find out the key to change it ;) good luck.

### Backend and Core Ledger

- **Append-only Transaction Ledger:** SQLite-backed immutable transaction log
  providing a complete, auditable history of all sales, restocks, write-offs,
  credit payments, and reversals.
- **Excel Support:** Non-technical managers do not need to learn SQL or rely on
  an admin dashboard. They can open the Excel workbook directly using software
  they already know to audit everything.

---

## Installation and Running the application

### Prerequisites

- **Node.js 18+** and `npm`

---

### Manual Installation

#### 1. Clone and Install Workspace Dependencies

```bash
git clone https://github.com/Davi-S/caad-erp.git
cd caad-erp

# Install and link all npm workspace dependencies (backend and frontend)
npm install
```

---

### Running the application

To build and run the full application in production mode:

```bash
# Start unified server
npm run start
```

---

## Contributing and Documentation

Please check the following documentation resources:

- [Developer Guide](./docs/DEVELOPER_GUIDE.md)
- [Workflows](./docs/WORKFLOWS.md)
- [User Guide](./docs/USER_GUIDE.md)
