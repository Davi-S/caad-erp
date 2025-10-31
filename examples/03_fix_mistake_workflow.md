# 03 Fix Mistake Workflow

Use this playbook to void an incorrect sale and replace it with the right
entry. Substitute `/path/to/config.ini` and `<BAD_TRANSACTION_ID>` with values
from your environment.

1. Capture the mistaken sale (for example, a typo in the quantity).

   ```text
   caad-erp-cli sale \
       --product-id BOTTLE-500 \
       --quantity 12 \
       --salesman-id ALICE \
       --total-revenue 15.00 \
       --payment-type "Cash" \
       --notes "Mistyped quantity during rush"
   ```

2. List the transaction log and note the identifier of the incorrect entry.

   ```text
   caad-erp-cli log
   ```

   Record the `TransactionID` you need to void (for example `T202501021600000002`).

3. Void the mistaken transaction so the ledger reflects the reversal.

   ```text
   caad-erp-cli void \
       --linked-transaction-id <BAD_TRANSACTION_ID> \
       --notes "Void mistaken bulk sale"
   ```

4. Re-enter the corrected sale immediately after the void.

   ```text
   caad-erp-cli sale \
       --product-id BOTTLE-500 \
       --quantity 2 \
       --salesman-id ALICE \
       --total-revenue 2.50 \
       --payment-type "Cash" \
       --notes "Replacement after void"
   ```

5. Run the log again to confirm the original, void, and replacement entries
   appear in order.

   ```text
   caad-erp-cli log
   ```
