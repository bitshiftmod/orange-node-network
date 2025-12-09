import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { SecurityConfig } from '../types';
import { Logger } from '../utils/Logger';
import { SecurityValidationService } from '../services/SecurityValidationService';

interface AuthenticatedRequest extends Request {
  user?: {
    address: string;
    level: number;
    permissions: string[];
  };
  apiKey?: string;
}

export class SecurityMiddleware {
  private rateLimiter: RateLimiterMemory;
  private config: SecurityConfig;
  private logger: Logger;
  private validationService: SecurityValidationService;

  constructor(config: SecurityConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;

    // Initialize validation service
    this.validationService = new SecurityValidationService(logger);

    // Initialize rate limiter
    this.rateLimiter = new RateLimiterMemory({
      points: config.rateLimit.maxRequests,
      duration: config.rateLimit.windowMs / 1000,
      blockDuration: 0,
    });
  }

  /**
   * CORS middleware
   */
  cors(req: Request, res: Response, next: NextFunction): void {
    if (!this.config.enableCORS) {
      return next();
    }

    const origin = req.headers.origin;
    const allowedOrigins = this.config.allowedOrigins;

    if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }

    res.setHeader('Access-Control-Allow-Methods', this.config.allowedMethods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', this.config.allowedHeaders.join(', '));
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    next();
  }

  /**
   * Rate limiting middleware
   */
  async rateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!this.config.enableRateLimit) {
      return next();
    }

    try {
      await this.rateLimiter.consume(this.getRateLimitKey(req));
      next();
    } catch (rejRes: any) {
      const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
      res.set('Retry-After', String(secs));
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${secs} seconds.`,
        retryAfter: secs,
      });

      this.logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        path: req.path,
      });
    }
  }

  /**
   * Authentication middleware
   */
  async authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    if (!this.config.enableAuthentication) {
      return next();
    }

    try {
      const authResult = await this.authenticateRequest(req);

      if (!authResult.success) {
        res.status(401).json({
          error: 'Unauthorized',
          message: authResult.message,
        });
        return;
      }

      req.user = authResult.user;
      req.apiKey = authResult.apiKey;
      next();
    } catch (error) {
      this.logger.error('Authentication error', error as Record<string, any>);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication failed',
      });
    }
  }

  /**
   * Authorization middleware
   */
  authorize(requiredLevel: number, requiredPermissions: string[] = []) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!this.config.enableAuthentication) {
        return next();
      }

      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      // Check access level
      if (req.user.level < requiredLevel) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient privileges',
        });
        return;
      }

      // Check permissions
      if (requiredPermissions.length > 0) {
        const hasAllPermissions = requiredPermissions.every(permission =>
          req.user!.permissions.includes(permission)
        );

        if (!hasAllPermissions) {
          res.status(403).json({
            error: 'Forbidden',
            message: 'Missing required permissions',
          });
          return;
        }
      }

      next();
    };
  }

  /**
   * Security headers middleware
   */
  securityHeaders(req: Request, res: Response, next: NextFunction): void {
    // Prevent XSS attacks
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Prevent protocol downgrade attacks
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // Content Security Policy
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
    );

    // Remove server information
    res.removeHeader('Server');
    res.setHeader('X-Powered-By', 'Orange-Gateway');

    next();
  }

  /**
   * Request logging middleware
   */
  requestLogger(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const logData = {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        contentLength: res.get('content-length'),
      };

      if (res.statusCode >= 400) {
        this.logger.warn('HTTP Request Error', logData);
      } else {
        this.logger.info('HTTP Request', logData);
      }
    });

    next();
  }

  private getRateLimitKey(req: Request): string {
    // Use IP address as the default key
    let key = req.ip;

    // If API key is present, use it for more granular rate limiting
    const apiKey = this.extractApiKey(req);
    if (apiKey) {
      return `api:${apiKey}`;
    }

    return key || 'default';
  }

  private async authenticateRequest(req: AuthenticatedRequest): Promise<{
    success: boolean;
    user?: { address: string; level: number; permissions: string[] };
    apiKey?: string;
    message?: string;
  }> {
    const authMethods = this.config.authenticationMethods;

    // Try API key authentication first
    if (authMethods.includes('api-key')) {
      const apiKey = this.extractApiKey(req);
      if (apiKey) {
        try {
          const result = await this.validationService.validateApiKey(apiKey, {
            ipAddress: this.getClientIp(req),
            origin: req.headers.origin,
          });

          if (result.success) {
            return {
              success: true,
              user: result.user,
              apiKey: result.apiKey
            };
          } else {
            this.logger.warn('Invalid API key used', {
              keyPrefix: apiKey.substring(0, 8),
              ip: req.ip,
              reason: result.message
            });
          }
        } catch (error) {
          this.logger.warn('API key validation error', {
            keyPrefix: apiKey.substring(0, 8),
            ip: req.ip,
            error: (error as Error).message
          });
        }
      }
    }

    // Try JWT authentication
    if (authMethods.includes('jwt')) {
      const token = this.extractJwtToken(req);
      if (token) {
        try {
          const result = await this.validationService.validateJwtToken(token);

          if (result.success) {
            return { success: true, user: result.user };
          } else {
            this.logger.warn('Invalid JWT token used', {
              ip: req.ip,
              reason: result.message
            });
          }
        } catch (error) {
          this.logger.warn('JWT token validation error', {
            ip: req.ip,
            error: (error as Error).message
          });
        }
      }
    }

    // Try OAuth authentication
    if (authMethods.includes('oauth')) {
      // OAuth implementation would go here
      // For now, we'll just log that it's not implemented
      this.logger.debug('OAuth authentication not implemented');
    }

    return {
      success: false,
      message: 'No valid authentication method found',
    };
  }

  private extractApiKey(req: Request): string | null {
    // Check Authorization header (Bearer format)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check X-API-Key header
    const apiKeyHeader = req.headers['x-api-key'] as string;
    if (apiKeyHeader) {
      return apiKeyHeader;
    }

    // Check query parameter (not recommended for production)
    const apiKeyQuery = req.query.api_key as string;
    if (apiKeyQuery) {
      return apiKeyQuery;
    }

    return null;
  }

  private extractJwtToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }

  /**
   * Get client IP address from request
   */
  private getClientIp(req: Request): string {
    return req.ip ||
           req.headers['x-forwarded-for'] as string ||
           req.headers['x-real-ip'] as string ||
           req.connection.remoteAddress ||
           '127.0.0.1';
  }

  /**
   * Get validation service instance (for external use)
   */
  getValidationService(): SecurityValidationService {
    return this.validationService;
  }
}

export function createSecurityMiddleware(config: SecurityConfig, logger: Logger): SecurityMiddleware {
  return new SecurityMiddleware(config, logger);
}