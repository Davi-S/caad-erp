import { describe, expect, it } from "vitest"
import {
    BusinessRuleViolationError,
    DuplicateEntityError,
    DuplicateProductError,
    DuplicateSalesmanError,
    EmptyBulkOperationError,
    EntityInactiveError,
    EntityNotFoundError,
    IneligibleCreditSaleError,
    IneligibleVoidTargetError,
    InsufficientStockError,
    InvalidAttributeError,
    InvalidMonetaryValueError,
    InvalidQuantityError,
    ProductInactiveError,
    ProductNotFoundError,
    SalesmanInactiveError,
    SalesmanNotFoundError,
    TransactionNotFoundError,
} from "../../src/bll/errors.js"

describe("BLL Errors", () => {
    it("instantiates custom domain error classes with expected name and message", () => {
        const errors = [
            new BusinessRuleViolationError("base error"),
            new DuplicateEntityError("dup entity"),
            new DuplicateProductError("dup product"),
            new DuplicateSalesmanError("dup salesman"),
            new EntityNotFoundError("entity not found"),
            new ProductNotFoundError("product not found"),
            new SalesmanNotFoundError("salesman not found"),
            new TransactionNotFoundError("transaction not found"),
            new EntityInactiveError("entity inactive"),
            new ProductInactiveError("product inactive"),
            new SalesmanInactiveError("salesman inactive"),
            new InsufficientStockError("insufficient stock"),
            new InvalidQuantityError("invalid qty"),
            new InvalidMonetaryValueError("invalid money"),
            new InvalidAttributeError("invalid attr"),
            new IneligibleCreditSaleError("ineligible credit"),
            new IneligibleVoidTargetError("ineligible void"),
            new EmptyBulkOperationError("empty bulk"),
        ]

        for (const err of errors) {
            expect(err).toBeInstanceOf(Error)
            expect(err).toBeInstanceOf(BusinessRuleViolationError)
            expect(err.name).toBe(err.constructor.name)
            expect(err.message).toBeDefined()
        }
    })
})
