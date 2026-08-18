/**
 * Domain exception classes for the Business Logic Layer (BLL).
 *
 * All business rule violations extend `BusinessRuleViolationError` to provide
 * typed exception handling across application workflows.
 */

/**
 * Base exception class for all business rule violations.
 */
export class BusinessRuleViolationError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "BusinessRuleViolationError"
    }
}

/**
 * Raised when registering an entity with an already existing identifier.
 */
export class DuplicateEntityError extends BusinessRuleViolationError {
    constructor(message: string) {
        super(message)
        this.name = "DuplicateEntityError"
    }
}

/**
 * Raised when registering a product with an already existing product ID.
 */
export class DuplicateProductError extends DuplicateEntityError {
    constructor(message: string) {
        super(message)
        this.name = "DuplicateProductError"
    }
}

/**
 * Raised when registering a salesman with an already existing salesman ID.
 */
export class DuplicateSalesmanError extends DuplicateEntityError {
    constructor(message: string) {
        super(message)
        this.name = "DuplicateSalesmanError"
    }
}

/**
 * Base exception raised when a referenced entity identifier does not exist in the database.
 */
export class EntityNotFoundError extends BusinessRuleViolationError {
    constructor(message: string) {
        super(message)
        this.name = "EntityNotFoundError"
    }
}

/**
 * Raised when a referenced product identifier does not exist in the database.
 */
export class ProductNotFoundError extends EntityNotFoundError {
    constructor(message: string) {
        super(message)
        this.name = "ProductNotFoundError"
    }
}

/**
 * Raised when a referenced salesman identifier does not exist in the database.
 */
export class SalesmanNotFoundError extends EntityNotFoundError {
    constructor(message: string) {
        super(message)
        this.name = "SalesmanNotFoundError"
    }
}

/**
 * Raised when a referenced transaction identifier is unknown.
 */
export class TransactionNotFoundError extends EntityNotFoundError {
    constructor(message: string) {
        super(message)
        this.name = "TransactionNotFoundError"
    }
}

/**
 * Base exception raised when an operation targets an inactive entity.
 */
export class EntityInactiveError extends BusinessRuleViolationError {
    constructor(message: string) {
        super(message)
        this.name = "EntityInactiveError"
    }
}

/**
 * Raised when an operation targets an inactive product.
 */
export class ProductInactiveError extends EntityInactiveError {
    constructor(message: string) {
        super(message)
        this.name = "ProductInactiveError"
    }
}

/**
 * Raised when an operation targets an inactive salesman.
 */
export class SalesmanInactiveError extends EntityInactiveError {
    constructor(message: string) {
        super(message)
        this.name = "SalesmanInactiveError"
    }
}

/**
 * Raised when requested quantity exceeds available stock.
 */
export class InsufficientStockError extends BusinessRuleViolationError {
    constructor(message: string) {
        super(message)
        this.name = "InsufficientStockError"
    }
}

/**
 * Raised when quantity fails domain validation constraints.
 */
export class InvalidQuantityError extends BusinessRuleViolationError {
    constructor(message: string) {
        super(message)
        this.name = "InvalidQuantityError"
    }
}

/**
 * Raised when monetary amounts fail validation constraints.
 */
export class InvalidMonetaryValueError extends BusinessRuleViolationError {
    constructor(message: string) {
        super(message)
        this.name = "InvalidMonetaryValueError"
    }
}

/**
 * Raised when required entity identifiers or names are missing or blank.
 */
export class InvalidAttributeError extends BusinessRuleViolationError {
    constructor(message: string) {
        super(message)
        this.name = "InvalidAttributeError"
    }
}

/**
 * Raised when a transaction linked to a credit payment is ineligible.
 */
export class IneligibleCreditSaleError extends BusinessRuleViolationError {
    constructor(message: string) {
        super(message)
        this.name = "IneligibleCreditSaleError"
    }
}

/**
 * Raised when attempting to void an ineligible target transaction.
 */
export class IneligibleVoidTargetError extends BusinessRuleViolationError {
    constructor(message: string) {
        super(message)
        this.name = "IneligibleVoidTargetError"
    }
}

/**
 * Raised when a bulk transaction operation is submitted with zero items.
 */
export class EmptyBulkOperationError extends BusinessRuleViolationError {
    constructor(message: string) {
        super(message)
        this.name = "EmptyBulkOperationError"
    }
}
