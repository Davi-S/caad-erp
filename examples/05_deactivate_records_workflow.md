# 05 Deactivating a Product or Salesman

Follow these actions when a product leaves your catalog or a salesperson departs. Deactivation prevents future transactions without altering history.

> WARNING: Never delete rows from the workbook unless you are absolutely certain about the downstream impact. Always use the CLI flows below so audit history stays intact.

1. Mark the product as inactive so it no longer appears in future restocks or sales.

   ```text
   caad-erp-cli deactivate-product \
       --product-id BOTTLE-500
   ```

2. Flag the salesperson as inactive to block additional transactions under their identifier.

   ```text
   caad-erp-cli deactivate-salesman \
       --salesman-id ALICE
   ```

3. Verify the protection by attempting a sale. The command exits with a `BusinessRuleViolation` noting the inactive records.

   ```text
   caad-erp-cli sale \
       --product-id BOTTLE-500 \
       --quantity 1 \
       --salesman-id ALICE \
       --total-revenue 1.25 \
       --payment-type "Cash"
   ```
