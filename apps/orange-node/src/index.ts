import express, { Application, Request, Response, NextFunction } from 'express';
import compression from 'compression';
import { getConfig } from './config';
import { createLogger } from './utils/logger';
import { createMetricsCollector } from './utils/metrics';
import { RedisCache } from './cache/redis-cache';
import { HealthMonitor } from './health/health-monitor';
import { SecurityMiddleware } from './middleware/security';
import { EnhancedProxyMiddleware } from './middleware/enhanced-proxy';
import { MonitoringRoutes } from './routes/monitoring';
import { generateNonce } from './verify';

class OrangeNodeServer {
  private app: Application;
  private config: any;
  private logger: any;
  private metrics: any;
  private cache?: RedisCache;
  private healthMonitor!: HealthMonitor;
  private security!: SecurityMiddleware;
  private proxy!: EnhancedProxyMiddleware;
  private monitoringRoutes!: MonitoringRoutes;
  private server?: any;

  constructor() {
    this.config = getConfig();
    this.logger = createLogger(this.config);
    this.metrics = createMetricsCollector();

    this.app = express();
    this.setupGracefulShutdown();
  }

  private async initialize(): Promise<void> {
    try {
      this.logger.info('Orange Node starting...', {
        version: process.env['npm_package_version'] || '1.0.0',
        node: process.version,
        environment: process.env['NODE_ENV'] || 'development'
      });

      // Initialize Redis cache if enabled
      if (this.config.proxy.cache.enabled) {
        try {
          this.cache = new RedisCache(this.config.proxy.cache, this.logger);
          await this.cache.connect();
          this.logger.info('Redis cache initialized successfully');
        } catch (error) {
          this.logger.error('Failed to initialize Redis cache', error as Error);
          if (this.config.proxy.cache.enabled && !process.env['REDIS_OPTIONAL']) {
            throw error;
          }
        }
      }

      // Initialize health monitor
      this.healthMonitor = new HealthMonitor(
        this.config,
        this.logger,
        this.cache,
        this.metrics
      );

      // Initialize security middleware
      this.security = new SecurityMiddleware(this.config, this.logger);

      // Initialize enhanced proxy middleware
      this.proxy = new EnhancedProxyMiddleware(
        this.config,
        this.logger,
        this.metrics,
        this.cache
      );

      // Initialize monitoring routes
      this.monitoringRoutes = new MonitoringRoutes(
        this.metrics,
        this.healthMonitor,
        this.security,
        this.cache,
        this.proxy,
        this.logger
      );

      // Setup middleware and routes
      this.setupMiddleware();
      this.setupRoutes();

      this.logger.info('Orange Node Server initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Orange Node Server', error as Error);
      throw error;
    }
  }

  private setupMiddleware(): void {
    // Trust proxy for IP address detection
    if (this.config.server.trustProxy) {
      this.app.set('trust proxy', true);
    }

    // Security middleware
    if (this.config.server.helmet && this.security) {
      this.app.use(this.security.createHelmetMiddleware());
    }

    // CORS middleware
    if (this.config.server.cors && this.security) {
      this.app.use(this.security.createCorsMiddleware());
    }

    // Compression middleware - note: compression() has complex overloads
    if (this.config.server.compression) {
      this.app.use(compression() as any);
    }

    // Request ID assignment
    if (this.security) {
      this.app.use(this.security.assignRequestId());
    }

    // Request parsing
    this.app.use(express.json({ limit: this.config.security.validation.maxRequestSize }));
    this.app.use(express.urlencoded({ extended: true, limit: this.config.security.validation.maxRequestSize }));

    // Security and validation middleware
    if (this.security) {
      this.app.use(this.security.validateRequestSize());
      this.app.use(this.security.validateRequest());
      this.app.use(this.security.sanitizeInput());
      this.app.use(this.security.createRateLimitMiddleware());

      // Audit logging
      this.app.use(this.security.auditLog());

      // Authentication
      this.app.use(this.security.authenticate());
    }

    // Global error handling middleware
    this.app.use(this.handleErrors.bind(this));
  }

  private setupRoutes(): void {
    // Health and monitoring routes
    if (this.monitoringRoutes) {
      this.monitoringRoutes.registerRoutes(this.app);
    }

    // Orange API routes
    this.app.get('/orange/generate_nonce', this.handleGenerateNonce.bind(this));
    this.app.get('/version', (_req, res) => {
      res.json({
        message: 'Orange Node API',
        status: 'operational',
        timestamp: new Date().toISOString(),
        version: process.env['npm_package_version'] || '1.0.0'
      });
    });

    // Enhanced proxy middleware - should be last
    this.app.use('/', this.proxy.createMiddleware());

    // 404 handler
    this.app.use('*', this.handleNotFound.bind(this));
  }

  private async handleGenerateNonce(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId || req.ip || 'anonymous';
      const nonce = generateNonce(userId);

      this.logger.logAudit('nonce-generated', 'generate_nonce', {
        requestId: req.id,
        userId,
        ip: req.ip
      });

      res.json({
        success: true,
        nonce,
        userId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to generate nonce', error as Error, {
        requestId: req.id
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to generate nonce'
      });
    }
  }

  private handleNotFound(req: Request, res: Response): void {
    this.logger.warn('Route not found', {
      requestId: req.id,
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.url} not found`,
      requestId: req.id
    });
  }

  private handleErrors(error: Error, req: Request, res: Response, next: NextFunction): void {
    // Don't handle errors if headers have already been sent
    if (res.headersSent) {
      return next(error);
    }

    // Log the error
    this.logger.logError(req.path, req.method, error, 500, {
      requestId: req.id,
      userId: (req as any).userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Record error metrics
    this.metrics.recordHttpError(req.method, req.path, 500, error.name, 0);

    // Send error response
    let statusCode = 500;
    let message = 'Internal Server Error';

    // Handle specific error types
    if (error.name === 'ValidationError') {
      statusCode = 400;
      message = 'Validation Error';
    } else if (error.name === 'UnauthorizedError') {
      statusCode = 401;
      message = 'Unauthorized';
    } else if (error.name === 'ForbiddenError') {
      statusCode = 403;
      message = 'Forbidden';
    } else if (error.name === 'TooManyRequestsError') {
      statusCode = 429;
      message = 'Too Many Requests';
    }

    res.status(statusCode).json({
      error: error.name || 'Error',
      message,
      requestId: req.id,
      timestamp: new Date().toISOString()
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      this.logger.info(`Received ${signal}, starting graceful shutdown`);

      try {
        // Stop accepting new requests
        if (this.server) {
          this.server.close();
        }

        // Cleanup resources
        if (this.healthMonitor) {
          this.healthMonitor.stop();
        }

        if (this.proxy) {
          this.proxy.destroy();
        }

        if (this.cache) {
          await this.cache.disconnect();
        }

        this.logger.info('Graceful shutdown completed');
        process.exit(0);

      } catch (error) {
        this.logger.error('Error during graceful shutdown', error as Error);
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled rejection', new Error(String(reason)), { promise });
      shutdown('unhandledRejection');
    });
  }

  private validateAlgodConfig(): boolean {
    return !!(this.config.algod.url && this.config.algod.token);
  }

  public async start(): Promise<void> {
    try {
      await this.initialize();

      // Validate Algod configuration
      if (!this.validateAlgodConfig()) {
        throw new Error('Invalid Algod configuration. Please check ALGOD_URL and ALGOD_TOKEN.');
      }

      const port = this.config.server.port;
      const host = this.config.server.host;

      this.server = this.app.listen(port, host, () => {
        this.logger.info(`Orange Node Server started successfully`, {
          port,
          host,
          redisOptional: process.env['REDIS_OPTIONAL'] === 'true',
          cacheEnabled: this.config.proxy.cache.enabled,
          metricsEnabled: this.config.monitoring.enabled,
          securityEnabled: this.config.security.audit.enabled
        });

        // Log system information
        this.logger.info('System information', {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          pid: process.pid,
          memory: process.memoryUsage(),
          uptime: process.uptime()
        });
      });

      // Handle server errors
      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          this.logger.error(`Port ${port} is already in use`);
        } else if (error.code === 'EADDRNOTAVAIL') {
          this.logger.error(`Host ${host} is not available`);
        } else {
          this.logger.error('Server error', error);
        }
        process.exit(1);
      });

    } catch (error) {
      this.logger.error('Failed to start Orange Node Server', error as Error);
      process.exit(1);
    }
  }
}

// Start the server
const server = new OrangeNodeServer();
server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
