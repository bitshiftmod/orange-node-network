import { describe, it, expect } from 'vitest';
import {
  OrangeNetworkError,
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  ValidationError,
  NotFoundError,
  SubscriptionError,
  InternalServerError,
  createErrorFromResponse,
} from '../errors';

describe('OrangeNetworkError', () => {
  it('should create error with all properties', () => {
    const error = new OrangeNetworkError(
      'Test error',
      'TEST_ERROR',
      500,
      { detail: 'test' },
      true
    );

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.statusCode).toBe(500);
    expect(error.details).toEqual({ detail: 'test' });
    expect(error.retryable).toBe(true);
    expect(error.name).toBe('OrangeNetworkError');
  });

  it('should be instanceof Error', () => {
    const error = new OrangeNetworkError('Test', 'TEST');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(OrangeNetworkError);
  });

  it('should convert to JSON', () => {
    const error = new OrangeNetworkError('Test', 'TEST_CODE', 400);
    const json = error.toJSON();

    expect(json.name).toBe('OrangeNetworkError');
    expect(json.message).toBe('Test');
    expect(json.code).toBe('TEST_CODE');
    expect(json.statusCode).toBe(400);
    expect(json.details).toBeUndefined();
    expect(json.retryable).toBe(false);
    expect(json.timestamp).toBeDefined();
  });
});

describe('AuthenticationError', () => {
  it('should create authentication error', () => {
    const error = new AuthenticationError('Invalid token');

    expect(error.message).toBe('Invalid token');
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.statusCode).toBe(401);
    expect(error.name).toBe('AuthenticationError');
  });
});

describe('RateLimitError', () => {
  it('should create rate limit error with reset time', () => {
    const resetTime = Date.now() + 60000;
    const error = new RateLimitError('Rate limit exceeded', 429, resetTime, 100);

    expect(error.message).toBe('Rate limit exceeded');
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.statusCode).toBe(429);
    expect(error.resetTime).toBe(resetTime);
    expect(error.limit).toBe(100);
    expect(error.retryable).toBe(true);
  });

  it('should store reset time for retry calculation', () => {
    const resetTime = Date.now() + 30000;
    const error = new RateLimitError('Rate limit', 429, resetTime);

    expect(error.resetTime).toBe(resetTime);
    expect(error.details).toEqual({ resetTime, limit: undefined });
  });
});

describe('ValidationError', () => {
  it('should create validation error', () => {
    const error = new ValidationError('Invalid input');

    expect(error.message).toBe('Invalid input');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
  });

  it('should include field details', () => {
    const error = new ValidationError('Invalid email', 'email');

    expect(error.details).toEqual({ field: 'email' });
  });
});

describe('NotFoundError', () => {
  it('should create not found error', () => {
    const error = new NotFoundError('User', '123');

    expect(error.message).toBe("User '123' not found");
    expect(error.code).toBe('NOT_FOUND');
    expect(error.statusCode).toBe(404);
  });
});

describe('SubscriptionError', () => {
  it('should create subscription error', () => {
    const error = new SubscriptionError('Subscription expired');

    expect(error.message).toBe('Subscription expired');
    expect(error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(error.statusCode).toBe(402);
  });
});

describe('createErrorFromResponse', () => {
  it('should create AuthenticationError for 401', () => {
    const error = createErrorFromResponse(401, 'Unauthorized');
    expect(error).toBeInstanceOf(AuthenticationError);
  });

  it('should create AuthorizationError for 403', () => {
    const error = createErrorFromResponse(403, 'Forbidden');
    expect(error).toBeInstanceOf(AuthorizationError);
  });

  it('should create RateLimitError for 429', () => {
    const error = createErrorFromResponse(429, 'Too many requests');
    expect(error).toBeInstanceOf(RateLimitError);
  });

  it('should create NotFoundError for 404', () => {
    const error = createErrorFromResponse(404, 'Not found');
    expect(error).toBeInstanceOf(NotFoundError);
  });

  it('should create ValidationError for 400', () => {
    const error = createErrorFromResponse(400, 'Bad request');
    expect(error).toBeInstanceOf(ValidationError);
  });

  it('should create InternalServerError for 500', () => {
    const error = createErrorFromResponse(500, 'Server error');
    expect(error).toBeInstanceOf(InternalServerError);
    expect(error.retryable).toBe(false);
  });

  it('should create OrangeNetworkError for unknown status', () => {
    const error = createErrorFromResponse(418, "I'm a teapot");
    expect(error).toBeInstanceOf(OrangeNetworkError);
  });
});
