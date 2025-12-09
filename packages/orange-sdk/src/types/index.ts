/**
 * Core types for the Orange Node Network SDK
 */

/**
 * Network configuration
 */
export interface NetworkConfig {
  /** Gateway base URL */
  gatewayUrl: string;
  /** Algorand network */
  network: 'mainnet' | 'testnet' | 'betanet';
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts */
  retryAttempts?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
  /** Custom headers to include in requests */
  headers?: Record<string, string>;
}

/**
 * Authentication methods
 */
export type AuthMethod = 'api-key' | 'jwt' | 'oauth';

/**
 * Authentication configuration
 */
export interface AuthConfig {
  /** Authentication method */
  method: AuthMethod;
  /** API key (for api-key method) */
  apiKey?: string;
  /** JWT configuration (for jwt method) */
  jwt?: {
    /** JWT token */
    token: string;
    /** Refresh token */
    refreshToken?: string;
    /** Token expiration time */
    expiresAt?: number;
  };
  /** OAuth configuration (for oauth method) */
  oauth?: {
    /** OAuth token */
    token: string;
    /** Token type */
    tokenType: 'Bearer';
    /** Token expiration time */
    expiresAt?: number;
    /** Refresh token */
    refreshToken?: string;
  };
}

/**
 * Algorand configuration for direct contract interaction
 */
export interface AlgorandConfig {
  /** Algorand network */
  network: 'mainnet' | 'testnet' | 'betanet';
  /** Algod server URL */
  algodServer?: string;
  /** Algod token */
  algodToken?: string;
  /** Algod port */
  algodPort?: string;
  /** Indexer server URL */
  indexerServer?: string;
  /** Indexer token */
  indexerToken?: string;
  /** Indexer port */
  indexerPort?: string;
}

/**
 * Smart contract configuration
 */
export interface ContractConfig {
  /** Orange Subscriptions contract app ID */
  subscriptionsAppId: number;
  /** Orange Node Registry contract app ID */
  nodeRegistryAppId?: number;
  /** Orange Gateway Registry contract app ID */
  gatewayRegistryAppId?: number;
}

/**
 * SDK configuration options
 */
export interface SDKConfig extends NetworkConfig {
  /** Authentication configuration */
  auth: AuthConfig;
  /** Algorand configuration for direct contract access */
  algorand?: AlgorandConfig;
  /** Smart contract configuration */
  contracts?: ContractConfig;
  /** Enable debug logging */
  debug?: boolean;
  /** Custom logger implementation */
  logger?: Logger;
  /** WebSocket options */
  websocket?: WebSocketOptions;
  /** Rate limiting configuration */
  rateLimit?: {
    /** Maximum requests per second */
    requestsPerSecond?: number;
    /** Maximum concurrent requests */
    maxConcurrent?: number;
  };
}

/**
 * Node information from the gateway
 */
export interface NodeInfo {
  /** Node address */
  address: string;
  /** Human-readable name */
  friendlyName: string;
  /** Fully qualified domain name */
  fqdn: string;
  /** Port number */
  port: number;
  /** Network identifier */
  network: string;
  /** Version string */
  version: string;
  /** Geographic location */
  geolocation: string;
  /** Stake weight */
  stakeWeight: number;
  /** Active status */
  isActive: boolean;
  /** Health status */
  isHealthy: boolean;
  /** Last health check timestamp */
  lastHealthCheck: number;
  /** Total requests handled */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Average response time */
  averageResponseTime: number;
}

/**
 * Gateway information
 */
export interface GatewayInfo {
  /** Gateway address */
  address: string;
  /** Human-readable name */
  friendlyName: string;
  /** Fully qualified domain name */
  fqdn: string;
  /** Port number */
  port: number;
  /** Owner address */
  owner: string;
  /** Network identifier */
  network: string;
  /** Version string */
  version: string;
  /** Maximum connections */
  maxConnections: number;
  /** Supported RPC methods */
  supportedMethods: string[];
  /** Geographic location */
  geolocation: string;
  /** Active status */
  isActive: boolean;
  /** Health status */
  isHealthy: boolean;
  /** Last health check timestamp */
  lastHealthCheck: number;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Node identifier */
  nodeId: string;
  /** Health status */
  isHealthy: boolean;
  /** Response time in milliseconds */
  responseTime: number;
  /** Error message if unhealthy */
  error?: string;
  /** Timestamp of check */
  timestamp: number;
}

/**
 * Subscription information
 */
export interface Subscription {
  /** Subscription ID */
  id: string;
  /** Subscriber address */
  subscriber: string;
  /** Subscription tier */
  tier: string;
  /** Status */
  status: 'active' | 'inactive' | 'expired' | 'cancelled';
  /** Amount paid in microAlgos */
  amount: number;
  /** Features included */
  features: string[];
  /** Start timestamp (milliseconds) */
  startsAt: number;
  /** End timestamp (milliseconds) */
  endsAt: number;
  /** Auto-renew status */
  autoRenew?: boolean;
  /** Metadata */
  metadata?: Record<string, any>;
  /** Expiration timestamp (seconds) - legacy */
  expirationTimestamp?: number;
  /** Expiration date - legacy */
  expirationDate?: Date;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T = any> {
  /** Success status */
  success: boolean;
  /** Response data */
  data?: T;
  /** Error information */
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  /** Response metadata */
  meta?: {
    requestId: string;
    timestamp: number;
    version: string;
  };
}

/**
 * Rate limit information
 */
export interface RateLimitInfo {
  /** Request count in current window */
  current: number;
  /** Maximum requests allowed */
  limit: number;
  /** Remaining requests */
  remaining: number;
  /** Time when window resets */
  resetTime: number;
  /** Window duration in seconds */
  windowDuration: number;
}

/**
 * Event types for real-time updates
 */
export type EventType =
  | 'node:health'
  | 'node:added'
  | 'node:removed'
  | 'subscription:created'
  | 'subscription:updated'
  | 'subscription:cancelled'
  | 'subscription:renewed'
  | 'subscription:upgraded'
  | 'subscription:downgraded'
  | 'subscription:expired'
  | 'gateway:status'
  | 'rate-limit:warning';

/**
 * Event listener function type
 */
export type EventListener = (event: EventData) => void;

/**
 * Real-time event data
 */
export interface EventData {
  /** Event type */
  type: EventType;
  /** Event timestamp */
  timestamp: number;
  /** Event ID */
  id: string;
  /** Event payload */
  payload: any;
  /** Source identifier */
  source: string;
}

/**
 * Transaction information
 */
export interface TransactionInfo {
  /** Transaction ID */
  txId: string;
  /** Sender address */
  sender: string;
  /** Receiver address */
  receiver?: string;
  /** Amount in microAlgos */
  amount?: number;
  /** Fee in microAlgos */
  fee?: number;
  /** First valid round */
  firstRound?: number;
  /** Last valid round */
  lastRound?: number;
  /** Note field */
  note?: string;
  /** Transaction type */
  type?: string;
  /** Confirmed status */
  confirmed?: boolean;
  /** Confirmed round */
  confirmedRound?: number;
  /** Block time */
  blockTime?: number;
}

/**
 * WebSocket connection options
 */
export interface WebSocketOptions {
  /** Auto reconnect on disconnection */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Delay between reconnections in milliseconds */
  reconnectDelay?: number;
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, error?: Error, ...args: any[]): void;
}

/**
 * Error codes
 */
export enum ErrorCode {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  CONNECTION_ERROR = 'CONNECTION_ERROR',

  // Authentication errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_TOKEN = 'INVALID_TOKEN',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',

  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  INVALID_TRANSACTION = 'INVALID_TRANSACTION',

  // Rate limiting errors
  RATE_LIMITED = 'RATE_LIMITED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',

  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  RESOURCE_LIMITED = 'RESOURCE_LIMITED',

  // System errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  MAINTENANCE_MODE = 'MAINTENANCE_MODE',

  // Transaction errors
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',

  // Subscription errors
  SUBSCRIPTION_REQUIRED = 'SUBSCRIPTION_REQUIRED',
  SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED',
  SUBSCRIPTION_INACTIVE = 'SUBSCRIPTION_INACTIVE'
}

/**
 * HTTP methods
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Request options
 */
export interface RequestOptions {
  /** HTTP method */
  method?: HttpMethod;
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body */
  body?: any;
  /** Query parameters */
  params?: Record<string, any>;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts */
  retryAttempts?: number;
  /** Skip rate limiting */
  skipRateLimit?: boolean;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of attempts */
  maxAttempts: number;
  /** Base delay in milliseconds */
  baseDelay: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
  /** Exponential backoff factor */
  backoffFactor: number;
  /** Jitter to add to delay */
  jitter: boolean;
}