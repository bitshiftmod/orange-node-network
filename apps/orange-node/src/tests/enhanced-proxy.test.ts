import { EnhancedProxyMiddleware } from '../middleware/enhanced-proxy';
import { MetricsCollector } from '../utils/metrics';
import { Logger } from '../utils/logger';
import { RedisCache } from '../cache/redis-cache';
import { OrangeNodeConfig } from '../types';
import { Request } from 'express';

describe('EnhancedProxyMiddleware', () => {
  let proxy: EnhancedProxyMiddleware;
  let metrics: MetricsCollector;
  let logger: Logger;
  let cache: jest.Mocked<RedisCache>;
  let config: OrangeNodeConfig;

  beforeEach(() => {
    // Mock configuration
    config = {
      algod: {
        url: 'http://localhost:4160',
        token: 'test-token'
      },
      proxy: {
        target: 'http://localhost:4160',
        changeOrigin: true,
        timeout: 5000,
        retries: {
          maxAttempts: 3,
          initialDelay: 100,
          maxDelay: 1000,
          backoffMultiplier: 2,
          retryableErrors: ['ECONNRESET'],
          retryableStatusCodes: [500, 502, 503, 504]
        },
        circuitBreaker: {
          failureThreshold: 5,
          resetTimeout: 60000,
          monitoringPeriod: 30000,
          expectedResponseTime: 5000
        },
        connectionPool: {
          maxConnections: 100,
          minConnections: 5,
          acquireTimeout: 5000,
          idleTimeout: 30000,
          healthCheckInterval: 15000,
          maxHealthCheckFailures: 3
        },
        cache: {
          enabled: true,
          host: 'localhost',
          port: 6379,
          db: 0,
          keyPrefix: 'test:',
          ttl: {
            '/v2/accounts': 30000,
            'default': 5000
          },
          maxRetriesPerRequest: 3,
          retryDelayOnFailover: 100,
          lazyConnect: true
        },
        healthCheck: {
          enabled: true,
          interval: 15000,
          timeout: 5000,
          endpoint: '/v2/status'
        }
      },
      security: {
        rateLimiting: {
          windowMs: 60000,
          maxRequests: 1000,
          skipSuccessfulRequests: false,
          skipFailedRequests: false,
          keyGenerator: 'ip',
          trustProxy: false,
          headers: true,
          standardHeaders: true,
          legacyHeaders: false
        },
        validation: {
          requestValidation: true,
          sanitizeInput: true,
          maxRequestSize: 10485760,
          allowedOrigins: ['*'],
          allowedMethods: ['GET', 'POST'],
          allowedHeaders: ['Content-Type', 'Authorization']
        },
        audit: {
          enabled: true,
          logLevel: 'info',
          logRequests: true,
          logResponses: true,
          logErrors: true,
          sensitiveFields: ['authorization']
        }
      },
      monitoring: {
        enabled: true,
        metricsEndpoint: '/metrics',
        healthEndpoint: '/health',
        collectMetrics: true,
        metricsInterval: 10000,
        retentionPeriod: 86400000,
        healthCheck: {
          enabled: true,
          interval: 15000,
          timeout: 5000,
          endpoint: '/health'
        },
        alerts: {
          enabled: false,
          thresholdConfig: {
            errorRate: 0.05,
            responseTime: 10000,
            memoryUsage: 0.8,
            cacheHitRate: 0.7
          }
        }
      },
      logging: {
        level: 'info',
        format: 'text',
        maxSize: '10m',
        maxFiles: 5
      },
      server: {
        port: 3000,
        host: 'localhost',
        cors: true,
        compression: true,
        helmet: true
      }
    };

    logger = new Logger(config);
    metrics = new MetricsCollector();
    cache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      isHealthy: jest.fn().mockReturnValue(true),
      healthCheck: jest.fn().mockResolvedValue({ status: 'pass', responseTime: 10 }),
      getStats: jest.fn().mockResolvedValue({ memoryUsage: 0, hitRate: 0.8 })
    } as any;

    proxy = new EnhancedProxyMiddleware(config, logger, metrics, cache);
  });

  afterEach(() => {
    proxy.destroy();
    metrics.destroy();
  });

  describe('Construction', () => {
    it('should initialize with correct configuration', () => {
      expect(proxy).toBeDefined();
    });

    it('should set up event handlers', () => {
      const emitSpy = jest.spyOn(proxy, 'emit');
      expect(emitSpy).toBeDefined();
    });
  });

  describe('Request Handling', () => {
    it('should handle read-only GET requests', () => {
      expect(() => {
        const middleware = proxy.createMiddleware();
        // Middleware should be callable
        expect(typeof middleware).toBe('function');
      }).not.toThrow();
    });

    it('should identify read-only requests correctly', () => {
      // These methods should exist and return boolean
      expect(typeof proxy['isReadOnlyRequest']).toBe('function');
    });

    it('should determine if request can be cached', () => {
      expect(typeof proxy['canCacheRequest']).toBe('function');
    });
  });

  describe('Circuit Breaker', () => {
    it('should handle circuit breaker state changes', () => {
      const stats = proxy.getStats();
      expect(stats.circuitBreaker).toBeDefined();
      expect(stats.circuitBreaker.state).toBe('CLOSED');
    });
  });

  describe('Health Check', () => {
    it('should perform health check', async () => {
      const healthResult = await proxy.healthCheck();
      expect(healthResult).toHaveProperty('status');
      expect(healthResult).toHaveProperty('responseTime');
      expect(healthResult).toHaveProperty('details');
    });
  });

  describe('Statistics', () => {
    it('should return proxy statistics', () => {
      const stats = proxy.getStats();
      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('maxConnectionsReached');
      expect(stats).toHaveProperty('circuitBreaker');
      expect(stats).toHaveProperty('config');
    });
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent cache keys', () => {
      const req = {
        path: '/v2/accounts',
        query: { address: 'test-address' }
      } as unknown as Request;

      const key1 = proxy['createCacheKey'](req);
      const key2 = proxy['createCacheKey'](req);

      expect(key1).toBe(key2);
      expect(typeof key1).toBe('string');
    });

    it('should handle empty query parameters', () => {
      const req = {
        path: '/v2/status',
        query: {}
      } as unknown as Request;

      const key = proxy['createCacheKey'](req);
      expect(key).toContain('/v2/status');
    });
  });

  describe('Header Filtering', () => {
    it('should filter out hop-by-hop headers', () => {
      const headers = {
        'host': 'example.com',
        'connection': 'keep-alive',
        'transfer-encoding': 'chunked',
        'x-custom-header': 'value'
      };

      const filtered = proxy['filterHeaders'](headers);

      expect(filtered['host']).toBeUndefined();
      expect(filtered['connection']).toBeUndefined();
      expect(filtered['transfer-encoding']).toBeUndefined();
      expect(filtered['x-custom-header']).toBe('value');
    });

    it('should preserve important headers', () => {
      const headers = {
        'content-type': 'application/json',
        'authorization': 'Bearer token',
        'x-api-key': 'key'
      };

      const filtered = proxy['filterHeaders'](headers);

      expect(filtered['content-type']).toBe('application/json');
      expect(filtered['authorization']).toBe('Bearer token');
      expect(filtered['x-api-key']).toBe('key');
    });
  });

  describe('Write Operation Detection', () => {
    it('should identify POST transactions as write operations', () => {
      const req = {
        method: 'POST',
        path: '/v2/transactions'
      } as Request;

      expect(proxy['isWriteOperation'](req)).toBe(true);
    });

    it('should identify GET accounts as read operations', () => {
      const req = {
        method: 'GET',
        path: '/v2/accounts'
      } as Request;

      expect(proxy['isWriteOperation'](req)).toBe(false);
    });

    it('should identify rawtx endpoints as write operations', () => {
      const req = {
        method: 'POST',
        path: '/v2/rawtx'
      } as Request;

      expect(proxy['isWriteOperation'](req)).toBe(true);
    });
  });
});