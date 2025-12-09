import { Request, Response, NextFunction } from 'express';
import { SecurityMiddleware, createSecurityMiddleware } from '../middleware/security';
import { Logger } from '../utils/Logger';
import { LogLevel, SecurityConfig } from '../types';

// Set up environment variables before any imports that might need them
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long-for-security';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-that-is-at-least-32-characters-long';

// Mock express objects
const mockRequest = (overrides: Partial<Request> = {}): Partial<Request> => ({
  ip: '127.0.0.1',
  method: 'GET',
  path: '/test',
  url: '/test',
  headers: {
    'user-agent': 'TestAgent/1.0',
    origin: 'http://localhost:3000',
  },
  body: {},
  query: {},
  params: {},
  connection: {
    remoteAddress: '127.0.0.1',
  } as any,
  ...overrides,
});

const mockResponse = (): Partial<Response> => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    removeHeader: jest.fn().mockReturnThis(),
    get: jest.fn().mockReturnValue('100'),
    on: jest.fn().mockImplementation(function (this: Partial<Response>, event: string, cb: () => void) {
      if (event === 'finish') {
        // Call callback after a short delay to simulate response completion
        setTimeout(cb, 0);
      }
      return this;
    }),
    statusCode: 200,
  };
  return res;
};

const mockNext = (): NextFunction => jest.fn();

describe('SecurityMiddleware', () => {
  let securityMiddleware: SecurityMiddleware;
  let logger: Logger;
  let defaultConfig: SecurityConfig;

  beforeEach(() => {
    logger = new Logger(LogLevel.ERROR);
    defaultConfig = {
      enableCORS: true,
      allowedOrigins: ['http://localhost:3000', 'https://example.com'],
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      enableRateLimit: true,
      rateLimit: {
        windowMs: 60000,
        maxRequests: 100,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
      },
      enableAuthentication: false,
      authenticationMethods: ['jwt'],
    };
    securityMiddleware = createSecurityMiddleware(defaultConfig, logger);
  });

  describe('CORS Middleware', () => {
    it('should set CORS headers for allowed origin', () => {
      const req = mockRequest({
        headers: { origin: 'http://localhost:3000' },
      }) as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      securityMiddleware.cors(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Origin',
        'http://localhost:3000'
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Methods',
        expect.any(String)
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Headers',
        expect.any(String)
      );
      expect(next).toHaveBeenCalled();
    });

    it('should handle preflight OPTIONS requests', () => {
      const req = mockRequest({
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:3000' },
      }) as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      securityMiddleware.cors(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.end).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow all origins when wildcard is configured', () => {
      const wildcardConfig = {
        ...defaultConfig,
        allowedOrigins: ['*'],
      };
      const wildcardMiddleware = createSecurityMiddleware(wildcardConfig, logger);

      const req = mockRequest({
        headers: { origin: 'http://any-origin.com' },
      }) as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      wildcardMiddleware.cors(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Origin',
        expect.any(String)
      );
      expect(next).toHaveBeenCalled();
    });

    it('should skip CORS when disabled', () => {
      const noCorsConfig = { ...defaultConfig, enableCORS: false };
      const noCorsMiddleware = createSecurityMiddleware(noCorsConfig, logger);

      const req = mockRequest() as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      noCorsMiddleware.cors(req, res, next);

      expect(res.setHeader).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should set Allow-Credentials header', () => {
      const req = mockRequest({
        headers: { origin: 'http://localhost:3000' },
      }) as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      securityMiddleware.cors(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Credentials',
        'true'
      );
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      const req = mockRequest({ ip: '192.168.1.1' }) as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      await securityMiddleware.rateLimit(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(429);
    });

    it('should skip rate limiting when disabled', async () => {
      const noRateLimitConfig = { ...defaultConfig, enableRateLimit: false };
      const noRateLimitMiddleware = createSecurityMiddleware(noRateLimitConfig, logger);

      const req = mockRequest() as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      await noRateLimitMiddleware.rateLimit(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should block requests exceeding rate limit', async () => {
      // Configure strict rate limit
      const strictConfig = {
        ...defaultConfig,
        rateLimit: {
          ...defaultConfig.rateLimit,
          maxRequests: 2,
          windowMs: 60000,
        },
      };
      const strictMiddleware = createSecurityMiddleware(strictConfig, logger);

      const ip = '10.0.0.100';

      // Make requests up to limit
      for (let i = 0; i < 2; i++) {
        const req = mockRequest({ ip }) as Request;
        const res = mockResponse() as Response;
        const next = mockNext();
        await strictMiddleware.rateLimit(req, res, next);
      }

      // Third request should be rate limited
      const req = mockRequest({ ip }) as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      await strictMiddleware.rateLimit(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too Many Requests',
        })
      );
    });

    it('should set Retry-After header when rate limited', async () => {
      const strictConfig = {
        ...defaultConfig,
        rateLimit: {
          ...defaultConfig.rateLimit,
          maxRequests: 1,
          windowMs: 60000,
        },
      };
      const strictMiddleware = createSecurityMiddleware(strictConfig, logger);

      const ip = '10.0.0.200';

      // First request
      const req1 = mockRequest({ ip }) as Request;
      const res1 = mockResponse() as Response;
      await strictMiddleware.rateLimit(req1, res1, mockNext());

      // Second request should be rate limited
      const req2 = mockRequest({ ip }) as Request;
      const res2 = mockResponse() as Response;
      await strictMiddleware.rateLimit(req2, res2, mockNext());

      expect(res2.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
    });
  });

  describe('Security Headers', () => {
    it('should set X-Content-Type-Options header', () => {
      const req = mockRequest() as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      securityMiddleware.securityHeaders(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    it('should set X-Frame-Options header', () => {
      const req = mockRequest() as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      securityMiddleware.securityHeaders(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    });

    it('should set X-XSS-Protection header', () => {
      const req = mockRequest() as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      securityMiddleware.securityHeaders(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
    });

    it('should set Strict-Transport-Security header', () => {
      const req = mockRequest() as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      securityMiddleware.securityHeaders(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        expect.stringContaining('max-age=')
      );
    });

    it('should set Content-Security-Policy header', () => {
      const req = mockRequest() as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      securityMiddleware.securityHeaders(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("default-src 'self'")
      );
    });

    it('should call next after setting headers', () => {
      const req = mockRequest() as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      securityMiddleware.securityHeaders(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Request Logger', () => {
    it('should call next immediately', () => {
      const req = mockRequest({
        method: 'POST',
        path: '/api/test',
        url: '/api/test',
        ip: '192.168.1.100',
      }) as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      securityMiddleware.requestLogger(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should register finish event handler', () => {
      const req = mockRequest() as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      securityMiddleware.requestLogger(req, res, next);

      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });
  });

  describe('Authentication Middleware', () => {
    it('should skip authentication when disabled', async () => {
      const req = mockRequest() as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      await securityMiddleware.authenticate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(401);
    });

    it('should require authentication when enabled', async () => {
      const authConfig = {
        ...defaultConfig,
        enableAuthentication: true,
      };
      const authMiddleware = createSecurityMiddleware(authConfig, logger);

      const req = mockRequest({
        headers: {}, // No auth header
      }) as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      await authMiddleware.authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
        })
      );
    });
  });

  describe('Authorization Middleware', () => {
    it('should skip authorization when authentication is disabled', () => {
      const req = mockRequest() as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      const authorizeMiddleware = securityMiddleware.authorize(5, ['admin:manage']);
      authorizeMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should require authentication for authorization', () => {
      const authConfig = {
        ...defaultConfig,
        enableAuthentication: true,
      };
      const authMiddleware = createSecurityMiddleware(authConfig, logger);

      const req = mockRequest() as Request;
      const res = mockResponse() as Response;
      const next = mockNext();

      const authorizeMiddleware = authMiddleware.authorize(1, []);
      authorizeMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should reject insufficient access level', () => {
      const authConfig = {
        ...defaultConfig,
        enableAuthentication: true,
      };
      const authMiddleware = createSecurityMiddleware(authConfig, logger);

      const req = mockRequest() as Request;
      (req as any).user = {
        address: '0xTestUser',
        level: 2,
        permissions: ['api:read'],
      };
      const res = mockResponse() as Response;
      const next = mockNext();

      const authorizeMiddleware = authMiddleware.authorize(5, []);
      authorizeMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Forbidden',
        })
      );
    });

    it('should allow sufficient access level', () => {
      const authConfig = {
        ...defaultConfig,
        enableAuthentication: true,
      };
      const authMiddleware = createSecurityMiddleware(authConfig, logger);

      const req = mockRequest() as Request;
      (req as any).user = {
        address: '0xTestUser',
        level: 5,
        permissions: ['api:read', 'admin:manage'],
      };
      const res = mockResponse() as Response;
      const next = mockNext();

      const authorizeMiddleware = authMiddleware.authorize(3, []);
      authorizeMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should check required permissions', () => {
      const authConfig = {
        ...defaultConfig,
        enableAuthentication: true,
      };
      const authMiddleware = createSecurityMiddleware(authConfig, logger);

      const req = mockRequest() as Request;
      (req as any).user = {
        address: '0xTestUser',
        level: 5,
        permissions: ['api:read'],
      };
      const res = mockResponse() as Response;
      const next = mockNext();

      const authorizeMiddleware = authMiddleware.authorize(1, ['admin:write']);
      authorizeMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Missing required permissions',
        })
      );
    });

    it('should allow when all permissions are present', () => {
      const authConfig = {
        ...defaultConfig,
        enableAuthentication: true,
      };
      const authMiddleware = createSecurityMiddleware(authConfig, logger);

      const req = mockRequest() as Request;
      (req as any).user = {
        address: '0xTestUser',
        level: 5,
        permissions: ['api:read', 'api:write', 'admin:manage'],
      };
      const res = mockResponse() as Response;
      const next = mockNext();

      const authorizeMiddleware = authMiddleware.authorize(1, ['api:read', 'api:write']);
      authorizeMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Validation Service', () => {
    it('should expose validation service', () => {
      const validationService = securityMiddleware.getValidationService();

      expect(validationService).toBeDefined();
    });
  });
});

describe('createSecurityMiddleware Factory', () => {
  it('should create middleware with default config', () => {
    const logger = new Logger(LogLevel.ERROR);
    const config: SecurityConfig = {
      enableCORS: true,
      allowedOrigins: ['*'],
      allowedMethods: ['GET'],
      allowedHeaders: ['Content-Type'],
      enableRateLimit: false,
      rateLimit: {
        windowMs: 60000,
        maxRequests: 100,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
      },
      enableAuthentication: false,
      authenticationMethods: ['jwt'],
    };

    const middleware = createSecurityMiddleware(config, logger);

    expect(middleware).toBeDefined();
    expect(middleware).toBeInstanceOf(SecurityMiddleware);
    expect(typeof middleware.cors).toBe('function');
    expect(typeof middleware.rateLimit).toBe('function');
    expect(typeof middleware.authenticate).toBe('function');
    expect(typeof middleware.authorize).toBe('function');
    expect(typeof middleware.securityHeaders).toBe('function');
    expect(typeof middleware.requestLogger).toBe('function');
  });
});
