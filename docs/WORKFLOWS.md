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

### Discounts, Promotional Items, and Zero-Revenue Sales

Lounge operators can offer discounts, promotional items, or custom prices during
immediate-payment checkouts without altering default catalog prices. The system
accepts custom revenue values and discounts during checkout, recording the exact
amount collected on the transaction record.

Zero-revenue `SALE` transactions (`totalRevenue = 0`) are officially supported
for customer-facing distributions, such as:

- **100% Promotional Discounts:** Promotional giveaways (e.g. _Buy 6 Monster
  drinks, get a free Pin_).
- **Courtesy Items and Freebies:** Welcome freebies for new students, event
  giveaways, and raffle prizes.

Recording these distributions as `SALE` transactions ensures that **product
consumption velocity and student demand** are accurately captured in metrics,
rather than misrepresenting promotional distributions as operational losses.

---

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

### Inventory Write-Offs (Spoilage, Breakage, Damage, and Shrinkage)

Stock that leaves inventory due to **internal operational loss**—such as expired
items, broken or damaged goods, lost stock, or supply shrinkage—is recorded
using `WRITE_OFF` transactions. Write-offs reduce on-hand inventory while
setting both revenue and cost to zero.

Write-offs are strictly for back-office losses without customer interaction. Any
stock distributed to students or customers (such as freebies, raffle prizes, or
event promotions) must be processed through the Point of Sale as a `SALE`
transaction with zero revenue rather than a write-off.

---

## Reversals and Administrative Operations

### Reversing Transactions (Void Workflow)

Errors are corrected without altering historical logs by appending a `VOID`
transaction. A void entry references the target transaction ID and negates its
quantity, revenue, and cost deltas. To prevent infinite loops, void entries
themselves cannot be voided.

### Product and Salesman Management

Catalog items and salespeople can be registered, updated, or deactivated through
their respective management views. Creating new products requires specifying a
product name and default selling price, while new salespeople require specifying
a name.

### Soft-Deletes vs. Hard-Deletes

Data removal in CAAD ERP distinguishes between soft-deletes (deactivation) and
hard-deletes (physical database row deletion) to preserve historical financial
integrity.

When a product or salesman is "deleted" in the management interface, the system
performs a **soft-delete** by setting `isActive = false`. Soft-deleted items
immediately vanish from active Point-of-Sale checkouts, inventory restock forms,
and selection menus so new transactions cannot be recorded against them.
However, their rows remain safely stored in the database. This guarantees that
past transaction ledger records referencing those products or salespeople can
still resolve names, historical prices, and profit calculations accurately
without producing orphaned records or corrupted reports.

**Hard-deletes**, physically deleting rows from database tables, are
intentionally avoided during standard operations. Physically removing a catalog
row causes historical transaction ledger entries to become orphaned, leading to
report errors and audit trail corruption.

### Catalog Price Updates and Credit Tab Operational Caveat

Updating a product's default catalog `sellPrice` changes the suggested price for
future POS checkouts without altering past ledger records.

However, because outstanding debt analytics evaluate open credit tabs using the
_current_ catalog price, increasing a product's catalog price while credit tabs
are pending will increase the computed debt balance. To prevent phantom debt
balances, lounge managers should ensure open credit tabs are settled before
updating product catalog prices.
