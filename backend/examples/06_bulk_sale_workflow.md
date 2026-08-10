# 06 Bulk Sale Workflow

Follow these steps to record a multi-item checkout transaction in a single atomic operation.

1. Register the salesperson who will handle the checkout.

   ```text
   caad-erp-cli add-salesman \
       --salesman-id ALICE \
       --salesman-name "Alice Johnson"
   ```

2. Register the product catalog entries.

   ```text
   caad-erp-cli add-product \
       --product-id BOTTLE-500 \
       --product-name "500 ml Water" \
       --sell-price 125

   caad-erp-cli add-product \
       --product-id SNACK-CHIPS \
       --product-name "Potato Chips" \
       --sell-price 250
   ```

3. Record incoming stock delivery.

   ```text
   caad-erp-cli restock \
       --product-id BOTTLE-500 \
       --quantity 24 \
       --total-cost 1500 \
       --salesman-id ALICE

   caad-erp-cli restock \
       --product-id SNACK-CHIPS \
       --quantity 24 \
       --total-cost 3000 \
       --salesman-id ALICE
   ```

4. Verify current inventory positions.

   ```text
   caad-erp-cli stock
   ```

5. Record a bulk sale (cart checkout) for multiple products in a single command.

   The `-s` (salesman) and `-p` (payment type) apply to the whole checkout, while each `-i` item specifies `PRODUCT_ID QUANTITY TOTAL_REVENUE`.

   ```text
   caad-erp-cli bulk-sale \
       --salesman-id ALICE \
       --payment-type Cash \
       --notes "Combo meal checkout" \
       --item BOTTLE-500 2 250 \
       --item SNACK-CHIPS 1 250
   ```

6. Verify stock again to confirm inventory for both items was reduced atomically.

   ```text
   caad-erp-cli stock
   ```

7. View the complete transaction audit log.

   ```text
   caad-erp-cli log
   ```

> **Note on Atomicity**: If any product in the bulk sale list is inactive or invalid, the entire operation is aborted immediately and zero items are recorded.
