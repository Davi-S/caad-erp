# 04 Advanced Workflow

This recipe strings together power-user operations: onboarding seasonal staff,
annotating inventory events, and handling shrinkage. Replace
`/path/to/config.ini` with your configuration path.

1. Add the seasonal staff member so their actions are tracked.

   ```text
   caad-erp-cli add-salesman \
       --salesman-id SEASONAL-01 \
       --salesman-name "Charlie Seasonal"
   ```

   Append `--inactive` if you want the record present but not eligible for
   new transactions yet.

2. Introduce a limited-run product with its catalog price.

   ```text
   caad-erp-cli add-product \
       --product-id PASTRY-BOX \
       --product-name "Pastry Sampler" \
       --sell-price 12.00
   ```

3. Restock the item and capture the supplier invoice in the notes.

   ```text
   caad-erp-cli restock \
       --product-id PASTRY-BOX \
       --quantity 10 \
       --total-cost 54.00 \
       --salesman-id SEASONAL-01 \
       --notes "Invoice #INV-4427 from Local Bakery"
   ```

4. Record spoilage with a write-off so stock stays accurate.

   ```text
   caad-erp-cli write-off \
       --product-id PASTRY-BOX \
       --quantity 2 \
       --salesman-id SEASONAL-01 \
       --notes "Spoiled pastries after event"
   ```

5. Review current stock levels and consolidated profit metrics.

   ```text
   caad-erp-cli stock
   ```

   ```text
   caad-erp-cli profit
   ```

6. List the transaction log and focus on entries for the product to audit the
   full trail.

   ```text
   caad-erp-cli log
   ```

   Scan the output for rows containing `PASTRY-BOX` or copy the log to a text
   editor for richer filtering.
