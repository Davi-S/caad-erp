# Backend Requirements

Data model and business rules for the ledger. Design discussion:
[#164](https://github.com/Davi-S/caad-erp/issues/164).

## Principles

- **The database is storage only.** It enforces types, `NOT NULL`, primary and
  foreign keys. Every business rule lives in the BLL.
- **Append-only.** Documents are never updated or deleted; mistakes are
  corrected with `VOID`.
- **Sign convention.** Positive means the store gains.
- **Money** is integer cents.
- **NULL means "does not apply"; 0 means "applies and is zero".** Columns used
  only by some line types are nullable with no default.
- **Timestamps** are integer Unix epoch milliseconds (UTC).
- **IDs only identify; `sequence` orders.** Entry order is `sequence`
  (1, 2, 3, … assigned on insert, never reused). Business order is
  `occurred_at`, then `sequence`. Timestamps carry meaning, not order. Lines
  and payments within a document have no order.

## Schema

```
products
  id                  TEXT     PK
  name                TEXT     NOT NULL
  sell_price          INTEGER  NOT NULL                   current catalog price
  is_active           INTEGER  NOT NULL

salesmen
  id                  TEXT     PK
  name                TEXT     NOT NULL
  is_active           INTEGER  NOT NULL

documents                                                 one row per business event
  id                  TEXT     PK                         uuid v7
  sequence            INTEGER  NOT NULL UNIQUE            order of entry, assigned on insert
  type                TEXT     NOT NULL                   SALE | RETURN | PAYMENT | RESTOCK | WRITE_OFF | VOID
  occurred_at         INTEGER  NOT NULL                   when it happened
  recorded_at         INTEGER  NOT NULL                   when it was entered, never backdated
  performed_by        TEXT     NOT NULL  FK → salesmen    who performed it
  linked_document_id  TEXT     NULL      FK → documents   RETURN → SALE, PAYMENT → SALE/RESTOCK/RETURN, VOID → target
  notes               TEXT     NULL

document_lines                                            goods: what moved
  id                  TEXT     PK
  document_id         TEXT     NOT NULL  FK → documents
  product_id          TEXT     NOT NULL  FK → products
  linked_line_id      TEXT     NULL      FK → document_lines   the line this one reverses
  quantity            INTEGER  NOT NULL                   signed, + into stock
  unit_price          INTEGER  NULL                       SALE only: catalog price snapshot
  line_discount           INTEGER  NULL                   SALE only: discount given on this line
  document_discount_share INTEGER  NULL                   SALE only: this line's share of the sale-wide discount
  amount              INTEGER  NULL                       sale-related lines only: signed, net sales value
  total_cost          INTEGER  NULL                   RESTOCK only: what the line cost together (0 = free)

payments                                                  money: what moved, and how
  id                  TEXT     PK
  document_id         TEXT     NOT NULL  FK → documents
  linked_payment_id   TEXT     NULL      FK → payments    the payment this one reverses
  method              TEXT     NOT NULL                   Cash | PIX | Other
  amount              INTEGER  NOT NULL                   signed, + money in
```

### Document shapes

| Type        | Links to                  | Lines                                               | Payments                                                    |
| ----------- | ------------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| `SALE`      | —                         | ≥1: qty −, `unit_price`, discounts, `amount` +      | 0..n, +                                                     |
| `RETURN`    | a SALE                    | ≥1: qty +, `amount` −, `linked_line_id` → sale line | 0..n, − (refunds)                                           |
| `PAYMENT`   | a SALE, RESTOCK or RETURN | none                                                | ≥1, signed like the target's payments                       |
| `RESTOCK`   | —                         | ≥1: qty +, `total_cost`                             | 0..n, −                                                     |
| `WRITE_OFF` | —                         | ≥1: qty −                                           | none                                                        |
| `VOID`      | any non-VOID              | every line negated, `linked_line_id` → target line  | every payment negated, `linked_payment_id` → target payment |

Line columns not listed for a type are NULL. Reversal lines (`RETURN`, `VOID`)
store only `quantity` and, when reversing a sale line, `amount`; price,
discounts and cost are read from the original line.

## Real-world situations

### Selling

| Situation                                          | How it is recorded                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| Normal sale (one or more items)                    | `SALE` with one line per item and its payments                            |
| Split payment (PIX + cash)                         | `SALE` with one payment per method                                        |
| Line or sale-wide discount                         | `line_discount` / `document_discount_share` on the lines                  |
| Giveaway                                           | `SALE` with 100% discount and no payments                                 |
| Credit sale                                        | `SALE` with no payments; the salesman owes the balance (#165)             |
| Down payment                                       | `SALE` with payments below its total                                      |
| Paying off a credit sale (full or in installments) | `PAYMENT` → sale                                                          |
| Paying off several credit sales at once            | One `PAYMENT` per sale                                                    |
| Selling before the restock is entered              | Allowed; stock goes negative and is reported until the restock is entered |

### Returns

| Situation                                | How it is recorded                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| Customer returns items (all or some)     | `RETURN` → sale, lines linked to the sale lines, optional refund payments |
| Return on an unpaid credit sale          | `RETURN` without refund; the debt shrinks                                 |
| Exchange                                 | `RETURN` of the old item + new `SALE`                                     |
| Returning a product that is now inactive | Allowed                                                                   |

### Stock

| Situation                           | How it is recorded                                                   |
| ----------------------------------- | -------------------------------------------------------------------- |
| Purchase                            | `RESTOCK` with `total_cost` per line and what was paid now           |
| Paying a supplier later             | `PAYMENT` → restock; the shortfall is reported until then            |
| Donation or found units             | `RESTOCK` with `total_cost = 0` and no payments                      |
| Loss, damage, expiry, missing units | `WRITE_OFF`                                                          |
| Stock count differs from the system | `WRITE_OFF` (fewer) or zero-cost `RESTOCK` (more) for the difference |

### Corrections

| Situation                                      | How it is recorded                                        |
| ---------------------------------------------- | --------------------------------------------------------- |
| Entry made by mistake                          | `VOID` it; a void always takes back the whole document    |
| One item of a sale was wrong                   | `VOID` the sale and record it again, correctly            |
| PIX that never arrived                         | `VOID` the sale and record it again with no payment       |
| Restock with wrong data                        | `VOID` it + new `RESTOCK` with the original `occurred_at` |
| Entry recorded late                            | Past `occurred_at`, `recorded_at` = now                   |
| Voiding a sale with returns or credit payments | Rejected; void those first                                |
| Voiding the same thing twice                   | Rejected: a document is voided or it is not               |
| Voiding a void                                 | Rejected; enter the original again instead                |
