import ky, { KyInstance, Options as KyOptions, HTTPError } from 'ky';
import {
  NetworkConfig,
  ApiResponse,
  RequestOptions,
  Logger,
  RateLimitInfo
} from '../types';
import {
  OrangeNetworkError,
  createErrorFromResponse,
  RateLimitError
} from '../errors';
import { AuthManager } from '../auth';
import { withRetry, Cache, RateLimiter, UrlBuilder, generateRequestId } from '../utils';

/**
 * HTTP Client configuration
 */
export interface HttpClientConfig extends NetworkConfig {
  auth: AuthManager;
  logging?: boolean;
  logger?: Logger;
  cache?: boolean;
  cacheTTL?: number;
  cacheMaxSize?: number;
  rateLimit?: {
    requestsPerSecond?: number;
    maxConcurrent?: number;
  };
}

/**
 * Request hook function
 */
export type RequestHook = (
  request: Request,
  options: KyOptions
) => Request | Response | void | Promise<Request | Response | void>;

/**
 * Response hook function
 */
export type ResponseHook = (
  request: Request,
  options: KyOptions,
  response: Response
) => Response | void | Promise<Response | void>;

// Keep these for backwards compatibility
export type RequestMiddleware = RequestHook;
export type ResponseMiddleware = ResponseHook;

/**
 * HTTP Client for Orange Network Gateway using ky
 */
export class HttpClient {
  private client: KyInstance;
  private config: HttpClientConfig;
  private cache: Cache;
  private rateLimiter: RateLimiter;
  private beforeRequestHooks: RequestHook[] = [];
  private afterResponseHooks: ResponseHook[] = [];
  private pendingRequests = new Map<string, Promise<any>>();

  constructor(config: HttpClientConfig) {
    this.config = {
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      cache: true,
      cacheTTL: 300000,
      cacheMaxSize: 100,
      ...config
    };

    this.cache = new Cache(
      this.config.cacheMaxSize!,
      this.config.cacheTTL!
    );

    const requestsPerSecond = this.config.rateLimit?.requestsPerSecond || 10;
    this.rateLimiter = new RateLimiter(requestsPerSecond, 1000);

    this.client = this.createKyInstance();
  }

  private createKyInstance(): KyInstance {
    return ky.create({
      prefixUrl: this.config.gatewayUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': '@orange-node-network/sdk/1.0.0',
        ...this.config.headers
      },
      hooks: {
        beforeRequest: [
          async (request) => {
            // Add auth headers
            const authHeaders = this.config.auth.getAuthHeaders();
            for (const [key, value] of Object.entries(authHeaders)) {
              request.headers.set(key, value);
            }
            request.headers.set('X-Request-ID', generateRequestId());

            if (this.config.logging) {
              this.log('debug', `HTTP Request: ${request.method} ${request.url}`);
            }

            // Apply custom hooks
            for (const hook of this.beforeRequestHooks) {
              await hook(request, {});
            }
          }
        ],
        afterResponse: [
          async (request, options, response) => {
            if (this.config.logging) {
              this.log('debug', `HTTP Response: ${response.status} ${request.url}`);
            }

            // Apply custom hooks
            for (const hook of this.afterResponseHooks) {
              await hook(request, options, response);
            }
          }
        ]
      },
      // Disable ky's built-in retry - we handle it ourselves
      retry: 0
    });
  }

  private async request<T = any>(
    method: string,
    path: string,
    options: {
      params?: Record<string, any>;
      data?: any;
      requestOptions?: RequestOptions;
    } = {}
  ): Promise<T> {
    const { params, data, requestOptions = {} } = options;
    const {
      timeout = this.config.timeout,
      retryAttempts = this.config.retryAttempts,
      skipRateLimit = false,
    } = requestOptions;

    // Check rate limiting
    if (!skipRateLimit) {
      const rateLimitResult = this.rateLimiter.isAllowed();
      if (!rateLimitResult.allowed) {
        throw new RateLimitError(
          'Rate limit exceeded',
          429,
          rateLimitResult.resetTime,
          this.config.rateLimit?.requestsPerSecond
        );
      }
    }

    // Check cache for GET requests
    const isGetRequest = method.toLowerCase() === 'get';
    const cacheKey = this.getCacheKey(method, path, params);

    if (isGetRequest && this.config.cache && cacheKey) {
      const cachedResponse = this.cache.get(cacheKey);
      if (cachedResponse) {
        this.log('debug', `Cache hit for ${path}`);
        return cachedResponse;
      }
    }

    // Prevent duplicate requests
    if (cacheKey && this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    const requestPromise = this.executeRequestWithRetry<T>(
      method,
      path,
      { params, data, timeout },
      retryAttempts!
    );

    if (cacheKey) {
      this.pendingRequests.set(cacheKey, requestPromise);
    }

    try {
      const result = await requestPromise;

      if (isGetRequest && this.config.cache && cacheKey) {
        this.cache.set(cacheKey, result, this.config.cacheTTL);
      }

      return result;
    } finally {
      if (cacheKey) {
        this.pendingRequests.delete(cacheKey);
      }
    }
  }

  private async executeRequestWithRetry<T>(
    method: string,
    path: string,
    options: { params?: Record<string, any>; data?: any; timeout?: number },
    retryAttempts: number
  ): Promise<T> {
    return withRetry(
      async () => {
        try {
          const kyOptions: KyOptions = {
            timeout: options.timeout,
            searchParams: options.params,
          };

          if (options.data !== undefined) {
            kyOptions.json = options.data;
          }

          const response = await this.client(path, {
            method,
            ...kyOptions
          });

          const responseData = await response.json() as ApiResponse<T>;

          if (responseData && typeof responseData === 'object' && 'success' in responseData && !responseData.success) {
            throw createErrorFromResponse(
              response.status || 500,
              responseData.error?.message || 'Request failed',
              responseData.error?.code,
              responseData.error?.details
            );
          }

          // Return data if wrapped in ApiResponse, otherwise return as-is
          if (responseData && typeof responseData === 'object' && 'data' in responseData) {
            return responseData.data as T;
          }
          return responseData as unknown as T;
        } catch (error: any) {
          if (error instanceof HTTPError) {
            let errorData: any = {};
            try {
              errorData = await error.response.json();
            } catch {
              // Response might not be JSON
            }

            throw createErrorFromResponse(
              error.response.status,
              errorData?.error?.message || error.message,
              errorData?.error?.code,
              errorData?.error?.details
            );
          } else if (error.name === 'TimeoutError') {
            throw new OrangeNetworkError(
              `Request timeout after ${options.timeout}ms`,
              'TIMEOUT_ERROR',
              408,
              { timeout: options.timeout },
              true
            );
          } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new OrangeNetworkError(
              'Network connection failed',
              'NETWORK_ERROR',
              0,
              { originalError: error.message },
              true
            );
          } else if (error instanceof OrangeNetworkError) {
            throw error;
          } else {
            throw new OrangeNetworkError(
              error.message || 'Unknown error occurred',
              'INTERNAL_ERROR',
              500,
              { originalError: error }
            );
          }
        }
      },
      {
        maxAttempts: retryAttempts,
        baseDelay: this.config.retryDelay || 1000,
        maxDelay: 30000,
        backoffFactor: 2,
        jitter: true
      }
    );
  }

  private getCacheKey(method: string, path: string, params?: Record<string, any>): string | null {
    if (method.toLowerCase() !== 'get') return null;

    const paramString = params ? new URLSearchParams(params as any).toString() : '';
    return paramString ? `${path}?${paramString}` : path;
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: any[]): void {
    if (this.config.logger) {
      this.config.logger[level](message, ...args);
    } else if (this.config.logging) {
      console[level](`[OrangeSDK] ${message}`, ...args);
    }
  }

  async get<T = any>(
    path: string,
    params?: Record<string, any>,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>('GET', path, { params, requestOptions: options });
  }

  async post<T = any>(
    path: string,
    data?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>('POST', path, { data, requestOptions: options });
  }

  async put<T = any>(
    path: string,
    data?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>('PUT', path, { data, requestOptions: options });
  }

  async patch<T = any>(
    path: string,
    data?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>('PATCH', path, { data, requestOptions: options });
  }

  async delete<T = any>(
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>('DELETE', path, { requestOptions: options });
  }

  /**
   * Add a before-request hook
   */
  addRequestHook(hook: RequestHook): void {
    this.beforeRequestHooks.push(hook);
  }

  /**
   * Add an after-response hook
   */
  addResponseHook(hook: ResponseHook): void {
    this.afterResponseHooks.push(hook);
  }

  /**
   * Remove a before-request hook
   */
  removeRequestHook(hook: RequestHook): void {
    const index = this.beforeRequestHooks.indexOf(hook);
    if (index > -1) this.beforeRequestHooks.splice(index, 1);
  }

  /**
   * Remove an after-response hook
   */
  removeResponseHook(hook: ResponseHook): void {
    const index = this.afterResponseHooks.indexOf(hook);
    if (index > -1) this.afterResponseHooks.splice(index, 1);
  }

  // Backwards compatibility aliases
  addRequestMiddleware(middleware: RequestMiddleware): void {
    this.addRequestHook(middleware);
  }

  addResponseMiddleware(middleware: ResponseMiddleware): void {
    this.addResponseHook(middleware);
  }

  removeRequestMiddleware(middleware: RequestMiddleware): void {
    this.removeRequestHook(middleware);
  }

  removeResponseMiddleware(middleware: ResponseMiddleware): void {
    this.removeResponseHook(middleware);
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size(),
      maxSize: this.config.cacheMaxSize || 100
    };
  }

  getRateLimitInfo(): RateLimitInfo {
    const stats = this.rateLimiter.getStats();
    return {
      current: stats.current,
      limit: stats.limit,
      remaining: Math.max(0, stats.limit - stats.current),
      resetTime: stats.resetTime,
      windowDuration: 1000
    };
  }

  resetRateLimit(): void {
    this.rateLimiter.reset();
  }

  getBaseUrl(): string {
    return this.config.gatewayUrl;
  }

  getNetworkConfig(): NetworkConfig {
    return {
      gatewayUrl: this.config.gatewayUrl,
      network: this.config.network,
      timeout: this.config.timeout,
      retryAttempts: this.config.retryAttempts,
      retryDelay: this.config.retryDelay,
      headers: this.config.headers
    };
  }

  createUrlBuilder(): UrlBuilder {
    return new UrlBuilder(this.config.gatewayUrl);
  }

  updateConfig(updates: Partial<HttpClientConfig>): void {
    this.config = { ...this.config, ...updates };

    if (updates.timeout || updates.headers || updates.gatewayUrl) {
      // Recreate ky instance with new config
      this.client = this.createKyInstance();
    }

    if (updates.rateLimit?.requestsPerSecond) {
      this.rateLimiter = new RateLimiter(updates.rateLimit.requestsPerSecond, 1000);
    }
  }

  getAuth(): AuthManager {
    return this.config.auth;
  }
}
