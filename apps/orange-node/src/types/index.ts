export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  checks: {
    algod: AlgodHealthCheck;
    redis: RedisHealthCheck;
    proxy: ProxyHealthCheck;
    memory: MemoryHealthCheck;
    rateLimit: RateLimitHealthCheck;
  };
  uptime: number;
  responseTime: number;
}

export interface AlgodHealthCheck {
  status: 'pass' | 'fail' | 'warn';
  responseTime: number;
  lastCheck: Date;
  error?: string;
  metrics: {
    lastRound: number;
    lastBlockTime?: Date;
    catchupTime?: number;
    connections: number;
    pendingRequests: number;
    successfulRequests: number;
    failedRequests: number;
  };
}

export interface RedisHealthCheck {
  status: 'pass' | 'fail' | 'warn';
  responseTime: number;
  lastCheck: Date;
  error?: string;
  metrics: {
    connected: boolean;
    uptime: number;
    usedMemory: number;
    totalKeys: number;
    hitRate: number;
  };
}

export interface ProxyHealthCheck {
  status: 'pass' | 'fail' | 'warn';
  responseTime: number;
  lastCheck: Date;
  error?: string;
  metrics: {
    activeConnections: number;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    requestQueueSize: number;
  };
}

export interface MemoryHealthCheck {
  status: 'pass' | 'fail' | 'warn';
  lastCheck: Date;
  metrics: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
    arrayBuffers: number;
    heapUsagePercentage: number;
  };
  warnings?: string[];
}

export interface RateLimitHealthCheck {
  status: 'pass' | 'fail' | 'warn';
  lastCheck: Date;
  metrics: {
    totalHits: number;
    totalMisses: number;
    currentRequestsPerSecond: number;
    blockedRequests: number;
    averageWaitTime: number;
  };
}

export interface NodeMetrics {
  requestCounters: {
    total: number;
    successful: number;
    failed: number;
    timeout: number;
    rateLimited: number;
  };
  responseTimeMetrics: {
    average: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
  };
  errorMetrics: {
    totalErrors: number;
    errorsByType: Record<string, number>;
    errorsByEndpoint: Record<string, number>;
    recentErrors: ErrorMetric[];
  };
  throughputMetrics: {
    requestsPerSecond: number;
    requestsPerMinute: number;
    requestsPerHour: number;
    peakRequestsPerSecond: number;
  };
  connectionMetrics: {
    activeConnections: number;
    totalConnections: number;
    connectionErrors: number;
    connectionTimeouts: number;
    maxConcurrentConnections: number;
  };
  cacheMetrics: {
    hitRate: number;
    missRate: number;
    cacheSize: number;
    evictions: number;
    keysTTL: number;
  };
}

export interface ErrorMetric {
  timestamp: Date;
  endpoint: string;
  method: string;
  statusCode: number;
  errorType: string;
  message: string;
  userId?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface PerformanceMetric {
  timestamp: Date;
  endpoint: string;
  method: string;
  responseTime: number;
  statusCode: number;
  cacheHit: boolean;
  retryAttempt: number;
  userId?: string;
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
  retryableStatusCodes: number[];
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  expectedResponseTime: number;
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: Date;
  nextAttemptTime?: Date;
  successCount: number;
}

export interface ConnectionPoolConfig {
  maxConnections: number;
  minConnections: number;
  acquireTimeout: number;
  idleTimeout: number;
  healthCheckInterval: number;
  maxHealthCheckFailures: number;
}

export interface CacheConfig {
  enabled: boolean;
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  ttl: Record<string, number>;
  maxRetriesPerRequest: number;
  retryDelayOnFailover: number;
  lazyConnect: boolean;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
  keyGenerator: string;
  trustProxy: boolean;
  headers: boolean;
  standardHeaders: boolean;
  legacyHeaders: boolean;
}

export interface SecurityConfig {
  rateLimiting: RateLimitConfig;
  validation: {
    requestValidation: boolean;
    sanitizeInput: boolean;
    maxRequestSize: number;
    allowedOrigins: string[];
    allowedMethods: string[];
    allowedHeaders: string[];
  };
  audit: {
    enabled: boolean;
    logLevel: 'info' | 'warn' | 'error' | 'debug';
    logRequests: boolean;
    logResponses: boolean;
    logErrors: boolean;
    sensitiveFields: string[];
  };
}

export interface RequestAuditLog {
  id: string;
  timestamp: Date;
  method: string;
  url: string;
  headers: Record<string, string>;
  userAgent?: string;
  ipAddress?: string;
  userId?: string;
  requestSize: number;
  response: {
    statusCode: number;
    headers: Record<string, string>;
    responseSize: number;
    processingTime: number;
    cached: boolean;
  };
  error?: {
    type: string;
    message: string;
    stack?: string;
  };
  security: {
    rateLimited: boolean;
    validationErrors: string[];
    suspiciousActivity: boolean;
  };
}

export interface ProxyConfig {
  target: string;
  changeOrigin: boolean;
  timeout: number;
  retries: RetryConfig;
  circuitBreaker: CircuitBreakerConfig;
  connectionPool: ConnectionPoolConfig;
  cache: CacheConfig;
  healthCheck: {
    enabled: boolean;
    interval: number;
    timeout: number;
    endpoint: string;
  };
}

export interface MonitoringConfig {
  enabled: boolean;
  metricsEndpoint: string;
  healthEndpoint: string;
  collectMetrics: boolean;
  metricsInterval: number;
  retentionPeriod: number;
  healthCheck: {
    enabled: boolean;
    interval: number;
    timeout: number;
    endpoint: string;
  };
  alerts: {
    enabled: boolean;
    webhookUrl?: string;
    thresholdConfig: {
      errorRate: number;
      responseTime: number;
      memoryUsage: number;
      cacheHitRate: number;
    };
  };
}

export interface OrangeNodeConfig {
  algod: {
    url: string;
    token: string;
  };
  proxy: ProxyConfig;
  security: SecurityConfig;
  monitoring: MonitoringConfig;
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug';
    format: 'json' | 'text';
    file?: string;
    maxSize: string;
    maxFiles: number;
  };
  server: {
    port: number;
    host: string;
    cors: boolean;
    compression: boolean;
    helmet: boolean;
  };
}

export interface CachedResponse {
  data: any;
  headers: Record<string, string>;
  statusCode: number;
  timestamp: Date;
  ttl: number;
  etag?: string;
  lastModified?: Date;
}

export interface ConnectionHealthStatus {
  id: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  lastCheck: Date;
  responseTime: number;
  consecutiveFailures: number;
  lastError?: string;
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
  };
}