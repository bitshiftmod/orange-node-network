import { Request, Response } from 'express';
import { MetricsCollector } from '../utils/metrics';
import { HealthMonitor } from '../health/health-monitor';
import { SecurityMiddleware } from '../middleware/security';
import { RedisCache } from '../cache/redis-cache';
import { EnhancedProxyMiddleware } from '../middleware/enhanced-proxy';
import { Logger } from '../utils/logger';

// Extend Express Request to include id property
declare module 'express' {
  interface Request {
    id?: string;
  }
}

export class MonitoringRoutes {
  private metrics: MetricsCollector;
  private healthMonitor: HealthMonitor;
  private security: SecurityMiddleware;
  private cache?: RedisCache;
  private proxy: EnhancedProxyMiddleware;
  private logger: Logger;

  constructor(
    metrics: MetricsCollector,
    healthMonitor: HealthMonitor,
    security: SecurityMiddleware,
    cache: RedisCache | undefined,
    proxy: EnhancedProxyMiddleware,
    logger: Logger
  ) {
    this.metrics = metrics;
    this.healthMonitor = healthMonitor;
    this.security = security;
    if (cache) { this.cache = cache; }
    this.proxy = proxy;
    this.logger = logger;
  }

  // Prometheus metrics endpoint
  async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = await this.metrics.getPrometheusMetrics();

      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.send(metrics);

      this.logger.info('Metrics endpoint accessed', {
        requestId: req.id,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });

    } catch (error) {
      this.logger.error('Failed to get metrics', error as Error, {
        requestId: req.id
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve metrics'
      });
    }
  }

  // Health check endpoint (detailed)
  async getHealth(req: Request, res: Response): Promise<void> {
    try {
      const health = this.healthMonitor.getHealthStatus();

      const statusCode = health.status === 'healthy' ? 200 :
                        health.status === 'degraded' ? 200 : 503;

      res.status(statusCode).json({
        status: health.status,
        timestamp: health.timestamp,
        uptime: health.uptime,
        responseTime: health.responseTime,
        checks: health.checks,
        version: process.env['npm_package_version'] || '1.0.0',
        node: {
          version: process.version,
          platform: process.platform,
          arch: process.arch
        }
      });

      this.logger.info('Health check endpoint accessed', {
        requestId: req.id,
        status: health.status,
        statusCode,
        ip: req.ip
      });

    } catch (error) {
      this.logger.error('Health check failed', error as Error, {
        requestId: req.id
      });

      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        message: (error as Error).message
      });
    }
  }

  // Simple health check endpoint (for load balancers)
  async getHealthSimple(_req: Request, res: Response): Promise<void> {
    try {
      const health = this.healthMonitor.getHealthStatus();
      const statusCode = health.status === 'healthy' ? 200 : 503;

      res.status(statusCode).send(statusCode === 200 ? 'OK' : 'Service Unavailable');

    } catch (error) {
      res.status(503).send('Service Unavailable');
    }
  }

  // Readiness check endpoint
  async getReadiness(_req: Request, res: Response): Promise<void> {
    try {
      const checks = await Promise.allSettled([
        this.healthMonitor.forceHealthCheck(),
        this.cache?.healthCheck(),
        this.proxy.healthCheck()
      ]);

      const allReady = checks.every(check => check.status === 'fulfilled');
      const statusCode = allReady ? 200 : 503;

      const readinessInfo = {
        ready: allReady,
        timestamp: new Date().toISOString(),
        checks: {
          healthMonitor: checks[0].status === 'fulfilled' ? 'pass' : 'fail',
          cache: checks[1]?.status === 'fulfilled' ? 'pass' : 'skip',
          proxy: checks[2]?.status === 'fulfilled' ? 'pass' : 'fail'
        }
      };

      if (checks[1]?.status === 'rejected') {
        (readinessInfo as any).cacheError = (checks[1] as PromiseRejectedResult).reason.message;
      }

      if (checks[2]?.status === 'rejected') {
        (readinessInfo as any).proxyError = (checks[2] as PromiseRejectedResult).reason.message;
      }

      res.status(statusCode).json(readinessInfo);

    } catch (error) {
      res.status(503).json({
        ready: false,
        error: (error as Error).message
      });
    }
  }

  // Liveness check endpoint
  async getLiveness(_req: Request, res: Response): Promise<void> {
    try {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();

      // Basic liveness check - process should respond within reasonable time
      const maxResponseTime = 5000; // 5 seconds
      const startTime = Date.now();

      // Simple operation to verify process is responsive
      JSON.stringify({ test: true });

      const responseTime = Date.now() - startTime;

      const isLive = responseTime < maxResponseTime && uptime > 0;
      const statusCode = isLive ? 200 : 503;

      res.status(statusCode).json({
        alive: isLive,
        uptime: Math.floor(uptime),
        memory: {
          used: Math.floor(memoryUsage.heapUsed / 1024 / 1024), // MB
          total: Math.floor(memoryUsage.heapTotal / 1024 / 1024), // MB
          percentage: Math.floor((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
        },
        responseTime
      });

    } catch (error) {
      res.status(503).json({
        alive: false,
        error: (error as Error).message
      });
    }
  }

  // Detailed metrics endpoint (JSON format)
  async getMetricsJSON(req: Request, res: Response): Promise<void> {
    try {
      const nodeMetrics = this.metrics.getNodeMetrics();
      const health = this.healthMonitor.getHealthStatus();
      const proxyStats = this.proxy.getStats();

      let cacheStats = null;
      if (this.cache) {
        cacheStats = await this.cache.getStats();
      }

      const metrics = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env['npm_package_version'] || '1.0.0',
        node: {
          version: process.version,
          platform: process.platform,
          arch: process.arch,
          pid: process.pid
        },
        health: {
          status: health.status,
          responseTime: health.responseTime,
          uptime: health.uptime
        },
        metrics: nodeMetrics,
        proxy: proxyStats,
        cache: cacheStats,
        circuitBreaker: {
          state: proxyStats.circuitBreaker.state,
          failureCount: proxyStats.circuitBreaker.failureCount
        }
      };

      res.json(metrics);

    } catch (error) {
      this.logger.error('Failed to get JSON metrics', error as Error, {
        requestId: req.id
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve metrics'
      });
    }
  }

  // Audit logs endpoint
  async getAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt((req.query['limit'] as string) || '100');
      const offset = parseInt((req.query['offset'] as string) || '0');

      const logs = this.security.getAuditLogs(limit, offset);
      const stats = this.security.getAuditStats();

      res.json({
        logs,
        stats,
        pagination: {
          limit,
          offset,
          total: logs.length
        }
      });

    } catch (error) {
      this.logger.error('Failed to get audit logs', error as Error, {
        requestId: req.id
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve audit logs'
      });
    }
  }

  // Configuration endpoint (exposes non-sensitive config)
  async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const config = {
        proxy: {
          timeout: process.env['PROXY_TIMEOUT'] || 30000,
          maxRetries: process.env['MAX_RETRIES'] || 3,
          circuitBreaker: {
            failureThreshold: process.env['CIRCUIT_BREAKER_FAILURES'] || 5,
            resetTimeout: process.env['CIRCUIT_BREAKER_TIMEOUT'] || 60000
          }
        },
        security: {
          rateLimiting: {
            windowMs: process.env['RATE_LIMIT_WINDOW'] || 60000,
            maxRequests: process.env['RATE_LIMIT_MAX'] || 1000
          }
        },
        cache: {
          enabled: process.env['ENABLE_CACHE'] !== 'false',
          ttl: {
            accounts: 30000,
            blocks: 60000,
            transactions: 30000,
            assets: 600000
          }
        }
      };

      res.json(config);

    } catch (error) {
      this.logger.error('Failed to get config', error as Error, {
        requestId: req.id
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve configuration'
      });
    }
  }

  // System info endpoint
  async getSystemInfo(req: Request, res: Response): Promise<void> {
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      const systemInfo = {
        process: {
          pid: process.pid,
          ppid: process.ppid,
          uptime: process.uptime(),
          version: process.version,
          versions: process.versions,
          arch: process.arch,
          platform: process.platform,
          title: process.title,
          execPath: process.execPath,
          execArgv: process.execArgv,
          argv: process.argv,
          env: {
            NODE_ENV: process.env['NODE_ENV'],
            PORT: process.env['PORT']
          }
        },
        memory: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
          arrayBuffers: memUsage.arrayBuffers,
          heapUsagePercentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        },
        resource: process.resourceUsage()
      };

      res.json(systemInfo);

    } catch (error) {
      this.logger.error('Failed to get system info', error as Error, {
        requestId: req.id
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve system information'
      });
    }
  }

  // Clear cache endpoint (for maintenance)
  async clearCache(req: Request, res: Response): Promise<void> {
    try {
      if (!this.cache) {
        res.status(501).json({
          error: 'Not Implemented',
          message: 'Cache is not enabled'
        });
        return;
      }

      await this.cache.clear();

      this.logger.logAudit('cache-cleared', 'cache', {
        requestId: req.id,
        userId: (req as any).userId,
        ip: req.ip
      });

      res.json({
        message: 'Cache cleared successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to clear cache', error as Error, {
        requestId: req.id
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to clear cache'
      });
    }
  }

  // Reset circuit breaker endpoint (for maintenance)
  async resetCircuitBreaker(req: Request, res: Response): Promise<void> {
    try {
      const circuitBreaker = this.proxy.getStats().circuitBreaker;

      // This would require exposing a reset method in the proxy
      // For now, just return the current state
      res.json({
        message: 'Circuit breaker status',
        state: circuitBreaker.state,
        failureCount: circuitBreaker.failureCount,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to reset circuit breaker', error as Error, {
        requestId: req.id
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to reset circuit breaker'
      });
    }
  }

  // Register all monitoring routes
  registerRoutes(app: any): void {
    const router = app.router || app;

    // Health and metrics endpoints
    router.get('/health', this.getHealth.bind(this));
    router.get('/health/simple', this.getHealthSimple.bind(this));
    router.get('/ready', this.getReadiness.bind(this));
    router.get('/live', this.getLiveness.bind(this));
    router.get('/metrics', this.getMetrics.bind(this));
    router.get('/metrics/json', this.getMetricsJSON.bind(this));

    // Audit and security endpoints
    router.get('/audit/logs', this.getAuditLogs.bind(this));
    router.get('/config', this.getConfig.bind(this));
    router.get('/system', this.getSystemInfo.bind(this));

    // Maintenance endpoints
    router.post('/cache/clear', this.clearCache.bind(this));
    router.post('/circuit-breaker/reset', this.resetCircuitBreaker.bind(this));

    this.logger.info('Monitoring routes registered');
  }
}