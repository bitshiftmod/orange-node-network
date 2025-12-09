import winston from 'winston';
import { OrangeNodeConfig } from '../types';

class Logger {
  private logger: winston.Logger;
  private auditLogger: winston.Logger;

  constructor(config: OrangeNodeConfig) {
    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          config.logging.format === 'json'
            ? winston.format.json()
            : winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
              )
        )
      })
    ];

    if (config.logging.file) {
      transports.push(
        new winston.transports.File({
          filename: config.logging.file,
          maxsize: this.parseSize(config.logging.maxSize),
          maxFiles: config.logging.maxFiles,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        })
      );
    }

    this.logger = winston.createLogger({
      level: config.logging.level,
      transports,
      defaultMeta: {
        service: 'orange-node',
        version: process.env['npm_package_version'] || '1.0.0'
      }
    });

    // Separate audit logger for security and compliance
    this.auditLogger = winston.createLogger({
      level: config.security.audit.logLevel,
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      ],
      defaultMeta: {
        service: 'orange-node-audit',
        type: 'audit'
      }
    });

    if (config.logging.file) {
      const auditFile = config.logging.file.replace('.log', '-audit.log');
      this.auditLogger.add(
        new winston.transports.File({
          filename: auditFile,
          maxsize: this.parseSize(config.logging.maxSize),
          maxFiles: config.logging.maxFiles,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      );
    }
  }

  private parseSize(size: string, unit = ''): number {
    const units: Record<string, number> = {
      b: 1,
      k: 1024,
      m: 1024 * 1024,
      g: 1024 * 1024 * 1024
    };

    const match = size.toLowerCase().match(/^(\d+)([kmg]?)b?$/);
    if (!match) return 10 * 1024 * 1024; // default 10MB

    const [, num, unitMatch = ''] = match;
    return parseInt(num!, 10) * (units[unitMatch || unit] || 1);
  }

  // Standard logging methods
  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  error(message: string, error?: Error | any, meta?: any): void {
    if (error instanceof Error) {
      this.logger.error(message, {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        ...meta
      });
    } else {
      this.logger.error(message, { error, ...meta });
    }
  }

  // Performance and metrics logging
  logPerformance(endpoint: string, method: string, responseTime: number, statusCode: number, meta?: any): void {
    this.logger.info('Performance metric', {
      type: 'performance',
      endpoint,
      method,
      responseTime,
      statusCode,
      ...meta
    });
  }

  logError(endpoint: string, method: string, error: Error, statusCode: number, meta?: any): void {
    this.logger.error('Request error', {
      type: 'error',
      endpoint,
      method,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      statusCode,
      ...meta
    });
  }

  // Audit logging methods
  logRequest(req: any, userId?: string): void {
    this.auditLogger.info('Request received', {
      requestId: req.id,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      userId,
      timestamp: new Date().toISOString(),
      headers: this.sanitizeHeaders(req.headers),
      query: req.query,
      params: req.params
    });
  }

  logResponse(req: any, res: any, processingTime: number, cached = false): void {
    this.auditLogger.info('Response sent', {
      requestId: req.id,
      statusCode: res.statusCode,
      processingTime,
      cached,
      responseSize: res.get('Content-Length') || 0,
      timestamp: new Date().toISOString(),
      headers: this.sanitizeHeaders(res.getHeaders())
    });
  }

  logSecurityEvent(event: string, details: any, severity: 'low' | 'medium' | 'high' = 'medium'): void {
    this.auditLogger.warn('Security event', {
      type: 'security',
      event,
      severity,
      details,
      timestamp: new Date().toISOString()
    });
  }

  logAudit(event: string, action: string, details: any): void {
    this.auditLogger.info('Audit event', {
      type: 'audit',
      event,
      action,
      details,
      timestamp: new Date().toISOString()
    });
  }

  private sanitizeHeaders(headers: any): any {
    const sanitized: any = {};
    const sensitiveHeaders = [
      'authorization',
      'x-api-key',
      'x-algo-api-token',
      'cookie',
      'set-cookie'
    ];

    for (const [key, value] of Object.entries(headers || {})) {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  // Health check logging
  logHealthCheck(component: string, status: 'pass' | 'fail' | 'warn', responseTime: number, details?: any): void {
    this.logger.info('Health check', {
      type: 'health',
      component,
      status,
      responseTime,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  // Circuit breaker events
  logCircuitBreakerEvent(service: string, state: string, reason?: string): void {
    this.logger.warn('Circuit breaker event', {
      type: 'circuit-breaker',
      service,
      state,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  // Cache events
  logCacheEvent(operation: 'hit' | 'miss' | 'set' | 'delete' | 'error', key: string, details?: any): void {
    this.logger.debug('Cache event', {
      type: 'cache',
      operation,
      key,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  // Rate limiting events
  logRateLimitEvent(ip: string, action: 'blocked' | 'allowed', details?: any): void {
    this.logger.info('Rate limit event', {
      type: 'rate-limit',
      ip,
      action,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  // System metrics
  logSystemMetrics(metrics: any): void {
    this.logger.info('System metrics', {
      type: 'system-metrics',
      timestamp: new Date().toISOString(),
      ...metrics
    });
  }

  // Get the underlying winston logger instance
  getLogger(): winston.Logger {
    return this.logger;
  }

  getAuditLogger(): winston.Logger {
    return this.auditLogger;
  }
}

// Singleton instance
let loggerInstance: Logger | null = null;

export const createLogger = (config: OrangeNodeConfig): Logger => {
  if (!loggerInstance) {
    loggerInstance = new Logger(config);
  }
  return loggerInstance;
};

export const getLogger = (): Logger => {
  if (!loggerInstance) {
    throw new Error('Logger not initialized. Call createLogger first.');
  }
  return loggerInstance;
};

export { Logger };
export default Logger;