# User and System Workflows

This document outlines all operational workflows, use cases, and business
procedures in CAAD ERP. It explains how each feature functions, the underlying
financial and inventory rules, and practical guidance for operating the system.

---

## Point of Sale (POS) and Checkout

### Standard Immediate Payment Checkout

Immediate sales cover transactions where payment is collected at checkout via
Cash, PIX QR code, or other payment methods. Recording a sale appends a `SALE`
entry to the transaction ledger, immediately deducting the sold quantity from
on-hand stock and logging the collected gross revenue.

### Discounts and Custom Price Overrides

Lounge operators can offer discounts or custom prices during immediate-payment
checkouts without altering default catalog prices. The system accepts custom
revenue values during checkout, recording the exact amount collected on the
transaction record.

## Credit Tabs and Debt Management

### Opening a Credit Tab

Credit sales allow trusted customers to take items to be paid back later. A
credit sale is logged as a `SALE` transaction with `paymentType = "OnCredit"`
and strictly zero initial revenue (`totalRevenue = 0`). Inventory is deducted
immediately upon checkout, while revenue recognition is deferred until cash or
electronic payments are collected.

### Settling Credit Debts (Credit Payments)

Customer payments toward outstanding credit tabs are recorded via
`CREDIT_PAYMENT` transactions. Each payment references the originating credit
sale ID, recognizing revenue upon receiving cash, PIX, or other funds.

To log a debt payment, navigate to the Credit Tab management view, select the
customer's open tab, specify the payment amount and method, and confirm the
transaction.

### Partial Payments and Overpayments

Customers can settle credit tabs over multiple partial payments or pay extra to
cover interest or late fees. The system accepts multiple `CREDIT_PAYMENT`
entries referencing the same credit sale, automatically summing non-voided
payments to calculate the remaining balance.

---

## Inventory and Stock Management

### Restocking Inventory and Purchase Costs

Restocking logs new inventory additions via `RESTOCK` transactions. Each restock
increases available stock and records the total purchase expense as a negative
monetary value in the ledger.

### Zero-Cost Restocks (Donations and Promotional Items)

Items received for free, such as alumni donations, event sponsorships, or vendor
samples, can be restocked with zero cost (`totalCost = 0`). Zero-cost restocks
increase available inventory without incurring lounge expense, allowing 100% of
future sales revenue from donated items to flow into net profit.

### Inventory Write-Offs (Spoilage, Damage, Loss, and Event Donations)

Stock that leaves inventory without generating revenue, such as expired items,
damaged goods, lost stock, or items donated to student event, is recorded using
`WRITE_OFF` transactions. Write-offs reduce on-hand inventory while setting both
revenue and cost to zero.

---

## Reversals and Administrative Operations

### Reversing Transactions (Void Workflow)

Errors are corrected without altering historical logs by appending a `VOID`
transaction. A void entry references the target transaction ID and negates its
quantity, revenue, and cost deltas. To prevent infinite loops, void entries
themselves cannot be voided.

### Product and Salesman Management (Soft-Deletes)

Catalog items and salespeople can be created, updated, or deactivated. Removing
a product or salesman performs a soft-delete by setting `isActive = false`.
Soft-deleted entities vanish from active POS selection screens but remain intact
in the database so historical transaction reports continue to display correct
names and financial totals.

To manage entities, use the Product or Salesman screens to add new entries or
toggle active status.

### Catalog Price Updates and Credit Tab Operational Caveat

Updating a product's default catalog `sellPrice` changes the suggested price for
future POS checkouts without altering past ledger records.

However, because outstanding debt analytics evaluate open credit tabs using the
_current_ catalog price, increasing a product's catalog price while credit tabs
are pending will increase the computed debt balance. To prevent phantom debt
balances, lounge managers should ensure open credit tabs are settled before
updating product catalog prices.
