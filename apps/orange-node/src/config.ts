import fs from 'fs';
import path from 'path';
import { OrangeNodeConfig } from './types';

interface AlgodConfig {
    ALGOD_URL: string | undefined;
    ALGOD_TOKEN: string | undefined;
}

/**
 * Securely reads configuration from Algorand data directory with proper path validation
 * and comprehensive error handling to prevent path traversal and unauthorized access.
 * Exported for testing purposes.
 */
export const getConfigFromDataDir = ():AlgodConfig => {
    const ALGORAND_DATA = process.env['ALGORAND_DATA'];

    // Validate environment variable
    if (!ALGORAND_DATA) {
        return {ALGOD_TOKEN: undefined, ALGOD_URL: undefined};
    }

    // Normalize and validate the path to prevent path traversal attacks
    const normalizedDataDir = path.normalize(ALGORAND_DATA).replace(/\.\./g, '');

    // Ensure the path is absolute and within expected bounds
    if (!path.isAbsolute(normalizedDataDir) || normalizedDataDir.includes('..')) {
        console.error('Security: Invalid ALGORAND_DATA path detected:', ALGORAND_DATA);
        return {ALGOD_TOKEN: undefined, ALGOD_URL: undefined};
    }

    // Check if directory exists and is accessible
    try {
        const stats = fs.statSync(normalizedDataDir);
        if (!stats.isDirectory()) {
            console.error('Security: ALGORAND_DATA path is not a directory:', normalizedDataDir);
            return {ALGOD_TOKEN: undefined, ALGOD_URL: undefined};
        }
    } catch (error) {
        console.error('Security: Unable to access ALGORAND_DATA directory:', normalizedDataDir, error);
        return {ALGOD_TOKEN: undefined, ALGOD_URL: undefined};
    }

    // Define allowed filenames to prevent arbitrary file access
    const allowedFiles = ['algod.net', 'algod.token'];
    let algodNet: string | undefined;
    let algodToken: string | undefined;

    for (const filename of allowedFiles) {
        const filePath = path.join(normalizedDataDir, filename);

        try {
            // Additional security check: ensure file is within the data directory
            const resolvedPath = path.resolve(filePath);
            const resolvedDataDir = path.resolve(normalizedDataDir);

            if (!resolvedPath.startsWith(resolvedDataDir)) {
                console.error('Security: Path traversal attempt detected for file:', filename);
                continue;
            }

            // Check if file exists
            const fileStats = fs.lstatSync(resolvedPath);
            
            // Follow symlinks and verify the real path is still within the data directory
            if (fileStats.isSymbolicLink()) {
                const realPath = fs.realpathSync(resolvedPath);
                if (!realPath.startsWith(resolvedDataDir)) {
                    console.error('Security: Symlink points outside data directory:', filename);
                    continue;
                }
            }

            // Check if it's a regular file (after potential symlink resolution)
            const actualStats = fs.statSync(resolvedPath);
            if (!actualStats.isFile()) {
                console.error('Security: Expected file is not a regular file:', resolvedPath);
                continue;
            }

            // Check file size to prevent reading extremely large files (DoS protection)
            if (actualStats.size > 1024 * 1024) { // 1MB limit
                console.error('Security: File too large, potential DoS attempt:', resolvedPath);
                continue;
            }

            // Read file contents securely
            const content = fs.readFileSync(resolvedPath, 'utf8').trim();

            if (filename === 'algod.net') {
                algodNet = content;
            } else if (filename === 'algod.token') {
                algodToken = content;
            }

        } catch (error) {
            console.error(`Security: Failed to read ${filename}:`, error);
            // Continue with other files even if one fails
        }
    }

    // Process algod.net content if available
    let ALGOD_URL: string | undefined;
    if (algodNet) {
        // Additional validation for algod.net content
        if (algodNet.includes('..') || algodNet.includes('\0')) {
            console.error('Security: Invalid characters detected in algod.net content');
        } else {
            // Odd server value found in A1CN's algod.net, replace with localhost server value if found
            ALGOD_URL = 'http://' + algodNet.replace("[::]", "127.0.0.1");
        }
    }

    return {ALGOD_TOKEN: algodToken, ALGOD_URL};
};

const algodConfig = getConfigFromDataDir();

export const ALGOD_URL = algodConfig.ALGOD_URL;
export const ALGOD_TOKEN = algodConfig.ALGOD_TOKEN;

export const DEFAULT_CONFIG: OrangeNodeConfig = {
  algod: {
    url: ALGOD_URL || process.env['ALGOD_URL'] || 'http://localhost:4160',
    token: ALGOD_TOKEN || process.env['ALGOD_TOKEN'] || ''
  },
  proxy: {
    target: ALGOD_URL || process.env['ALGOD_URL'] || 'http://localhost:4160',
    changeOrigin: true,
    timeout: parseInt(process.env['PROXY_TIMEOUT'] || '30000'),
    retries: {
      maxAttempts: parseInt(process.env['MAX_RETRIES'] || '3'),
      initialDelay: parseInt(process.env['INITIAL_RETRY_DELAY'] || '1000'),
      maxDelay: parseInt(process.env['MAX_RETRY_DELAY'] || '10000'),
      backoffMultiplier: parseFloat(process.env['BACKOFF_MULTIPLIER'] || '2.0'),
      retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'],
      retryableStatusCodes: [408, 429, 500, 502, 503, 504]
    },
    circuitBreaker: {
      failureThreshold: parseInt(process.env['CIRCUIT_BREAKER_FAILURES'] || '5'),
      resetTimeout: parseInt(process.env['CIRCUIT_BREAKER_TIMEOUT'] || '60000'),
      monitoringPeriod: parseInt(process.env['CIRCUIT_BREAKER_MONITORING_PERIOD'] || '30000'),
      expectedResponseTime: parseInt(process.env['EXPECTED_RESPONSE_TIME'] || '5000')
    },
    connectionPool: {
      maxConnections: parseInt(process.env['MAX_CONNECTIONS'] || '100'),
      minConnections: parseInt(process.env['MIN_CONNECTIONS'] || '5'),
      acquireTimeout: parseInt(process.env['ACQUIRE_TIMEOUT'] || '5000'),
      idleTimeout: parseInt(process.env['IDLE_TIMEOUT'] || '30000'),
      healthCheckInterval: parseInt(process.env['HEALTH_CHECK_INTERVAL'] || '15000'),
      maxHealthCheckFailures: parseInt(process.env['MAX_HEALTH_CHECK_FAILURES'] || '3')
    },
    cache: {
      enabled: process.env['ENABLE_CACHE'] !== 'false',
      host: process.env['REDIS_HOST'] || 'localhost',
      port: parseInt(process.env['REDIS_PORT'] || '6379'),
      ...(process.env['REDIS_PASSWORD'] ? { password: process.env['REDIS_PASSWORD'] } : {}),
      db: parseInt(process.env['REDIS_DB'] || '0'),
      keyPrefix: process.env['REDIS_KEY_PREFIX'] || 'orange-node:',
      ttl: {
        '/v2/accounts': 30000,
        '/v2/blocks': 60000,
        '/v2/transactions': 30000,
        '/v2/assets': 600000,
        '/v2/applications': 600000,
        'default': 5000
      },
      maxRetriesPerRequest: parseInt(process.env['REDIS_MAX_RETRIES'] || '3'),
      retryDelayOnFailover: parseInt(process.env['REDIS_RETRY_DELAY'] || '100'),
      lazyConnect: true
    },
    healthCheck: {
      enabled: process.env['HEALTH_CHECK_ENABLED'] !== 'false',
      interval: parseInt(process.env['HEALTH_CHECK_INTERVAL'] || '15000'),
      timeout: parseInt(process.env['HEALTH_CHECK_TIMEOUT'] || '5000'),
      endpoint: '/v2/status'
    }
  },
  security: {
    rateLimiting: {
      windowMs: parseInt(process.env['RATE_LIMIT_WINDOW'] || '60000'),
      maxRequests: parseInt(process.env['RATE_LIMIT_MAX'] || '1000'),
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: 'ip',
      trustProxy: process.env['TRUST_PROXY'] === 'true',
      headers: true,
      standardHeaders: true,
      legacyHeaders: false
    },
    validation: {
      requestValidation: process.env['REQUEST_VALIDATION'] !== 'false',
      sanitizeInput: process.env['SANITIZE_INPUT'] !== 'false',
      maxRequestSize: parseInt(process.env['MAX_REQUEST_SIZE'] || '10485760'), // 10MB
      allowedOrigins: process.env['ALLOWED_ORIGINS'] ? process.env['ALLOWED_ORIGINS'].split(',') : ['*'],
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Algo-API-Token']
    },
    audit: {
      enabled: process.env['AUDIT_LOGGING'] !== 'false',
      logLevel: (process.env['AUDIT_LOG_LEVEL'] as any) || 'info',
      logRequests: process.env['LOG_REQUESTS'] !== 'false',
      logResponses: process.env['LOG_RESPONSES'] !== 'false',
      logErrors: true,
      sensitiveFields: ['authorization', 'x-api-key', 'x-algo-api-token', 'password']
    }
  },
  monitoring: {
    enabled: process.env['MONITORING_ENABLED'] !== 'false',
    metricsEndpoint: process.env['METRICS_ENDPOINT'] || '/metrics',
    healthEndpoint: process.env['HEALTH_ENDPOINT'] || '/health',
    collectMetrics: process.env['COLLECT_METRICS'] !== 'false',
    metricsInterval: parseInt(process.env['METRICS_INTERVAL'] || '60000', 10),
    retentionPeriod: parseInt(process.env['METRICS_RETENTION'] || '86400000', 10),
    healthCheck: {
      enabled: process.env['HEALTH_CHECK_ENABLED'] !== 'false',
      interval: parseInt(process.env['HEALTH_CHECK_INTERVAL'] || '30000', 10),
      timeout: parseInt(process.env['HEALTH_CHECK_TIMEOUT'] || '5000', 10),
      endpoint: process.env['HEALTH_CHECK_ENDPOINT'] || '/v2/status'
    },
    alerts: {
      thresholdConfig: {
        errorRate: parseFloat(process.env['ALERT_ERROR_RATE'] || '0.05'),
        responseTime: parseInt(process.env['ALERT_RESPONSE_TIME'] || '5000', 10),
        memoryUsage: parseFloat(process.env['ALERT_MEMORY_USAGE'] || '0.9'),
        cacheHitRate: parseFloat(process.env['ALERT_CACHE_HIT_RATE'] || '0.5')
      },
      ...(process.env['ALERT_WEBHOOK_URL'] ? { webhookUrl: process.env['ALERT_WEBHOOK_URL'] } : {}),
      enabled: process.env['ALERTS_ENABLED'] === 'true'
    }
  },
  logging: {
    level: (process.env['LOG_LEVEL'] as any) || 'info',
    format: (process.env['LOG_FORMAT'] as any) || 'json',
    ...(process.env['LOG_FILE'] ? { file: process.env['LOG_FILE'] } : {}),
    maxSize: process.env['LOG_MAX_SIZE'] || '10m',
    maxFiles: parseInt(process.env['LOG_MAX_FILES'] || '5')
  },
  server: {
    port: parseInt(process.env['PORT'] || '3000'),
    host: process.env['HOST'] || '0.0.0.0',
    cors: process.env['CORS_ENABLED'] !== 'false',
    compression: process.env['COMPRESSION_ENABLED'] !== 'false',
    helmet: process.env['HELMET_ENABLED'] !== 'false'
  }
};

export const getEnvConfig = (): Partial<OrangeNodeConfig> => {
  const config: Partial<OrangeNodeConfig> = {};

  // Override with environment variables
  if (process.env['ALGOD_URL'] || process.env['ALGOD_TOKEN']) {
    config.algod = {
      url: process.env['ALGOD_URL'] || DEFAULT_CONFIG.algod.url,
      token: process.env['ALGOD_TOKEN'] || DEFAULT_CONFIG.algod.token
    };
  }

  return config;
};

export const getConfig = (): OrangeNodeConfig => {
  return {
    ...DEFAULT_CONFIG,
    ...getEnvConfig()
  };
};