# 01 Basic Workflow

Follow these steps to capture a straightforward cash sale from start to finish.
Replace `/path/to/config.ini` with your own configuration path or drop the
flag when the file sits beside your terminal session.

1. Register the product catalog entry.

   ```text
   caad-erp-cli add-product \
       --product-id BOTTLE-500 \
       --product-name "500 ml Water" \
       --sell-price 1.25
   ```

2. Record the incoming stock so inventory increases.

   ```text
   caad-erp-cli restock \
       --product-id BOTTLE-500 \
       --quantity 48 \
       --total-cost 28.80 \
       --salesman-id STOCKBOT \
       --notes "Opening delivery from supplier"
   ```

3. Check the inventory position.

   ```text
   caad-erp-cli stock
   ```

4. Record the cash sale.

   ```text
   caad-erp-cli sale \
       --product-id BOTTLE-500 \
       --quantity 1 \
       --salesman-id ALICE \
       --total-revenue 1.25 \
       --payment-type "Cash" \
       --notes "Lunch rush"
   ```

5. Review the profit summary after the transaction.

   ```text
   caad-erp-cli profit
   ```
