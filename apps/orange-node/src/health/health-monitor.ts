import axios from 'axios';
import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import {
  HealthStatus,
  AlgodHealthCheck,
  RedisHealthCheck,
  ProxyHealthCheck,
  MemoryHealthCheck,
  RateLimitHealthCheck,
  OrangeNodeConfig
} from '../types';
import { Logger } from '../utils/logger';
import { RedisCache } from '../cache/redis-cache';
import { MetricsCollector } from '../utils/metrics';

export class HealthMonitor extends EventEmitter {
  private config: OrangeNodeConfig;
  private logger: Logger;
  private cache?: RedisCache;
  private metrics: MetricsCollector;
  private healthCheckInterval?: NodeJS.Timeout;
  private currentHealth: HealthStatus;
  private startTime: number;

  constructor(config: OrangeNodeConfig, logger: Logger, cache?: RedisCache, metrics?: MetricsCollector) {
    super();
    this.config = config;
    this.logger = logger;
    if (cache) {
      this.cache = cache;
    }
    this.metrics = metrics || new MetricsCollector();
    this.startTime = Date.now();

    this.currentHealth = {
      status: 'healthy',
      timestamp: new Date(),
      checks: {
        algod: this.createDefaultAlgodHealth(),
        redis: this.createDefaultRedisHealth(),
        proxy: this.createDefaultProxyHealth(),
        memory: this.createDefaultMemoryHealth(),
        rateLimit: this.createDefaultRateLimitHealth()
      },
      uptime: 0,
      responseTime: 0
    };

    this.startHealthMonitoring();
  }

  private createDefaultAlgodHealth(): AlgodHealthCheck {
    return {
      status: 'warn',
      lastCheck: new Date(),
      responseTime: 0,
      metrics: {
        lastRound: 0,
        connections: 0,
        pendingRequests: 0,
        successfulRequests: 0,
        failedRequests: 0
      }
    };
  }

  private createDefaultRedisHealth(): RedisHealthCheck {
    return {
      status: 'warn',
      lastCheck: new Date(),
      responseTime: 0,
      metrics: {
        connected: false,
        uptime: 0,
        usedMemory: 0,
        totalKeys: 0,
        hitRate: 0
      }
    };
  }

  private createDefaultProxyHealth(): ProxyHealthCheck {
    return {
      status: 'warn',
      lastCheck: new Date(),
      responseTime: 0,
      metrics: {
        activeConnections: 0,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        requestQueueSize: 0
      }
    };
  }

  private createDefaultMemoryHealth(): MemoryHealthCheck {
    return {
      status: 'pass',
      lastCheck: new Date(),
      metrics: {
        heapUsed: 0,
        heapTotal: 0,
        rss: 0,
        external: 0,
        arrayBuffers: 0,
        heapUsagePercentage: 0
      }
    };
  }

  private createDefaultRateLimitHealth(): RateLimitHealthCheck {
    return {
      status: 'pass',
      lastCheck: new Date(),
      metrics: {
        totalHits: 0,
        totalMisses: 0,
        currentRequestsPerSecond: 0,
        blockedRequests: 0,
        averageWaitTime: 0
      }
    };
  }

  private startHealthMonitoring(): void {
    if (this.config.monitoring.healthCheck.enabled) {
      // Run initial health check
      this.runHealthCheck().catch(error => {
        this.logger.error('Initial health check failed', error);
      });

      // Schedule periodic health checks
      this.healthCheckInterval = setInterval(() => {
        this.runHealthCheck().catch(error => {
          this.logger.error('Health check failed', error);
        });
      }, this.config.monitoring.healthCheck.interval);
    }
  }

  private async runHealthCheck(): Promise<void> {
    const startTime = performance.now();

    try {
      const checkPromises = [
        this.checkAlgodHealth(),
        this.checkRedisHealth(),
        this.checkProxyHealth(),
        this.checkMemoryHealth(),
        this.checkRateLimitHealth()
      ];

      const results = await Promise.allSettled(checkPromises);

      this.currentHealth.checks.algod = results[0]!.status === 'fulfilled' ? (results[0] as PromiseFulfilledResult<AlgodHealthCheck>).value : this.createDefaultAlgodHealth();
      this.currentHealth.checks.redis = results[1]!.status === 'fulfilled' ? (results[1] as PromiseFulfilledResult<RedisHealthCheck>).value : this.createDefaultRedisHealth();
      this.currentHealth.checks.proxy = results[2]!.status === 'fulfilled' ? (results[2] as PromiseFulfilledResult<ProxyHealthCheck>).value : this.createDefaultProxyHealth();
      this.currentHealth.checks.memory = results[3]!.status === 'fulfilled' ? (results[3] as PromiseFulfilledResult<MemoryHealthCheck>).value : this.createDefaultMemoryHealth();
      this.currentHealth.checks.rateLimit = results[4]!.status === 'fulfilled' ? (results[4] as PromiseFulfilledResult<RateLimitHealthCheck>).value : this.createDefaultRateLimitHealth();

      this.currentHealth.responseTime = performance.now() - startTime;
      this.currentHealth.timestamp = new Date();
      this.currentHealth.uptime = Date.now() - this.startTime;

      // Determine overall health status
      this.currentHealth.status = this.calculateOverallHealth();

      // Log health status (convert to pass/warn/fail for logging)
      const logStatus = this.currentHealth.status === 'healthy' ? 'pass' :
                       this.currentHealth.status === 'degraded' ? 'warn' : 'fail';
      this.logger.logHealthCheck('overall', logStatus, this.currentHealth.responseTime, {
        uptime: this.currentHealth.uptime,
        checks: {
          algod: this.currentHealth.checks.algod.status,
          redis: this.currentHealth.checks.redis.status,
          proxy: this.currentHealth.checks.proxy.status,
          memory: this.currentHealth.checks.memory.status,
          rateLimit: this.currentHealth.checks.rateLimit.status
        }
      });

      // Check for alerts
      this.checkHealthAlerts();

      // Emit health update event
      this.emit('health-update', this.currentHealth);

    } catch (error) {
      this.logger.error('Health check failed', error as Error);
      this.currentHealth.status = 'unhealthy';
      this.currentHealth.responseTime = performance.now() - startTime;
    }
  }

  private calculateOverallHealth(): 'healthy' | 'degraded' | 'unhealthy' {
    const checks = [
      this.currentHealth.checks.algod,
      this.currentHealth.checks.redis,
      this.currentHealth.checks.proxy,
      this.currentHealth.checks.memory,
      this.currentHealth.checks.rateLimit
    ];

    const failCount = checks.filter(check => check.status === 'fail').length;
    const warnCount = checks.filter(check => check.status === 'warn').length;

    if (failCount > 0) {
      return 'unhealthy';
    } else if (warnCount > 0) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  private async checkAlgodHealth(): Promise<AlgodHealthCheck> {
    const startTime = performance.now();

    try {
      const response = await axios.get(
        `${this.config.algod.url}${this.config.proxy.healthCheck.endpoint}`,
        {
          headers: {
            'X-Algo-API-Token': this.config.algod.token
          },
          timeout: this.config.proxy.healthCheck.timeout
        }
      );

      const responseTime = performance.now() - startTime;
      const data = response.data;

      const health: AlgodHealthCheck = {
        status: response.status === 200 ? 'pass' : 'warn',
        responseTime,
        lastCheck: new Date(),
        metrics: {
          lastRound: data.lastRound || 0,
          ...(data.lastRound ? { lastBlockTime: new Date(data.lastRound * 1000) } : {}),
          connections: 0, // Placeholder - would need async metrics.get()
          pendingRequests: 0, // Would need to be tracked separately
          successfulRequests: 0, // Placeholder
          failedRequests: 0 // Placeholder
        }
      };

      return health;

    } catch (error) {
      const responseTime = performance.now() - startTime;
      const health: AlgodHealthCheck = {
        status: 'fail',
        responseTime,
        lastCheck: new Date(),
        error: (error as Error).message,
        metrics: {
          lastRound: 0,
          connections: 0,
          pendingRequests: 0,
          successfulRequests: 0,
          failedRequests: 0
        }
      };

      return health;
    }
  }

  private async checkRedisHealth(): Promise<RedisHealthCheck> {
    const startTime = performance.now();

    try {
      if (!this.cache || !this.config.proxy.cache.enabled) {
        return {
          status: 'pass',
          responseTime: 0,
          lastCheck: new Date(),
          metrics: {
            connected: false,
            uptime: 0,
            usedMemory: 0,
            totalKeys: 0,
            hitRate: 0
          }
        };
      }

      const stats = await this.cache.getStats();
      const responseTime = performance.now() - startTime;

      const health: RedisHealthCheck = {
        status: stats.connected ? 'pass' : 'warn',
        responseTime,
        lastCheck: new Date(),
        metrics: {
          connected: stats.connected,
          uptime: stats.uptime || 0,
          usedMemory: stats.usedMemory || 0,
          totalKeys: stats.keys || 0,
          hitRate: stats.hitRate || 0
        }
      };

      return health;

    } catch (error) {
      const responseTime = performance.now() - startTime;
      const health: RedisHealthCheck = {
        status: 'fail',
        responseTime,
        lastCheck: new Date(),
        error: (error as Error).message,
        metrics: {
          connected: false,
          uptime: 0,
          usedMemory: 0,
          totalKeys: 0,
          hitRate: 0
        }
      };

      return health;
    }
  }

  private async checkProxyHealth(): Promise<ProxyHealthCheck> {
    const startTime = performance.now();

    try {
      // Note: metrics.get() returns Promise in newer prom-client, using placeholders

      const health: ProxyHealthCheck = {
        status: 'pass',
        responseTime: performance.now() - startTime,
        lastCheck: new Date(),
        metrics: {
          activeConnections: 0, // Placeholder - would need async metrics.get()
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          averageResponseTime: 0, // Would need calculation from histogram
          requestQueueSize: 0 // Would need to be tracked separately
        }
      };

      return health;

    } catch (error) {
      const responseTime = performance.now() - startTime;
      const health: ProxyHealthCheck = {
        status: 'fail',
        responseTime,
        lastCheck: new Date(),
        error: (error as Error).message,
        metrics: {
          activeConnections: 0,
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          averageResponseTime: 0,
          requestQueueSize: 0
        }
      };

      return health;
    }
  }

  private async checkMemoryHealth(): Promise<MemoryHealthCheck> {
    try {
      const memUsage = process.memoryUsage();
      const heapUsagePercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      const warnings: string[] = [];

      if (heapUsagePercentage > 90) {
        status = 'fail';
        warnings.push(`High heap usage: ${heapUsagePercentage.toFixed(2)}%`);
      } else if (heapUsagePercentage > 75) {
        status = 'warn';
        warnings.push(`High heap usage: ${heapUsagePercentage.toFixed(2)}%`);
      }

      const rssMB = memUsage.rss / 1024 / 1024;
      if (rssMB > 1024) {
        status = status === 'fail' ? 'fail' : 'warn';
        warnings.push(`High RSS: ${rssMB.toFixed(2)} MB`);
      }

      const health: MemoryHealthCheck = {
        status,
        lastCheck: new Date(),
        metrics: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          rss: memUsage.rss,
          external: memUsage.external,
          arrayBuffers: memUsage.arrayBuffers || 0,
          heapUsagePercentage
        },
        ...(warnings.length > 0 ? { warnings } : {})
      };

      return health;

    } catch (error) {
      const health: MemoryHealthCheck = {
        status: 'fail',
        lastCheck: new Date(),
        metrics: {
          heapUsed: 0,
          heapTotal: 0,
          rss: 0,
          external: 0,
          arrayBuffers: 0,
          heapUsagePercentage: 0
        },
        warnings: ['Memory check failed']
      };

      return health;
    }
  }

  private async checkRateLimitHealth(): Promise<RateLimitHealthCheck> {
    try {
      // Note: metrics.get() returns Promise in newer prom-client, using placeholders
      const totalHits = 0;
      const blockedRequests = 0; // Placeholder

      // Calculate current requests per second (simplified)
      const nodeMetrics = this.metrics.getNodeMetrics();
      const currentRPS = nodeMetrics.throughputMetrics.requestsPerSecond;

      const health: RateLimitHealthCheck = {
        status: 'pass',
        lastCheck: new Date(),
        metrics: {
          totalHits,
          totalMisses: 0,
          currentRequestsPerSecond: currentRPS,
          blockedRequests,
          averageWaitTime: 0
        }
      };

      return health;

    } catch (error) {
      const health: RateLimitHealthCheck = {
        status: 'fail',
        lastCheck: new Date(),
        metrics: {
          totalHits: 0,
          totalMisses: 0,
          currentRequestsPerSecond: 0,
          blockedRequests: 0,
          averageWaitTime: 0
        }
      };

      return health;
    }
  }

  private checkHealthAlerts(): void {
    // Check for critical issues
    if (this.currentHealth.status === 'unhealthy') {
      this.logger.error('System health is unhealthy', undefined, {
        checks: this.currentHealth.checks
      });
      this.emit('health-alert', {
        severity: 'critical',
        message: 'System health is unhealthy',
        details: this.currentHealth
      });
    } else if (this.currentHealth.status === 'degraded') {
      this.logger.warn('System health is degraded', {
        checks: this.currentHealth.checks
      });
      this.emit('health-alert', {
        severity: 'warning',
        message: 'System health is degraded',
        details: this.currentHealth
      });
    }
  }

  getHealthStatus(): HealthStatus {
    return this.currentHealth;
  }

  async forceHealthCheck(): Promise<HealthStatus> {
    await this.runHealthCheck();
    return this.currentHealth;
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined as any;
    }
    this.removeAllListeners();
  }
}
