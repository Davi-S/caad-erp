# User Guide

This guide covers the naming conventions, operational best practices, and common
pitfalls for day-to-day use of CAAD ERP. It is written for lounge operators and
cashiers who interact with the system during normal operations.

For a detailed walkthrough of how each feature works (POS checkouts, credit
tabs, restocks, write-offs, voids, and so on), refer to the
[User and System Workflows Guide](./WORKFLOWS.md).

---

## Naming Conventions

### Products

#### ID

IDs are permanent unique identifiers assigned at registration. They cannot be
changed after creation and persist in all historical transaction records
forever.

Use short, URL-safe slugs in all lowercase with hyphens as separators:
`coca-cola-350ml`, `salgado-queijo`. Avoid spaces, accented characters, and
special symbols.

Make the ID descriptive enough to be recognisable in a raw database export or
CSV report, not just inside the application UI.

Because IDs are permanent, think before registering. A product created with ID
`ref1` cannot be cleanly corrected later; it will remain `ref1` in every
historical transaction record for the lifetime of the database.

Consistent naming keeps the catalog readable, reports accurate, and avoids
confusion when multiple people share the POS.

#### Name

Use the full, recognizable commercial name.

To add variants of the same product, (size, flavour, format) use a hyphen to
separate the base name and the variant, like this: "Monster - Mango Loco" and
"Monster - Original". This will enable a drop down on the UI to select the
variants, preventing cluster when several variants exist.

| Good example         | What to avoid             |
| -------------------- | ------------------------- |
| `Coca-Cola 350ml`    | `coca`, `cc`, `refri`     |
| `Halls Menta`        | `halls 1`, `novo produto` |
| `Água Mineral 500ml` | `agua`, `aguinha`         |

Use consistent capitalisation across all products. Pick one style (Title Case or
sentence case) and apply it everywhere.

Avoid abbreviations. Product names appear in financial reports, credit tab
summaries, and the customer display. Abbreviated names are unreadable out of
context.

### Salesmen

#### ID

Just like product IDs, they are permanent unique identifiers assigned at
registration. They cannot be changed after creation and persist in all
historical transaction records forever.

It is recommended to use the salesperson "GRR". This is good to avoid
registering duplicated salesman and to make sure that IDs are consistent.

#### Names

Use a name that is unique and recognisable to all operators.

First name plus last initial (`João S.`) or full name (`João Silva`) are both
acceptable. Avoid using only a first name when two people on the team share it.

Do not create duplicate entries for the same person. If a salesman was
deactivated by mistake, reactivate their existing record rather than registering
a new one. Duplicate entries split historical sales data across two records,
breaking per-salesman reports.

---

## Good Practices

### Transaction Notes

The `notes` field is optional on most transactions but strongly recommended in
specific situations. Keep notes concise; one clear sentence is sufficient.

Notes are extremely recommended for:

- All `WRITE_OFF` transactions: explain the reason (expired, damaged, lost,
  donated to event).
- Zero-cost `RESTOCK` entries: identify the source (alumni donation, event
  sponsorship, vendor sample).
- `VOID` corrections: describe what went wrong in the original transaction.

### Making Sales

Always select the correct salesman before processing a checkout. Sales are
attributed to the selected salesman and cannot be reassigned without voiding the
entire transaction.

### Restocking

Use zero-cost restocks only for genuine donations and promotional items, not as
a shortcut to avoid entering a cost. Zero-cost restocks cause those items to
show 100% profit margin, which distorts reports if the cost was real.

### Write-Offs

Record write-offs as soon as spoilage, damage, or loss is discovered. Delayed
write-offs cause stock levels to appear higher than reality, which may lead to
overselling items that are not actually available.

### Reversing Mistakes (Void)

Use the `VOID` workflow to correct any transaction entered in error. Never
attempt to manually edit or delete records (the system is designed around an
immutable append-only ledger and manual edits bypass all validation and audit
safeguards).

`VOID` transactions themselves cannot be voided. Confirm the target transaction
and all details before submitting a void.
