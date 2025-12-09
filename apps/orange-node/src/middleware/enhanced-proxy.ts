import { Request, Response, NextFunction } from 'express';
import axios, { AxiosRequestConfig } from 'axios';
import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { RetryManager } from '../utils/retry';
import { RedisCache } from '../cache/redis-cache';
import { OrangeNodeConfig } from '../types';
import { Logger } from '../utils/logger';
import { MetricsCollector } from '../utils/metrics';

export class EnhancedProxyMiddleware extends EventEmitter {
  private config: OrangeNodeConfig;
  private logger: Logger;
  private metrics: MetricsCollector;
  private cache?: RedisCache;
  private circuitBreaker: CircuitBreaker;
  private retryManager: RetryManager;
  private activeConnections: number = 0;
  private maxConnectionsReached: number = 0;

  constructor(
    config: OrangeNodeConfig,
    logger: Logger,
    metrics: MetricsCollector,
    cache?: RedisCache
  ) {
    super();
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    if (cache) { this.cache = cache; }
    this.circuitBreaker = new CircuitBreaker(config.proxy.circuitBreaker);
    this.retryManager = new RetryManager(config.proxy.retries);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.circuitBreaker.on('stateChange', ({ from, to }) => {
      this.logger.logCircuitBreakerEvent('algod', to);
      this.metrics.updateCircuitBreakerState('algod', to);

      if (to === 'OPEN') {
        this.emit('circuitOpen');
        this.logger.logSecurityEvent('circuit-breaker-open', {
          service: 'algod',
          from,
          to
        }, 'high');
      }
    });

    this.circuitBreaker.on('failure', ({ error }) => {
      this.metrics.recordCircuitBreakerFailure('algod');
      this.logger.error('Circuit breaker failure', error as Error);
    });

    this.circuitBreaker.on('success', ({ duration }) => {
      this.logger.info('Circuit breaker success', { duration });
    });
  }

  private isReadOnlyRequest(req: Request): boolean {
    const readOnlyMethods = ['GET', 'HEAD', 'OPTIONS'];
    const readOnlyPaths = [
      '/v2/status',
      '/v2/status/wait-for-block-after',
      '/v2/blocks',
      '/v2/ledger',
      '/v2/account',
      '/v2/accounts',
      '/v2/assets',
      '/v2/applications',
      '/v2/transactions/pending',
      '/v2/transactions/params'
    ];

    return readOnlyMethods.includes(req.method) ||
           readOnlyPaths.some(path => req.path.startsWith(path));
  }

  private canCacheRequest(req: Request): boolean {
    if (!this.cache || !this.config.proxy.cache.enabled) {
      return false;
    }

    // Only cache GET requests and read-only endpoints
    if (req.method !== 'GET') {
      return false;
    }

    // Don't cache if there are cache control headers
    if (req.headers['cache-control']?.includes('no-cache')) {
      return false;
    }

    // Only cache read-only endpoints
    return this.isReadOnlyRequest(req);
  }

  private createCacheKey(req: Request): string {
    const url = req.path;
    const params = req.query;

    // Sort query parameters for consistent caching
    const sortedParams = params ? Object.keys(params)
      .sort()
      .reduce((result: any, key) => {
        result[key] = params[key];
        return result;
      }, {}) : undefined;

    return `${url}:${JSON.stringify(sortedParams)}`;
  }

  private async handleRequestWithCache(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const cacheKey = this.createCacheKey(req);

    try {
      // Check cache first
      if (this.canCacheRequest(req)) {
        const cachedResponse = await this.cache!.get(req.path, req.query);

        if (cachedResponse) {
          this.logger.logCacheEvent('hit', cacheKey);
          this.metrics.recordCacheHit(req.path);

          // Set cached response headers
          Object.entries(cachedResponse.headers).forEach(([key, value]) => {
            if (key.toLowerCase() !== 'content-encoding') {
              res.setHeader(key, value);
            }
          });

          // Set cache control headers
          const maxAge = Math.floor((cachedResponse.ttl - (Date.now() - new Date(cachedResponse.timestamp).getTime())) / 1000);
          if (maxAge > 0) {
            res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
          }

          // Mark request as cached
          (req as any).cached = true;

          this.metrics.recordHttpRequest(
            req.method,
            req.path,
            cachedResponse.statusCode,
            1, // Very fast response time for cache hit
            0,
            JSON.stringify(cachedResponse.data).length
          );

          res.status(cachedResponse.statusCode).json(cachedResponse.data);
        }

        this.logger.logCacheEvent('miss', cacheKey);
        this.metrics.recordCacheMiss(req.path);
      }

      // If not cached, proceed with normal proxy logic
      await this.handleProxyRequest(req, res, next);

    } catch (error) {
      this.logger.error('Cache handling error', error as Error, { cacheKey });
      next(error);
    }
  }

  private async handleProxyRequest(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> {
    const startTime = performance.now();
    let retryCount = 0;

    try {
      // Check connection limits
      if (this.activeConnections >= this.config.proxy.connectionPool.maxConnections) {
        this.maxConnectionsReached++;
        this.logger.warn('Connection pool full', {
          activeConnections: this.activeConnections,
          maxConnections: this.config.proxy.connectionPool.maxConnections
        });

        res.status(503).json({
          error: 'Service Unavailable',
          message: 'Too many concurrent requests'
        });
      }

      this.activeConnections++;
      this.metrics.incrementActiveConnections();

      // Check circuit breaker
      if (this.circuitBreaker.getState().state === 'OPEN') {
        throw new Error('Circuit breaker is OPEN');
      }

      // Create the proxied request configuration
      const axiosConfig: AxiosRequestConfig = {
        method: req.method as any,
        url: `${this.config.algod.url}${req.path}`,
        headers: this.filterHeaders(req.headers),
        params: req.query,
        data: req.body,
        timeout: this.config.proxy.timeout,
        responseType: 'json',
        validateStatus: () => true // Don't throw on any status code
      };

      // Add the Algod API token
      axiosConfig.headers!['X-Algo-API-Token'] = this.config.algod.token;

      // Execute request with circuit breaker and retry logic
      const response = await this.circuitBreaker.execute(async () => {
        return await this.retryManager.executeWithRetry(async () => {
          retryCount++;
          return await axios(axiosConfig);
        });
      });

      const endTime = performance.now();
      const processingTime = endTime - startTime;

      // Record metrics
      this.metrics.recordHttpRequest(
        req.method,
        req.path,
        response.status,
        processingTime,
        req.socket.bytesRead || 0,
        response.data ? JSON.stringify(response.data).length : 0
      );

      this.metrics.recordAlgodRequest(req.path, req.method, processingTime);

      // Cache successful read-only responses
      if (this.canCacheRequest(req) && response.status >= 200 && response.status < 300) {
        await this.cache!.set(
          req.path,
          response.data,
          response.headers as Record<string, string>,
          response.status,
          req.query
        );
      }

      // Copy response headers
      Object.entries(response.headers).forEach(([key, value]) => {
        if (typeof value === 'string') {
          res.setHeader(key, value);
        }
      });

      // Add custom headers
      res.setHeader('X-Processing-Time', processingTime.toFixed(2));
      res.setHeader('X-Retry-Count', retryCount.toString());
      res.setHeader('X-Cache-Status', (req as any).cached ? 'HIT' : 'MISS');

      // Update Algod metrics
      if (response.data?.lastRound) {
        this.metrics.updateAlgodLastBlock(response.data.lastRound);
      }

      // Send response
      res.status(response.status).json(response.data);

      // Log successful request
      if (this.config.security.audit.logRequests) {
        this.logger.info('Request completed', {
          requestId: req.id,
          method: req.method,
          url: req.path,
          statusCode: response.status,
          processingTime,
          retryCount,
          cached: (req as any).cached
        });
      }

    } catch (error) {
      const endTime = performance.now();
      const processingTime = endTime - startTime;

      // Record error metrics
      this.metrics.recordHttpError(
        req.method,
        req.path,
        502,
        'proxy_error',
        processingTime
      );

      this.metrics.recordAlgodError(req.path, (error as Error).name);

      this.logger.error('Proxy request failed', error as Error, {
        requestId: req.id,
        method: req.method,
        url: req.path,
        processingTime,
        retryCount
      });

      // Send appropriate error response
      if ((error as Error).message.includes('Circuit breaker is OPEN')) {
        res.status(503).json({
          error: 'Service Temporarily Unavailable',
          message: 'Service is temporarily unavailable due to high error rates'
        });
      } else if ((error as Error).message.includes('timeout')) {
        res.status(504).json({
          error: 'Gateway Timeout',
          message: 'Request to upstream service timed out'
        });
      } else {
        res.status(502).json({
          error: 'Bad Gateway',
          message: 'Error communicating with upstream service'
        });
      }

    } finally {
      this.activeConnections--;
      this.metrics.decrementActiveConnections();
      this.metrics.updateConnectionPoolSize(this.activeConnections);
    }
  }

  private filterHeaders(headers: any): any {
    const filtered: any = {};

    // Remove hop-by-hop headers
    const hopByHopHeaders = [
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailers',
      'transfer-encoding',
      'upgrade'
    ];

    Object.entries(headers).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();

      if (!hopByHopHeaders.includes(lowerKey) &&
          !lowerKey.startsWith('x-forwarded') &&
          lowerKey !== 'host') {
        filtered[key] = value;
      }
    });

    return filtered;
  }

  private isWriteOperation(req: Request): boolean {
    const writeMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
    const writePaths = [
      '/v2/transactions',
      '/v2/transactions/sign',
      '/v2/transactions/signature',
      '/v2/rawtx'
    ];

    return writeMethods.includes(req.method) ||
           writePaths.some(path => req.path.includes(path));
  }

  // Create the Express middleware
  createMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Log write operations for tracking (TODO: send txid to tracker for point earning)
      if (this.isWriteOperation(req)) {
        this.logger.logAudit('write-operation', `${req.method} ${req.path}`, {
          requestId: req.id,
          method: req.method,
          path: req.path,
          userId: (req as any).userId,
          ip: req.ip
        });
      }

      // Handle request with caching if enabled
      if (this.canCacheRequest(req)) {
        return this.handleRequestWithCache(req, res, next);
      }

      // Handle normal proxy request
      return this.handleProxyRequest(req, res, next);
    };
  }

  // Get proxy statistics
  getStats() {
    return {
      activeConnections: this.activeConnections,
      maxConnectionsReached: this.maxConnectionsReached,
      circuitBreaker: this.circuitBreaker.getStats(),
      config: {
        maxConnections: this.config.proxy.connectionPool.maxConnections,
        timeout: this.config.proxy.timeout,
        retries: this.config.proxy.retries.maxAttempts
      }
    };
  }

  // Health check for the proxy
  async healthCheck(): Promise<{ status: 'pass' | 'fail' | 'warn'; responseTime: number; details: any }> {
    const startTime = performance.now();

    try {
      const testConfig: AxiosRequestConfig = {
        method: 'GET',
        url: `${this.config.algod.url}/v2/status`,
        headers: {
          'X-Algo-API-Token': this.config.algod.token
        },
        timeout: 5000
      };

      await this.retryManager.executeWithRetry(async () => {
        return await axios(testConfig);
      });

      const responseTime = performance.now() - startTime;

      return {
        status: 'pass',
        responseTime,
        details: {
          activeConnections: this.activeConnections,
          circuitBreakerState: this.circuitBreaker.getState().state,
          cacheEnabled: this.cache?.isHealthy() || false
        }
      };

    } catch (error) {
      return {
        status: 'fail',
        responseTime: performance.now() - startTime,
        details: {
          error: (error as Error).message,
          activeConnections: this.activeConnections,
          circuitBreakerState: this.circuitBreaker.getState().state
        }
      };
    }
  }

  // Cleanup resources
  destroy(): void {
    this.circuitBreaker.destroy();
    this.removeAllListeners();
  }
}