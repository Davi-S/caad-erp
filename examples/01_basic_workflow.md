# 01 Basic Workflow

Follow these steps to capture a straightforward cash sale from zero to finish.

1. Register the salesperson who will handle the sale.

   ```text
   caad-erp-cli add-salesman \
      --salesman-id ALICE \
      --salesman-name "Alice Johnson"
   ```

2. Register the product catalog entry.

   ```text
   caad-erp-cli add-product \
       --product-id BOTTLE-500 \
       --product-name "500 ml Water" \
       --sell-price 1.25
   ```

3. Record the incoming stock so inventory increases.

   ```text
   caad-erp-cli restock \
       --product-id BOTTLE-500 \
       --quantity 48 \
       --total-cost 28.80 \
       --salesman-id STOCKBOT \
       --notes "Opening delivery from supplier"
   ```

4. Check the inventory position.

   ```text
   caad-erp-cli stock
   ```

5. Record the cash sale.

   ```text
   caad-erp-cli sale \
       --product-id BOTTLE-500 \
       --quantity 1 \
       --salesman-id ALICE \
       --total-revenue 1.25 \
       --payment-type "Cash" \
       --notes "Lunch rush"
   ```

6. Check the inventory position again to confirm the sale reduced stock.

   ```text
   caad-erp-cli stock
   ```

7. Review the profit summary after the transaction.

   ```text
   caad-erp-cli profit
   ```
