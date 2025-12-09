// Core Node Information
// Logging types
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// Core Node Information
export interface NodeInfo {
  id: string;
  address: string;
  fqdn: string;
  port: number;
  publicKey: string;
  url?: string;
  region?: string;
  capabilities: string[];
  registeredAt: number;
  lastActiveAt: number;
  version: string;
  reputationScore?: number;
  status: 'active' | 'inactive' | 'maintenance';
  
  // Additional properties for SmartContractBridge
  friendlyName?: string;
  network?: string;
  geolocation?: string;
  location?: string;
  stakeWeight?: number;
  isActive?: boolean;
  isHealthy?: boolean;
  lastHealthCheck?: number;
  lastSeen?: number;
  
  // Performance metrics
  totalRequests?: number;
  successfulRequests?: number;
  failedRequests?: number;
  averageResponseTime?: number;
}

// Gateway Configuration
export interface GatewayConfig {
  port: number;
  host: string;
  environment?: 'development' | 'staging' | 'production';
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  healthCheck: {
    checkInterval: number;
    timeout: number;
    failureThreshold: number;
    successThreshold: number;
  };
  loadBalance: {
    strategy: string;
  };
  security: SecurityConfig;
  monitoring: {
    enableMetrics: boolean;
    enableLogging: boolean;
    logLevel: string;
    metricsEndpoint: string;
  };
  websocket: {
    enabled: boolean;
    port: number;
    host: string;
    path: string;
    maxConnections: number;
    heartbeatInterval: number;
    connectionTimeout: number;
    enableCompression: boolean;
    perMessageDeflate: boolean;
    rateLimit: {
      connectionsPerMinute: number;
      messagesPerMinute: number;
    };
  };
  algorandNetwork: string;
  registryContractId: string;
  accessControlContractId: string;
}

// Smart Contract Types
export interface OnChainNodeInfo {
  address: string;
  operator: string;
  stakeAmount: bigint;
  registeredAt: number;
  lastActiveAt: number;
  reputationScore: number;
  status: 'active' | 'inactive' | 'slashed';
  metadata: {
    region?: string;
    version?: string;
    capabilities: string[];
    fqdn?: string;
    port?: number;
  };
}

export interface OnChainGatewayInfo {
  address: string;
  operator: string;
  registeredAt: number;
  status: 'active' | 'inactive';
  publicKey: string;
}

// Request Context
export interface RequestContext {
  userAddress?: string;
  serviceTier: 'basic' | 'premium' | 'enterprise';
  requestType: 'read' | 'write';
  geolocation?: string;
}

// Security Configuration
export interface SecurityConfig {
  enableCORS: boolean;
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  enableRateLimit: boolean;
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
  };
  enableAuthentication: boolean;
  authenticationMethods: ('api-key' | 'jwt' | 'oauth')[];
}


// User Types (for authentication)
export interface WebSocketStats {
  totalConnections: number;
  activeConnections: number;
  totalMessages: number;
  messagesPerSecond: number;
  connectionsByMinute: number;
  errorsByMinute: number;
  averageConnectionDuration: number;
  topChannels: Array<{
    channel: string;
    subscribers: number;
    messages: number;
  }>;
}

// User Types (for authentication and GraphQL)
export interface User {
  address: string;
  level: number;
  permissions: string[];
  createdAt?: number;
}

// Transaction Types (for GraphQL)
export interface Transaction {
  id: string;
  sender: string;
  receiver: string;
  amount: number;
  fee: number;
  note?: string;
  type: string;
  round: number;
  timestamp: number;
  signature?: string;
}

// Asset Types (for GraphQL)
export interface Asset {
  id: number;
  params: {
    creator: string;
    total: number;
    decimals: number;
    defaultFrozen: boolean;
    unitName?: string;
    assetName?: string;
    url?: string;
    metadataHash?: string;
    manager?: string;
    reserve?: string;
    freeze?: string;
    clawback?: string;
  };
}

// Application Types (for GraphQL)
export interface Application {
  id: number;
  params: {
    creator: string;
    approvalProgram: string;
    clearStateProgram: string;
    globalState?: any;
    localState?: any;
  };
}

// Block Types (for GraphQL)
export interface Block {
  round: number;
  timestamp: number;
  transactions: Transaction[];
  proposer?: string;
  hash: string;
}

// Export all types
export * from './';