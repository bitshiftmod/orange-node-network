import { NodeInfo } from './index';

// Enhanced reputation and scoring types
export interface NodeReputationScore {
  address: string;
  baseScore: number; // 0-100
  challengeSuccessRate: number; // 0-1
  responseTimeScore: number; // 0-100
  availabilityScore: number; // 0-100
  stakeWeight: number;
  finalScore: number; // Weighted combination
  lastUpdated: number;
  challengeHistory: ChallengeResult[];
  performanceHistory: NodePerformanceMetrics[];
}

export interface NodeSelectionCriteria {
  minReputationScore: number; // Default: 0.95
  maxResponseTime: number; // Default: 2000ms
  minSuccessRate: number; // Default: 0.98
  maxFailedChallenges: number; // Default: 3 in 24h
  geoLocationPreference?: string;
  networkType: 'mainnet' | 'testnet' | 'betanet';
  nodeType?: 'archive' | 'light' | 'relay' | 'indexer';
}

// Smart contract integration types
export interface RegistryIntegrationConfig {
  pollingInterval: number; // 30-60 seconds
  batchSize: number; // Nodes per batch
  cacheTimeout: number; // 5 minutes
  retryAttempts: number;
  retryDelay: number;
  contractAddresses: {
    nodeRegistry: string;
    accessControl: string;
    reputation?: string;
    metrics?: string;
  };
}

export interface SmartContractClient {
  nodeRegistry: any; // OrangeGatewayRegistry instance
  accessControl: any; // OrangeAccessControl instance
  reputationContract?: any;
  metricsContract?: any;
}

// Challenge management types
export interface ChallengeDefinition {
  id: string;
  type: 'peer-id' | 'historical-block' | 'mempool-state' | 'account-state';
  difficulty: 'easy' | 'medium' | 'hard';
  timeout: number; // seconds
  expectedResponseTime: number; // milliseconds
  points: number; // Reputation points
  data: any; // Challenge-specific data
}

export interface ChallengeSchedule {
  frequency: number; // challenges per hour per node
  randomVariance: number; // ± variance percentage
  peakHoursAdjustment: number; // multiplier during peak hours
  failureThreshold: number; // consecutive failures before penalty
  retryDelay: number; // delay between retries
}

export interface ChallengeResult {
  id: string;
  nodeId: string;
  challengeType: string;
  success: boolean;
  responseTime: number;
  answer: any;
  expectedAnswer: any;
  timestamp: number;
  error?: string;
}

// Mutual attestation types
export interface AttestationData {
  gatewayAddress: string;
  nodeAddress: string;
  periodStart: number;
  periodEnd: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  errorRate: number;
  timestamp: number;
  signature: string;
}

export interface AttestationConfig {
  collectionInterval: number; // hourly
  submissionBatchSize: number;
  toleranceThreshold: number; // ±5%
  verificationTimeout: number;
  retryAttempts: number;
  batchSize: number;
}

export interface AttestationMismatch {
  gatewayAttestation: AttestationData;
  nodeAttestation: AttestationData;
  differences: string[];
  severity: 'low' | 'medium' | 'high';
  timestamp: number;
}

// Enhanced load balancing types
export interface ReputationWeightedStrategy {
  reputationWeight: number; // 0-1
  responseTimeWeight: number; // 0-1
  availabilityWeight: number; // 0-1
  stakeWeight: number; // 0-1
  geoWeight: number; // 0-1
}

export interface AdaptiveStrategyConfig {
  baseStrategy: 'reputation-weighted' | 'performance-based' | 'hybrid';
  adaptationThreshold: number;
  performanceWindow: number; // minutes
  strategyRotation: boolean;
  rotationInterval: number; // minutes
}

// API management types
export interface APITier {
  name: 'Free' | 'Basic' | 'Pro' | 'Enterprise';
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  requestsPerMonth: number;
  allowedMethods: string[];
  priority: number; // 0-10
  rateLimitHeaders: boolean;
  features: string[];
}

export interface APIKeyInfo {
  keyHash: string;
  keyId: string;
  owner: string;
  tier: APITier;
  isActive: boolean;
  createdAt: number;
  lastUsed: number;
  usageCount: number;
  rateLimitRemaining: number;
  resetTime: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
  limit: number;
  windowMs: number;
}

// Caching types
export interface CacheConfig {
  nodeRegistry: {
    ttl: number; // 5 minutes
    prefix: string;
    maxSize: number; // MB
  };
  healthStatus: {
    ttl: number; // 30 seconds
    prefix: string;
    maxSize: number;
  };
  rateLimits: {
    ttl: number; // 1 hour
    prefix: string;
    maxSize: number;
  };
  responses: {
    ttl: number; // 60 seconds
    prefix: string;
    maxSize: number; // MB
    varyHeaders: string[];
  };
  reputation: {
    ttl: number; // 10 minutes
    prefix: string;
    maxSize: number;
  };
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  memoryUsage: number;
  keyCount: number;
  evictionCount: number;
}

// Performance monitoring types
export interface NodePerformanceMetrics {
  nodeId: string;
  timestamp: number;
  responseTime: number;
  success: boolean;
  requestSize: number;
  responseSize: number;
  method: string;
  path: string;
  statusCode: number;
  userAgent?: string;
}

export interface SystemMetrics {
  timestamp: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  activeConnections: number;
  nodeCount: number;
  healthyNodeCount: number;
  cacheHitRate: number;
  errorRate: number;
  throughput: number; // requests per second
}

export interface PerformanceReport {
  period: { start: number; end: number };
  system: SystemMetrics;
  nodes: Array<{
    nodeId: string;
    requests: number;
    successRate: number;
    averageResponseTime: number;
    reputationScore: number;
    challenges: {
      total: number;
      successful: number;
      failed: number;
      averageResponseTime: number;
    };
  }>;
  attestation: {
    submitted: number;
    verified: number;
    mismatches: number;
    accuracy: number;
  };
  recommendations: string[];
}

// Enhanced circuit breaker types
export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number; // milliseconds
  monitoringPeriod: number; // milliseconds
  expectedRecoveryTime: number; // milliseconds
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  nextAttemptTime: number;
}

// Enhanced gateway configuration
export interface EnhancedGatewayConfig {
  // Core settings
  port: number;
  host: string;
  environment: 'development' | 'staging' | 'production';

  // Network settings
  algorandNetwork: 'mainnet' | 'testnet' | 'betanet';
  algodUrl: string;
  indexerUrl: string;
  registryContractId: string;
  accessControlContractId: string;

  // Node selection
  nodeSelection: NodeSelectionCriteria;
  reputationConfig: {
    updateInterval: number;
    decayRate: number;
    weights: ReputationWeightedStrategy;
  };

  // Load balancing
  loadBalancer: AdaptiveStrategyConfig;

  // Challenge management
  challenges: {
    enabled: boolean;
    schedule: ChallengeSchedule;
    types: ChallengeDefinition[];
  };

  // Attestation
  attestation: AttestationConfig;

  // API management
  api: {
    enabled: boolean;
    tiers: APITier[];
    defaultTier: string;
  };

  // Caching
  cache: CacheConfig;
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    clusterNodes?: Array<{ host: string; port: number }>;
  };

  // Monitoring
  monitoring: {
    enabled: boolean;
    metricsEndpoint: string;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    alerting: {
      enabled: boolean;
      webhookUrl?: string;
      slackChannel?: string;
      emailRecipients?: string[];
    };
  };

  // Security
  security: {
    enableCORS: boolean;
    allowedOrigins: string[];
    allowedMethods: string[];
    allowedHeaders: string[];
    enableRateLimit: boolean;
    enableAuthentication: boolean;
    jwtSecret: string;
    apiKeySecret: string;
  };

  // Circuit breaker
  circuitBreaker: CircuitBreakerConfig;
}

// Event types
export interface GatewayEvent {
  type: 'node_registered' | 'node_updated' | 'node_removed' |
        'health_check' | 'challenge_completed' | 'attestation_submitted' |
        'reputation_updated' | 'circuit_breaker_triggered';
  timestamp: number;
  data: any;
  source: string;
}

export interface EventHandler {
  (event: GatewayEvent): Promise<void> | void;
}

// Enhanced error types
export interface GatewayError extends Error {
  code: string;
  statusCode: number;
  nodeId?: string;
  requestId?: string;
  timestamp: number;
  metadata?: Record<string, any>;
  retryable: boolean;
}

export interface ChallengeError extends GatewayError {
  challengeId: string;
  challengeType: string;
  nodeId: string;
}

export interface AttestationError extends GatewayError {
  attestationId: string;
  gatewayAddress: string;
  nodeAddress: string;
}