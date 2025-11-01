# 02 Credit Workflow

Follow this sequence to handle a sale on credit through settlement. Replace
`/path/to/config.ini` and `<TRANSACTION_ID>` with values from your own ledger.

1. Record the credit sale. Revenue stays at zero until the payment arrives.

   ```text
   caad-erp-cli sale \
       --product-id BOTTLE-500 \
       --quantity 6 \
       --salesman-id ALICE \
       --total-revenue 0 \
       --payment-type "On Credit" \
       --notes "Jordan opened a tab"
   ```

2. Review outstanding balances and note the generated transaction identifier.

   ```text
   caad-erp-cli debts
   ```

   Write down the `TransactionID` associated with the new credit sale (for
   example `T202501021530000001`).

3. Log the payment once the customer settles the balance.

   ```text
   caad-erp-cli pay-debt \
       --linked-transaction-id <TRANSACTION_ID> \
       --total-revenue 7.50 \
       --salesman-id ALICE \
      --payment-type "PIX" \
      --notes "Jordan settled the tab via PIX"
   ```

4. Confirm the balance no longer appears on the debts report.

   ```text
   caad-erp-cli debts
   ```
