import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { OrangeNodeConfig, RequestAuditLog } from '../types';
import { Logger } from '../utils/logger';

export class SecurityMiddleware {
  private config: OrangeNodeConfig;
  private logger: Logger;
  private auditLogs: RequestAuditLog[] = [];
  private readonly maxAuditLogs = 10000;

  constructor(config: OrangeNodeConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  // Enhanced rate limiting middleware
  createRateLimitMiddleware() {
    return rateLimit({
      windowMs: this.config.security.rateLimiting.windowMs,
      max: this.config.security.rateLimiting.maxRequests,
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(this.config.security.rateLimiting.windowMs / 1000)
      },
      standardHeaders: this.config.security.rateLimiting.standardHeaders,
      legacyHeaders: this.config.security.rateLimiting.legacyHeaders,
      skipSuccessfulRequests: this.config.security.rateLimiting.skipSuccessfulRequests,
      skipFailedRequests: this.config.security.rateLimiting.skipFailedRequests,
      keyGenerator: (req) => {
        switch (this.config.security.rateLimiting.keyGenerator) {
          case 'ip':
            return req.ip || req.connection.remoteAddress || 'unknown';
          case 'user':
            return (req as any).userId || req.ip || 'unknown';
          case 'header':
            return req.headers['x-forwarded-for'] as string || req.ip || 'unknown';
          default:
            return req.ip || 'unknown';
        }
      },
      handler: (req, res) => {
        const key = req.ip || req.connection.remoteAddress || 'unknown';
        this.logger.logRateLimitEvent(key, 'blocked', {
          method: req.method,
          url: req.url,
          userAgent: req.get('User-Agent')
        });

        res.status(429).json({
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil(this.config.security.rateLimiting.windowMs / 1000)
        });
      }
    });
  }

  // Enhanced helmet configuration
  createHelmetMiddleware() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    });
  }

  // Enhanced CORS configuration
  createCorsMiddleware() {
    return cors({
      origin: (origin, callback) => {
        if (!origin || this.config.security.validation.allowedOrigins.includes('*')) {
          callback(null, true);
          return;
        }

        const isAllowed = this.config.security.validation.allowedOrigins.some(allowedOrigin => {
          if (allowedOrigin === '*') return true;
          if (allowedOrigin.includes('*')) {
            const pattern = allowedOrigin.replace(/\*/g, '.*');
            return new RegExp(pattern).test(origin);
          }
          return allowedOrigin === origin;
        });

        if (isAllowed) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: this.config.security.validation.allowedMethods,
      allowedHeaders: this.config.security.validation.allowedHeaders,
      credentials: true,
      optionsSuccessStatus: 200,
      preflightContinue: false
    });
  }

  // Request size validation
  validateRequestSize() {
    return (req: Request, res: Response, next: NextFunction) => {
      const contentLength = req.headers['content-length'];
      const maxSize = this.config.security.validation.maxRequestSize;

      if (contentLength && parseInt(contentLength) > maxSize) {
        this.logger.logSecurityEvent('request-size-exceeded', {
          contentLength: parseInt(contentLength),
          maxSize,
          url: req.url,
          method: req.method,
          ip: req.ip
        }, 'medium');

        return res.status(413).json({
          error: 'Request Too Large',
          message: `Request size exceeds maximum allowed size of ${maxSize} bytes`
        });
      }

      next();
      return;
    };
  }

  // Request validation middleware
  validateRequest() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!this.config.security.validation.requestValidation) {
        return next();
      }

      const validationErrors: string[] = [];

      // Validate HTTP method
      if (!this.config.security.validation.allowedMethods.includes(req.method)) {
        validationErrors.push(`Method ${req.method} is not allowed`);
      }

      // Validate URL path for common attack patterns
      const suspiciousPatterns = [
        /\.\./,  // Directory traversal
        /<script/i,  // XSS attempt
        /javascript:/i,  // XSS attempt
        /data:/i,  // Data URI attempt
        /union.*select/i,  // SQL injection attempt
        /drop\s+table/i,  // SQL injection attempt
      ];

      const url = req.url;
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(url)) {
          validationErrors.push(`Suspicious pattern detected in URL: ${url}`);
          this.logger.logSecurityEvent('suspicious-url-pattern', {
            url,
            pattern: pattern.source,
            ip: req.ip,
            userAgent: req.get('User-Agent')
          }, 'high');
        }
      }

      // Validate headers for suspicious content
      const suspiciousHeaders = ['user-agent', 'referer', 'x-forwarded-for'];
      for (const header of suspiciousHeaders) {
        const value = req.headers[header];
        if (typeof value === 'string') {
          for (const pattern of suspiciousPatterns) {
            if (pattern.test(value)) {
              validationErrors.push(`Suspicious pattern detected in ${header} header`);
              this.logger.logSecurityEvent('suspicious-header-pattern', {
                header,
                value,
                pattern: pattern.source,
                ip: req.ip
              }, 'high');
            }
          }
        }
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: 'Request Validation Failed',
          message: 'Request contains suspicious or invalid content',
          errors: validationErrors
        });
      }

      next();
    };
  }

  // Input sanitization middleware
  sanitizeInput() {
    return (req: Request, _res: Response, next: NextFunction) => {
      if (!this.config.security.validation.sanitizeInput) {
        return next();
      }

      const sanitize = (obj: any): any => {
        if (typeof obj === 'string') {
          return obj
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '');
        }

        if (Array.isArray(obj)) {
          return obj.map(sanitize);
        }

        if (obj && typeof obj === 'object') {
          const sanitized: any = {};
          for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitize(value);
          }
          return sanitized;
        }

        return obj;
      };

      // Sanitize request body
      if (req.body) {
        req.body = sanitize(req.body);
      }

      // Sanitize query parameters
      if (req.query) {
        req.query = sanitize(req.query);
      }

      // Sanitize URL parameters
      if (req.params) {
        req.params = sanitize(req.params);
      }

      next();
    };
  }

  // Request ID assignment
  assignRequestId() {
    return (req: Request, res: Response, next: NextFunction) => {
      req.id = req.headers['x-request-id'] as string || uuidv4();
      res.setHeader('X-Request-ID', req.id);
      next();
    };
  }

  // Audit logging middleware
  auditLog() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!this.config.security.audit.enabled) {
        return next();
      }

      const startTime = Date.now();

      // Log request
      if (this.config.security.audit.logRequests) {
        this.logger.logRequest(req, (req as any).userId);
      }

      // Override res.end to capture response
      const self = this; // Capture this context
      const originalEnd = res.end;
      res.end = function(this: Response, chunk?: any, encoding?: any): Response {
        res.end = originalEnd;
        const result = res.end.call(this, chunk, encoding);

        const processingTime = Date.now() - startTime;
        const responseSize = res.get('Content-Length') || 0;

        // Log response
        if (self.config.security.audit.logResponses) {
          self.logger.logResponse(req, res, processingTime);
        }

        // Create audit log entry
        const auditLog: RequestAuditLog = {
          id: req.id || '',
          timestamp: new Date(),
          method: req.method,
          url: req.url,
          headers: self.sanitizeHeaders(req.headers),
          ...(req.get('User-Agent') ? { userAgent: req.get('User-Agent')! } : {}),
          ...(req.ip ? { ipAddress: req.ip } : {}),
          userId: (req as any).userId,
          requestSize: parseInt(req.headers['content-length'] || '0'),
          response: {
            statusCode: res.statusCode,
            headers: self.sanitizeHeaders(res.getHeaders() as Record<string, string>),
            responseSize: parseInt(responseSize as string),
            processingTime,
            cached: (req as any).cached || false
          },
          security: {
            rateLimited: false, // Would be set by rate limiter
            validationErrors: [],
            suspiciousActivity: false
          }
        };

        self.addAuditLog(auditLog);
        return result;
      };

      next();
    };
  }

  // Enhanced authentication middleware
  authenticate() {
    return (req: Request, res: Response, next: NextFunction) => {
      // TODO: replace with scheme to verify requests come from orange gateways
      const isAccessAllowed = (req: Request) => {
        // Reads x-api-key as Orange API key first
        // Will be replaced with local algod's api-key
        const apiKey = req.headers["x-api-key"] as string;
        const orangeApiKey = process.env['ORANGE_API_KEY'];

        if (orangeApiKey && apiKey === orangeApiKey) {
          return true;
        }

        // For now, allow all (backward compatibility)
        return true;
      };

      if (!isAccessAllowed(req)) {
        this.logger.logSecurityEvent('unauthorized-access', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        }, 'high');

        return res.status(403).json({
          error: 'Forbidden',
          message: 'Access denied'
        });
      }

      // Remove API key from request to prevent exposure
      delete req.headers["X-Algo-API-Token"];
      delete req.headers["x-algo-api-token"];

      next();
      return;
    };
  }

  sanitizeHeaders(headers: any): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveHeaders = this.config.security.audit.sensitiveFields;

    for (const [key, value] of Object.entries(headers || {})) {
      if (sensitiveHeaders.some(sensitive => key.toLowerCase().includes(sensitive.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        sanitized[key] = value;
      } else {
        sanitized[key] = String(value);
      }
    }

    return sanitized;
  }

  addAuditLog(auditLog: RequestAuditLog): void {
    this.auditLogs.push(auditLog);

    // Keep only the most recent logs
    if (this.auditLogs.length > this.maxAuditLogs) {
      this.auditLogs = this.auditLogs.slice(-this.maxAuditLogs);
    }

    // Log to external system if configured
    if (this.config.security.audit.enabled) {
      this.logger.logAudit('request', `${auditLog.method} ${auditLog.url}`, auditLog);
    }
  }

  // Get audit logs
  getAuditLogs(limit?: number, offset?: number): RequestAuditLog[] {
    const logs = this.auditLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (offset) {
      return logs.slice(offset).slice(0, limit);
    }

    return limit ? logs.slice(0, limit) : logs;
  }

  // Clear old audit logs
  clearAuditLogs(olderThan?: Date): number {
    if (!olderThan) {
      const count = this.auditLogs.length;
      this.auditLogs = [];
      return count;
    }

    const originalLength = this.auditLogs.length;
    this.auditLogs = this.auditLogs.filter(log => log.timestamp >= olderThan);
    return originalLength - this.auditLogs.length;
  }

  // Get audit statistics
  getAuditStats() {
    const recentLogs = this.auditLogs.filter(log =>
      log.timestamp >= new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
    );

    const requestsByHour: Record<string, number> = {};
    const errorsByType: Record<string, number> = {};
    const topIPs: Record<string, number> = {};
    const suspiciousActivity = recentLogs.filter(log => log.security.suspiciousActivity).length;

    recentLogs.forEach(log => {
      // Requests by hour
      const hour = log.timestamp.toISOString().slice(0, 13);
      requestsByHour[hour] = (requestsByHour[hour] || 0) + 1;

      // Errors by type
      if (log.response.statusCode >= 400) {
        const errorType = `${log.response.statusCode}`;
        errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
      }

      // Top IPs
      if (log.ipAddress) {
        topIPs[log.ipAddress] = (topIPs[log.ipAddress] || 0) + 1;
      }
    });

    return {
      totalRequests: recentLogs.length,
      suspiciousActivity,
      requestsByHour,
      errorsByType,
      topIPs: Object.entries(topIPs)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .reduce((obj, [ip, count]) => ({ ...obj, [ip]: count }), {})
    };
  }
}