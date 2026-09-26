/**
 * Error taxonomy for the business layer.
 *
 * These are the *expected* failures: the caller asked for something the rules do
 * not allow. They are returned to the caller, so each one carries a message that
 * explains what was rejected.
 *
 * Everything else (a storage constraint firing, a broken invariant, a bug) is not
 * caught: it crashes the application, as decided for the project.
 */

/**
 * Base class for every expected failure, so callers can tell them apart from
 * unexpected ones with a single `instanceof`.
 */
export abstract class BusinessError extends Error {
    constructor(message: string) {
        super(message)
        this.name = new.target.name
    }
}

/**
 * The input does not have the expected shape or values.
 */
export class InvalidInputError extends BusinessError {}

/**
 * No record exists with the given identifier.
 */
export class NotFoundError extends BusinessError {}

/**
 * The record exists but is inactive, and the operation requires an active one.
 */
export class InactiveError extends BusinessError {}

/**
 * The operation would break a business rule: the input is well formed, but what it
 * asks for is not allowed given what is already recorded.
 */
export class RuleViolationError extends BusinessError {}
