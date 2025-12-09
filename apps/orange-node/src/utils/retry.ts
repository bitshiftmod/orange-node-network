import { RetryConfig } from '../types';

export class RetryManager {
  private config: RetryConfig;

  constructor(config: RetryConfig) {
    this.config = config;
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    let lastError: Error | null = null;
    let attempt = 1;

    while (attempt <= this.config.maxAttempts) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (!this.shouldRetry(error as Error, attempt)) {
          throw lastError;
        }

        if (attempt < this.config.maxAttempts) {
          const delay = this.calculateDelay(attempt);
          await this.sleep(delay);
        }
      }

      attempt++;
    }

    throw lastError;
  }

  private shouldRetry(error: Error, attempt: number): boolean {
    // Don't retry if we've exceeded max attempts
    if (attempt >= this.config.maxAttempts) {
      return false;
    }

    // Check for retryable error types
    if (this.config.retryableErrors.includes(error.name) ||
        this.config.retryableErrors.some(type => error.message.includes(type))) {
      return true;
    }

    // Check for retryable status codes (for HTTP errors)
    if ('statusCode' in error && this.config.retryableStatusCodes.includes((error as any).statusCode)) {
      return true;
    }

    // Check for common retryable network errors
    const retryablePatterns = [
      /ECONNRESET/,
      /ETIMEDOUT/,
      /ENOTFOUND/,
      /ECONNREFUSED/,
      /timeout/i,
      /network/i,
      /connection/i
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  private calculateDelay(attempt: number): number {
    const delay = this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    return Math.min(delay, this.config.maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Create a retry wrapper for any function
  wrap<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
  ): (...args: T) => Promise<R> {
    return (...args: T) => this.executeWithRetry(() => fn(...args));
  }

  // Create a retry wrapper for async operations with custom config
  wrapWithConfig<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    config: Partial<RetryConfig>,
  ): (...args: T) => Promise<R> {
    const retryManager = new RetryManager({ ...this.config, ...config });
    return (...args: T) => retryManager.executeWithRetry(() => fn(...args));
  }
}

export const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
    'NETWORK_ERROR',
    'TIMEOUT_ERROR'
  ],
  retryableStatusCodes: [408, 429, 500, 502, 503, 504]
};

export const createRetryManager = (config: Partial<RetryConfig> = {}): RetryManager => {
  return new RetryManager({ ...defaultRetryConfig, ...config });
};