import { GatewayConfig } from '../types';

export const defaultConfig: GatewayConfig = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  healthCheck: {
    checkInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30'), // seconds
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5'), // seconds
    failureThreshold: parseInt(process.env.HEALTH_CHECK_FAILURE_THRESHOLD || '3'),
    successThreshold: parseInt(process.env.HEALTH_CHECK_SUCCESS_THRESHOLD || '2'),
  },
  loadBalance: {
    strategy: (process.env.LOAD_BALANCE_STRATEGY as any) || 'weighted',
  },
  security: {
    enableCORS: process.env.ENABLE_CORS !== 'false',
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    allowedMethods: process.env.ALLOWED_METHODS?.split(',') || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: process.env.ALLOWED_HEADERS?.split(',') || ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
    enableRateLimit: process.env.ENABLE_RATE_LIMIT !== 'false',
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
      skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL === 'true',
      skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED === 'true',
    },
    enableAuthentication: process.env.ENABLE_AUTHENTICATION !== 'false',
    authenticationMethods: (process.env.AUTH_METHODS?.split(',') as any) || ['jwt', 'api-key'],
  },
  monitoring: {
    enableMetrics: process.env.ENABLE_METRICS !== 'false',
    enableLogging: process.env.ENABLE_LOGGING !== 'false',
    logLevel: (process.env.LOG_LEVEL as any) || 'info',
    metricsEndpoint: process.env.METRICS_ENDPOINT || '/metrics',
  },
  websocket: {
    enabled: process.env.WEBSOCKET_ENABLED !== 'false',
    port: parseInt(process.env.WEBSOCKET_PORT || '3001'),
    host: process.env.WEBSOCKET_HOST || '0.0.0.0',
    path: process.env.WEBSOCKET_PATH || '/ws',
    maxConnections: parseInt(process.env.WEBSOCKET_MAX_CONNECTIONS || '10000'),
    heartbeatInterval: parseInt(process.env.WEBSOCKET_HEARTBEAT_INTERVAL || '30000'), // 30 seconds
    connectionTimeout: parseInt(process.env.WEBSOCKET_CONNECTION_TIMEOUT || '120000'), // 2 minutes
    enableCompression: process.env.WEBSOCKET_ENABLE_COMPRESSION !== 'false',
    perMessageDeflate: process.env.WEBSOCKET_PER_MESSAGE_DEFLATE !== 'false',
    rateLimit: {
      connectionsPerMinute: parseInt(process.env.WEBSOCKET_CONNECTIONS_PER_MINUTE || '60'),
      messagesPerMinute: parseInt(process.env.WEBSOCKET_MESSAGES_PER_MINUTE || '1000'),
    },
  },
  algorandNetwork: (process.env.ALGORAND_NETWORK as any) || 'mainnet',
  registryContractId: process.env.REGISTRY_CONTRACT_ID || '',
  accessControlContractId: process.env.ACCESS_CONTROL_CONTRACT_ID || '',
};

export function validateConfig(config: GatewayConfig): void {
  if (config.port < 1 || config.port > 65535) {
    throw new Error('Invalid port number');
  }

  if (config.healthCheck.checkInterval < 1) {
    throw new Error('Health check interval must be positive');
  }

  if (config.healthCheck.timeout < 1) {
    throw new Error('Health check timeout must be positive');
  }

  if (config.security.rateLimit.windowMs < 1000) {
    throw new Error('Rate limit window must be at least 1000ms');
  }

  if (config.security.rateLimit.maxRequests < 1) {
    throw new Error('Rate limit max requests must be positive');
  }

  if (!config.registryContractId) {
    throw new Error('Registry contract ID is required');
  }

  if (!config.accessControlContractId) {
    throw new Error('Access control contract ID is required');
  }
}

export function getConfig(): GatewayConfig {
  const config = { ...defaultConfig };

  // Override with any custom config if provided
  if (process.env.GATEWAY_CONFIG) {
    try {
      const customConfig = JSON.parse(process.env.GATEWAY_CONFIG);
      Object.assign(config, customConfig);
    } catch (error) {
      console.warn('Failed to parse GATEWAY_CONFIG:', error);
    }
  }

  validateConfig(config);
  return config;
}