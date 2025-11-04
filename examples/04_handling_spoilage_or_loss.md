# 04 Handling Spoilage or Loss

Use this checklist to log damaged or missing stock with a `write-off` so the ledger stays accurate.

1. Review the current inventory to confirm the on-hand quantity before adjusting it.

   ```text
   caad-erp-cli stock
   ```

2. Record the write-off with the quantity of items that are no longer sellable.

   ```text
   caad-erp-cli write-off \
       --product-id BOTTLE-500 \
       --quantity 3 \
       --salesman-id ALICE \
       --notes "Spoiled bottles discovered in storage"
   ```

3. Inspect the transaction log to see the new `WRITE_OFF` entry and its timestamp.

   ```text
   caad-erp-cli log
   ```

4. Run the stock report again to verify the quantity decreased by the written-off amount.

   ```text
   caad-erp-cli stock
   ```
