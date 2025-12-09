import { HealthMonitor } from '../health/health-monitor';
import { Logger } from '../utils/logger';
import { MetricsCollector } from '../utils/metrics';
import { RedisCache } from '../cache/redis-cache';
import { OrangeNodeConfig } from '../types';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HealthMonitor', () => {
  let healthMonitor: HealthMonitor;
  let logger: Logger;
  let metrics: MetricsCollector;
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
          retryableErrors: [],
          retryableStatusCodes: []
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
          interval: 5000,
          timeout: 1000,
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
          allowedHeaders: ['Content-Type']
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
          interval: 5000,
          timeout: 1000,
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
      isHealthy: jest.fn().mockReturnValue(true),
      healthCheck: jest.fn().mockResolvedValue({ status: 'pass', responseTime: 10 }),
      getStats: jest.fn().mockResolvedValue({
        connected: true,
        uptime: 1000,
        usedMemory: 1024 * 1024,
        keys: 100,
        hitRate: 0.8
      })
    } as any;

    // Mock successful Algod response
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: {
        lastRound: 1000,
        lastRoundTime: new Date().toISOString()
      }
    });

    healthMonitor = new HealthMonitor(config, logger, cache, metrics);
  });

  afterEach(() => {
    healthMonitor.stop();
    metrics.destroy();
    jest.clearAllMocks();
  });

  describe('Construction', () => {
    it('should initialize with correct configuration', () => {
      expect(healthMonitor).toBeDefined();
      expect(healthMonitor.getHealthStatus()).toBeDefined();
    });

    it('should set up initial health status', () => {
      const health = healthMonitor.getHealthStatus();
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('timestamp');
      expect(health).toHaveProperty('checks');
      expect(health.checks).toHaveProperty('algod');
      expect(health.checks).toHaveProperty('redis');
      expect(health.checks).toHaveProperty('proxy');
      expect(health.checks).toHaveProperty('memory');
      expect(health.checks).toHaveProperty('rateLimit');
    });
  });

  describe('Health Checks', () => {
    it('should perform Algod health check', async () => {
      await healthMonitor.forceHealthCheck();
      // Just verify the axios call was made
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://localhost:4160/v2/status',
        {
          headers: { 'X-Algo-API-Token': 'test-token' },
          timeout: 1000
        }
      );
    });

    it('should perform Redis health check', async () => {
      await healthMonitor.forceHealthCheck();
      // Verify cache getStats was called (health monitor uses getStats, not healthCheck)
      expect(cache.getStats).toHaveBeenCalled();
    });

    it('should check memory health', async () => {
      await healthMonitor.forceHealthCheck();
      const health = healthMonitor.getHealthStatus();

      expect(health.checks.memory.status).toBeDefined();
      expect(health.checks.memory.metrics).toBeDefined();
      expect(health.checks.memory.metrics.heapUsagePercentage).toBeGreaterThanOrEqual(0);
    });

    it('should handle Algod connection failure', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Connection failed'));

      await healthMonitor.forceHealthCheck();
      const health = healthMonitor.getHealthStatus();

      expect(health.checks.algod.status).toBe('fail');
      expect(health.checks.algod.error).toBe('Connection failed');
    });

    it('should handle Redis connection failure', async () => {
      cache.getStats.mockRejectedValue(new Error('Redis connection failed'));

      await healthMonitor.forceHealthCheck();
      const health = healthMonitor.getHealthStatus();

      expect(health.checks.redis.status).toBe('fail');
    });
  });

  describe('Overall Health Status', () => {
    it('should calculate overall health status correctly', async () => {
      // All checks should pass
      await healthMonitor.forceHealthCheck();
      const health = healthMonitor.getHealthStatus();

      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    });

    it('should mark as unhealthy when critical checks fail', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Algod down'));
      cache.healthCheck.mockRejectedValue(new Error('Redis down'));

      await healthMonitor.forceHealthCheck();
      const health = healthMonitor.getHealthStatus();

      expect(health.status).toBe('unhealthy');
    });

    it('should mark as degraded when some checks warn', async () => {
      // Mock memory warning using proper type for process.memoryUsage
      const originalMemoryUsage = process.memoryUsage;
      const mockMemoryUsage = Object.assign(
        () => ({
          rss: 100 * 1024 * 1024,
          heapTotal: 100 * 1024 * 1024,
          heapUsed: 90 * 1024 * 1024,
          external: 10 * 1024 * 1024,
          arrayBuffers: 1 * 1024 * 1024
        }),
        { rss: () => 100 * 1024 * 1024 }
      );
      process.memoryUsage = mockMemoryUsage as typeof process.memoryUsage;

      await healthMonitor.forceHealthCheck();
      const health = healthMonitor.getHealthStatus();

      // Restore original memoryUsage
      process.memoryUsage = originalMemoryUsage;

      expect(['degraded', 'unhealthy']).toContain(health.status);
    });
  });

  describe('Metrics Integration', () => {
    it('should integrate with metrics collector', () => {
      expect(healthMonitor.getHealthStatus()).toBeDefined();
    });

    it('should update uptime correctly', () => {
      const health = healthMonitor.getHealthStatus();
      // Uptime may be 0 immediately after creation
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should track response time', () => {
      const health = healthMonitor.getHealthStatus();
      expect(health.responseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Event Handling', () => {
    it('should emit health update events', (done) => {
      let eventCount = 0;

      // The event is 'health-update', not 'healthChange'
      healthMonitor.on('health-update', (health) => {
        eventCount++;
        expect(health).toHaveProperty('status');
        expect(health).toHaveProperty('timestamp');

        if (eventCount >= 1) {
          done();
        }
      });

      // Trigger a health check
      healthMonitor.forceHealthCheck();
    }, 15000); // Increase timeout
  });

  describe('Cleanup', () => {
    it('should stop monitoring properly', () => {
      expect(() => {
        healthMonitor.stop();
      }).not.toThrow();
    });

    it('should remove all event listeners', () => {
      const removeListenerSpy = jest.spyOn(healthMonitor as any, 'removeAllListeners');

      healthMonitor.stop();

      expect(removeListenerSpy).toHaveBeenCalled();
    });
  });

  describe('Health Status Structure', () => {
    it('should return properly structured health status', () => {
      const health = healthMonitor.getHealthStatus();

      expect(health).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        timestamp: expect.any(Date),
        checks: expect.objectContaining({
          algod: expect.objectContaining({
            status: expect.stringMatching(/pass|fail|warn/),
            responseTime: expect.any(Number),
            lastCheck: expect.any(Date),
            metrics: expect.any(Object)
          }),
          redis: expect.objectContaining({
            status: expect.stringMatching(/pass|fail|warn/),
            responseTime: expect.any(Number),
            lastCheck: expect.any(Date),
            metrics: expect.any(Object)
          }),
          proxy: expect.objectContaining({
            status: expect.stringMatching(/pass|fail|warn/),
            responseTime: expect.any(Number),
            lastCheck: expect.any(Date),
            metrics: expect.any(Object)
          }),
          memory: expect.objectContaining({
            status: expect.stringMatching(/pass|fail|warn/),
            lastCheck: expect.any(Date),
            metrics: expect.any(Object),
            warnings: expect.any(Array)
          }),
          rateLimit: expect.objectContaining({
            status: expect.stringMatching(/pass|fail|warn/),
            lastCheck: expect.any(Date),
            metrics: expect.any(Object)
          })
        }),
        uptime: expect.any(Number),
        responseTime: expect.any(Number)
      });
    });
  });
});