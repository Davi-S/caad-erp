# 05 Editing or Deactivating a Product or Salesman

Follow these actions when you need to update details like names and prices, or
when a product leaves your catalog or a salesperson departs. Deactivation
prevents future transactions without altering history.

> WARNING: Never delete rows from the workbook unless you are absolutely certain
> about the downstream impact. Always use the CLI flows below so audit history
> stays intact.

1. Edit a product's fields, or mark the product as inactive so it no longer
   appears in future restocks or sales.

   _To update a product's details:_

   ```text
   caad-erp-cli edit-product \
       --product-id BOTTLE-500 \
       --product-name "Updated Bottle" \
       --product-sell-price 2.00
   ```

To deactivate a product:

```text
caad-erp-cli edit-product \
    --product-id BOTTLE-500 \
    --product-is-active False

```

2. Update a salesperson's information, or flag the salesperson as inactive to
   block additional transactions under their identifier.

_To update a salesperson's details:_

```text
caad-erp-cli edit-salesman \
    --salesman-id ALICE \
    --salesman-name "Alice NewName"

```

To deactivate a salesperson:

```text
caad-erp-cli edit-salesman \
    --salesman-id ALICE \
    --salesman-is-active False

```

3. Verify the protection by attempting a sale. The command exits with a
   `BusinessRuleViolation` noting the inactive records.

```text
caad-erp-cli sale \
    --product-id BOTTLE-500 \
    --quantity 1 \
    --salesman-id ALICE \
    --total-revenue 1.25 \
    --payment-type "Cash"

```

