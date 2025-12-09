import { ErrorCode, ApiResponse } from '../types';

/**
 * Base error class for Orange Network SDK
 */
export class OrangeNetworkError extends Error {
  public readonly code: ErrorCode | string;
  public readonly statusCode?: number;
  public readonly details?: any;
  public readonly timestamp: number;
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: ErrorCode | string = ErrorCode.INTERNAL_ERROR,
    statusCode?: number,
    details?: any,
    retryable: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = Date.now();
    this.retryable = retryable;

    // Maintains proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
      retryable: this.retryable,
      stack: this.stack
    };
  }

  static fromApiResponse(response: ApiResponse): OrangeNetworkError {
    if (!response.error) {
      throw new Error('API response does not contain error information');
    }
    return new OrangeNetworkError(
      response.error.message,
      response.error.code as ErrorCode,
      undefined,
      response.error.details
    );
  }
}

/**
 * Network-related errors
 */
export class NetworkError extends OrangeNetworkError {
  constructor(message: string, statusCode?: number, details?: any) {
    super(message, ErrorCode.NETWORK_ERROR, statusCode, details, true);
  }
}

export class TimeoutError extends NetworkError {
  constructor(message: string = 'Request timed out', timeout?: number) {
    super(message, 408, { timeout });
    (this as any).code = ErrorCode.TIMEOUT_ERROR;
  }
}

export class ConnectionError extends NetworkError {
  constructor(message: string = 'Connection failed', details?: any) {
    super(message, 0, details);
    (this as any).code = ErrorCode.CONNECTION_ERROR;
  }
}

/**
 * Authentication errors
 */
export class AuthenticationError extends OrangeNetworkError {
  constructor(message: string, statusCode: number = 401, details?: any) {
    super(message, ErrorCode.UNAUTHORIZED, statusCode, details, false);
  }
}

export class AuthorizationError extends OrangeNetworkError {
  constructor(message: string, statusCode: number = 403, details?: any) {
    super(message, ErrorCode.FORBIDDEN, statusCode, details, false);
  }
}

export class InvalidTokenError extends AuthenticationError {
  constructor(message: string = 'Invalid authentication token', details?: any) {
    super(message, 401, details);
    (this as any).code = ErrorCode.INVALID_TOKEN;
  }
}

export class ExpiredTokenError extends AuthenticationError {
  constructor(message: string = 'Authentication token has expired', details?: any) {
    super(message, 401, details);
    (this as any).code = ErrorCode.EXPIRED_TOKEN;
  }
}

/**
 * Validation errors
 */
export class ValidationError extends OrangeNetworkError {
  constructor(message: string, field?: string, details?: any) {
    super(message, ErrorCode.VALIDATION_ERROR, 400, { field, ...details }, false);
  }
}

export class InvalidAddressError extends ValidationError {
  constructor(address: string, details?: any) {
    super(`Invalid Algorand address: ${address}`, 'address', details);
    (this as any).code = ErrorCode.INVALID_ADDRESS;
  }
}

export class InvalidTransactionError extends ValidationError {
  constructor(message: string, details?: any) {
    super(message, 'transaction', details);
    (this as any).code = ErrorCode.INVALID_TRANSACTION;
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends OrangeNetworkError {
  public readonly resetTime?: number;
  public readonly limit?: number;

  constructor(
    message: string,
    statusCode: number = 429,
    resetTime?: number,
    limit?: number
  ) {
    super(message, ErrorCode.RATE_LIMITED, statusCode, { resetTime, limit }, true);
    this.resetTime = resetTime;
    this.limit = limit;
  }
}

/**
 * Resource errors
 */
export class NotFoundError extends OrangeNetworkError {
  constructor(resource: string, identifier?: string) {
    super(
      `${resource}${identifier ? ` '${identifier}'` : ''} not found`,
      ErrorCode.NOT_FOUND,
      404,
      { resource, identifier }
    );
  }
}

/**
 * System errors
 */
export class InternalServerError extends OrangeNetworkError {
  constructor(message: string = 'Internal server error', details?: any) {
    super(message, ErrorCode.INTERNAL_ERROR, 500, details, false);
  }
}

export class ServiceUnavailableError extends OrangeNetworkError {
  constructor(message: string = 'Service temporarily unavailable', details?: any) {
    super(message, ErrorCode.SERVICE_UNAVAILABLE, 503, details, true);
  }
}

/**
 * Subscription errors
 */
export class SubscriptionError extends OrangeNetworkError {
  constructor(message: string, statusCode: number = 402, details?: any) {
    super(message, ErrorCode.SUBSCRIPTION_REQUIRED, statusCode, details, false);
  }
}

export class SubscriptionExpiredError extends SubscriptionError {
  constructor(subscriptionId?: string, expiredAt?: number) {
    super('Subscription has expired', 402, { subscriptionId, expiredAt });
    (this as any).code = ErrorCode.SUBSCRIPTION_EXPIRED;
  }
}

/**
 * Transaction errors
 */
export class TransactionError extends OrangeNetworkError {
  public readonly txId?: string;

  constructor(message: string, txId?: string, details?: any) {
    super(message, ErrorCode.TRANSACTION_FAILED, 400, { txId, ...details }, false);
    this.txId = txId;
  }
}

export class InsufficientFundsError extends TransactionError {
  constructor(amount: number, balance: number, txId?: string) {
    super(
      `Insufficient funds: required ${amount}, available ${balance}`,
      txId,
      { amount, balance }
    );
    (this as any).code = ErrorCode.INSUFFICIENT_FUNDS;
  }
}

/**
 * Error factory function
 */
export function createErrorFromResponse(
  statusCode: number,
  message: string,
  code?: string,
  details?: any
): OrangeNetworkError {
  const errorCode = code as ErrorCode || ErrorCode.INTERNAL_ERROR;

  switch (statusCode) {
    case 400:
      if (errorCode === ErrorCode.INVALID_ADDRESS) return new InvalidAddressError(message, details);
      if (errorCode === ErrorCode.INVALID_TRANSACTION) return new InvalidTransactionError(message, details);
      return new ValidationError(message, undefined, details);
    case 401:
      if (errorCode === ErrorCode.INVALID_TOKEN) return new InvalidTokenError(message, details);
      if (errorCode === ErrorCode.EXPIRED_TOKEN) return new ExpiredTokenError(message, details);
      return new AuthenticationError(message, statusCode, details);
    case 403:
      return new AuthorizationError(message, statusCode, details);
    case 404:
      return new NotFoundError('Resource', details?.identifier);
    case 402:
      if (errorCode === ErrorCode.SUBSCRIPTION_EXPIRED) return new SubscriptionExpiredError();
      return new SubscriptionError(message, statusCode, details);
    case 429:
      return new RateLimitError(message, statusCode, details?.resetTime, details?.limit);
    case 500:
      return new InternalServerError(message, details);
    case 503:
      return new ServiceUnavailableError(message, details);
    case 408:
      return new TimeoutError(message, details?.timeout);
    default:
      if (statusCode >= 500) {
        return new ServiceUnavailableError(message, details);
      }
      return new OrangeNetworkError(message, errorCode, statusCode, details, false);
  }
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: OrangeNetworkError): boolean {
  return error.retryable || (
    error.code === ErrorCode.NETWORK_ERROR ||
    error.code === ErrorCode.TIMEOUT_ERROR ||
    error.code === ErrorCode.CONNECTION_ERROR ||
    error.code === ErrorCode.SERVICE_UNAVAILABLE ||
    error.code === ErrorCode.RATE_LIMITED
  );
}

/**
 * Check if an error indicates authentication failure
 */
export function isAuthError(error: OrangeNetworkError): boolean {
  return (
    error.code === ErrorCode.UNAUTHORIZED ||
    error.code === ErrorCode.FORBIDDEN ||
    error.code === ErrorCode.INVALID_TOKEN ||
    error.code === ErrorCode.EXPIRED_TOKEN
  );
}

/**
 * Check if an error indicates subscription issues
 */
export function isSubscriptionError(error: OrangeNetworkError): boolean {
  return (
    error.code === ErrorCode.SUBSCRIPTION_REQUIRED ||
    error.code === ErrorCode.SUBSCRIPTION_EXPIRED ||
    error.code === ErrorCode.SUBSCRIPTION_INACTIVE
  );
}
