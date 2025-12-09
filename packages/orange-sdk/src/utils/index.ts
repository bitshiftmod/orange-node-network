import { OrangeNetworkError, isRetryableError } from '../errors';
import { RetryConfig } from '../types';

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
  jitter: true
};

/**
 * Sleep utility for delays
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Calculate retry delay with exponential backoff and jitter
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig
): number {
  let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt - 1);
  delay = Math.min(delay, config.maxDelay);

  if (config.jitter) {
    delay = delay * (0.5 + Math.random() * 0.5);
  }

  return Math.floor(delay);
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  shouldRetry?: (error: OrangeNetworkError, attempt: number) => boolean
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: OrangeNetworkError;

  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as OrangeNetworkError;

      const customRetryLogic = shouldRetry?.(lastError, attempt);
      const shouldRetryAttempt =
        customRetryLogic !== undefined
          ? customRetryLogic
          : (attempt < retryConfig.maxAttempts && isRetryableError(lastError));

      if (!shouldRetryAttempt) {
        throw lastError;
      }

      if (attempt < retryConfig.maxAttempts) {
        const delay = calculateRetryDelay(attempt, retryConfig);
        await sleep(delay);
      }
    }
  }

  throw lastError!;
}

/**
 * Execute multiple promises concurrently with limited concurrency
 */
export async function concurrent<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number = 5
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const promise = task().then(result => {
      results.push(result);
      const index = executing.indexOf(promise);
      if (index > -1) {
        executing.splice(index, 1);
      }
    });

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function calls
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  };
}

/**
 * Simple in-memory cache with TTL and LRU eviction
 */
export class Cache<T = any> {
  private cache = new Map<string, { value: T; expires: number }>();
  private maxSize: number;
  private defaultTTL: number;

  constructor(maxSize: number = 100, defaultTTL: number = 300000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  set(key: string, value: T, ttl?: number): void {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    const expires = Date.now() + (ttl || this.defaultTTL);
    this.cache.set(key, { value, expires });
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, item);

    return item.value;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  cleanup(): number {
    let removed = 0;
    const now = Date.now();

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expires) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}

/**
 * Rate limiter implementation
 */
export class RateLimiter {
  private requests: number[] = [];
  private limit: number;
  private windowMs: number;

  constructor(limit: number, windowMs: number = 60000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  isAllowed(): { allowed: boolean; resetTime: number; remaining: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    this.requests = this.requests.filter(time => time > windowStart);

    if (this.requests.length < this.limit) {
      this.requests.push(now);
      return {
        allowed: true,
        resetTime: windowStart + this.windowMs,
        remaining: this.limit - this.requests.length
      };
    }

    return {
      allowed: false,
      resetTime: this.requests[0] + this.windowMs,
      remaining: 0
    };
  }

  reset(): void {
    this.requests = [];
  }

  getStats(): { current: number; limit: number; resetTime: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const current = this.requests.filter(time => time > windowStart).length;

    return {
      current,
      limit: this.limit,
      resetTime: windowStart + this.windowMs
    };
  }
}

/**
 * Generate unique ID
 */
export function generateId(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 11);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * Generate request ID for tracking
 */
export function generateRequestId(): string {
  return generateId('req');
}

/**
 * Deep clone object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as unknown as T;

  if (typeof obj === 'object') {
    const cloned = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }

  return obj;
}

/**
 * Merge options with defaults
 */
export function mergeOptions<T extends Record<string, any>>(
  defaults: T,
  options: Partial<T>
): T {
  const merged = { ...defaults };

  for (const key in options) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      const value = options[key];
      if (value !== undefined) {
        (merged as any)[key] = value;
      }
    }
  }

  return merged;
}

/**
 * Validate URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate and normalize URL
 */
export function validateUrl(url: string, defaultProtocol: string = 'https'): string {
  if (!url) throw new Error('URL is required');

  let normalizedUrl = url.trim();

  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = `${defaultProtocol}://${normalizedUrl}`;
  }

  if (!isValidUrl(normalizedUrl)) {
    throw new Error(`Invalid URL: ${url}`);
  }

  return normalizedUrl.replace(/\/$/, '');
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Validate Algorand address format
 */
export function isValidAlgorandAddress(address: string): boolean {
  if (typeof address !== 'string') return false;
  const algorandAddressRegex = /^[A-Z2-7]{58}$/;
  return algorandAddressRegex.test(address);
}

/**
 * URL builder for API endpoints
 */
export class UrlBuilder {
  private baseUrl: string;
  private pathSegments: string[] = [];
  private params: Record<string, string> = {};

  constructor(baseUrl: string) {
    this.baseUrl = validateUrl(baseUrl);
  }

  path(segment: string): UrlBuilder {
    const cleanSegment = segment.replace(/^\/+|\/+$/g, '');
    if (cleanSegment) {
      this.pathSegments.push(cleanSegment);
    }
    return this;
  }

  query(key: string, value: string | number | boolean): UrlBuilder {
    this.params[key] = String(value);
    return this;
  }

  queryParams(params: Record<string, string | number | boolean>): UrlBuilder {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        this.query(key, value);
      }
    });
    return this;
  }

  build(): string {
    const url = new URL(this.baseUrl);

    if (this.pathSegments.length > 0) {
      url.pathname = `${url.pathname.replace(/\/$/, '')}/${this.pathSegments.join('/')}`;
    }

    const searchParams = new URLSearchParams();
    Object.entries(this.params).forEach(([key, value]) => {
      searchParams.append(key, value);
    });

    if (searchParams.toString()) {
      url.search = searchParams.toString();
    }

    return url.toString();
  }

  reset(): UrlBuilder {
    this.pathSegments = [];
    this.params = {};
    return this;
  }

  clone(): UrlBuilder {
    const cloned = new UrlBuilder(this.baseUrl);
    cloned.pathSegments = [...this.pathSegments];
    cloned.params = { ...this.params };
    return cloned;
  }
}
