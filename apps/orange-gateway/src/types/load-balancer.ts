import { NodeInfo } from './index';
import { CircuitBreakerConfig, CircuitBreakerState } from './enhanced';

// Enhanced load balancer configuration
export interface AdvancedLoadBalancerConfig {
  // Strategy configuration
  strategy: LoadBalancerStrategyConfig;

  // Health-based routing
  healthBasedRouting: {
    enabled: boolean;
    healthScoreThreshold: number; // 0-1
    consecutiveFailuresThreshold: number;
    healthCheckWeight: number; // 0-1
  };

  // Weighted round robin
  weightedRoundRobin: {
    enabled: boolean;
    baseWeights: Record<string, number>; // Node address -> weight
    dynamicWeighting: boolean;
    weightAdjustmentFactor: number; // How quickly weights change
    minWeight: number;
    maxWeight: number;
  };

  // Circuit breaker
  circuitBreaker: {
    enabled: boolean;
    config: CircuitBreakerConfig;
    failureRateThreshold: number; // 0-1
    slowCallDurationThreshold: number; // milliseconds
    slidingWindowSize: number; // number of calls
    minimumNumberOfCalls: number;
  };

  // Geographic routing
  geographicRouting: {
    enabled: boolean;
    regionWeights: Record<string, number>; // Region -> weight multiplier
    latencyThresholds: {
      preferred: number; // ms
      acceptable: number; // ms
      maximum: number; // ms
    };
    preferredRegions: string[];
    geoReplication: boolean;
  };

  // Performance-based routing
  performanceRouting: {
    enabled: boolean;
    responseTimeWeight: number; // 0-1
    throughputWeight: number; // 0-1
    errorRateWeight: number; // 0-1
    metricsWindow: number; // seconds
    performanceDecayFactor: number; // How quickly old metrics decay
  };

  // Service discovery
  serviceDiscovery: {
    enabled: boolean;
    provider: 'consul' | 'etcd' | 'kubernetes' | 'static';
    config: ServiceDiscoveryConfig;
    healthCheckIntegration: boolean;
    autoRegistration: boolean;
  };

  // Monitoring and metrics
  monitoring: {
    enabled: boolean;
    prometheus: {
      enabled: boolean;
      endpoint: string;
      metricsPrefix: string;
      labels: Record<string, string>;
    };
    realTimeMetrics: boolean;
    metricsExportInterval: number; // seconds
  };

  // Advanced features
  advanced: {
    stickySessions: boolean;
    sessionAffinityKey?: string;
    requestThrottling: boolean;
    maxRequestsPerSecond: number;
    burstCapacity: number;
    predictiveScaling: boolean;
    machineLearningWeights: boolean;
  };
}

export interface LoadBalancerStrategyConfig {
  primary: LoadBalancerStrategyType;
  fallback: LoadBalancerStrategyType;
  adaptive: boolean;
  adaptationThreshold: number;
  performanceWindow: number; // minutes
  strategyRotation: boolean;
  rotationInterval: number; // minutes
}

export type LoadBalancerStrategyType =
  | 'round-robin'
  | 'weighted-round-robin'
  | 'least-connections'
  | 'least-response-time'
  | 'health-based'
  | 'geographic'
  | 'performance-based'
  | 'reputation-weighted'
  | 'adaptive-hybrid'
  | 'consistent-hash'
  | 'maglev';

// Service discovery interfaces
export interface ServiceDiscoveryConfig {
  consul?: {
    address: string;
    datacenter: string;
    servicePrefix: string;
    healthCheckInterval: string;
    timeout: string;
  };
  etcd?: {
    endpoints: string[];
    prefix: string;
    username?: string;
    password?: string;
  };
  kubernetes?: {
    namespace: string;
    labelSelector: Record<string, string>;
    fieldSelector: Record<string, string>;
    configMap: string;
  };
  static?: {
    nodes: NodeInfo[];
    refreshInterval: number; // seconds
  };
}

export interface ServiceInstance {
  id: string;
  name: string;
  address: string;
  port: number;
  metadata: Record<string, string>;
  tags: string[];
  health: ServiceHealth;
  lastSeen: number;
}

export interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'warning';
  checks: Array<{
    name: string;
    status: 'passing' | 'failing' | 'warning';
    output: string;
    timestamp: number;
  }>;
  lastChecked: number;
}

// Enhanced node metrics
export interface NodeMetrics {
  nodeId: string;
  timestamp: number;

  // Performance metrics
  responseTime: {
    current: number;
    average: number;
    p50: number;
    p95: number;
    p99: number;
    trend: 'improving' | 'stable' | 'degrading';
  };

  // Throughput metrics
  throughput: {
    requestsPerSecond: number;
    connectionsPerSecond: number;
    dataTransferredPerSecond: number;
    peakConcurrency: number;
    averageConcurrency: number;
  };

  // Error metrics
  errors: {
    errorRate: number; // 0-1
    consecutiveFailures: number;
    errorTypes: Record<string, number>;
    lastError: string;
    lastErrorTime: number;
  };

  // Resource metrics
  resources: {
    cpu: number; // 0-1
    memory: number; // 0-1
    network: number; // 0-1
    disk: number; // 0-1
  };

  // Circuit breaker metrics
  circuitBreaker: {
    state: CircuitBreakerState;
    failureRate: number;
    slowCallRate: number;
    calls: {
      successful: number;
      failed: number;
      slow: number;
      timeout: number;
      total: number;
    };
  };

  // Geographic metrics
  geographic: {
    region: string;
    latencyByRegion: Record<string, number>;
    availabilityByRegion: Record<string, number>;
  };
}

// Selection context for routing decisions
export interface RoutingContext {
  request: {
    id: string;
    method: string;
    path: string;
    headers: Record<string, string>;
    timestamp: number;
    estimatedComplexity: 'low' | 'medium' | 'high';
    priority: number; // 0-10
  };

  client: {
    ip: string;
    userAgent: string;
    location?: {
      country: string;
      region: string;
      city: string;
      latitude: number;
      longitude: number;
    };
    sessionId?: string;
    userId?: string;
    tier: string;
  };

  system: {
    currentLoad: number; // 0-1
    totalConnections: number;
    averageResponseTime: number;
    errorRate: number;
    healthyNodes: number;
    totalNodes: number;
  };
}

// Routing decision result
export interface RoutingDecision {
  selectedNode: NodeInfo;
  strategy: LoadBalancerStrategyType;
  confidence: number; // 0-1
  reasoning: string[];
  alternatives: Array<{
    node: NodeInfo;
    score: number;
    reason: string;
  }>;
  metadata: {
    selectionTime: number;
    nodeHealth: number;
    geographicScore: number;
    performanceScore: number;
    circuitBreakerState: CircuitBreakerState;
  };
}

// Load balancer statistics
export interface LoadBalancerStats {
  // General stats
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;

  // Node distribution
  nodeDistribution: Record<string, {
    requests: number;
    percentage: number;
    averageResponseTime: number;
    successRate: number;
    currentConnections: number;
    weight: number;
  }>;

  // Strategy performance
  strategyPerformance: Record<LoadBalancerStrategyType, {
    usage: number;
    successRate: number;
    averageResponseTime: number;
  }>;

  // Geographic distribution
  geographicDistribution: Record<string, {
    requests: number;
    averageResponseTime: number;
    preferredNodes: string[];
  }>;

  // Circuit breaker stats
  circuitBreakerStats: {
    totalCircuitBreakers: number;
    openCircuitBreakers: number;
    halfOpenCircuitBreakers: number;
    totalTrips: number;
    averageRecoveryTime: number;
  };

  // Health metrics
  healthMetrics: {
    healthyNodes: number;
    unhealthyNodes: number;
    averageHealthScore: number;
    healthCheckFailures: number;
  };

  // Performance metrics
  performanceMetrics: {
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    throughput: number;
    errorRate: number;
  };
}

// Events emitted by the load balancer
export interface LoadBalancerEvent {
  type: 'node-selected' | 'node-failed' | 'node-recovered' |
        'circuit-breaker-tripped' | 'circuit-breaker-reset' |
        'strategy-changed' | 'health-check-failed' |
        'metrics-updated' | 'configuration-changed';
  timestamp: number;
  nodeId?: string;
  data: any;
}

// Health check interfaces
export interface AdvancedHealthCheckConfig {
  // Basic health check
  basic: {
    enabled: boolean;
    interval: number; // seconds
    timeout: number; // seconds
    path: string;
    expectedStatus: number;
    retries: number;
  };

  // Deep health check
  deep: {
    enabled: boolean;
    interval: number; // seconds
    timeout: number; // seconds
    checks: HealthCheckDefinition[];
    parallel: boolean;
  };

  // Passive health check
  passive: {
    enabled: boolean;
    failureThreshold: number;
    successThreshold: number;
    maxFailures: number;
    monitoringWindow: number; // seconds
  };

  // Health check aggregation
  aggregation: {
    strategy: 'all' | 'any' | 'majority' | 'weighted';
    weights: Record<string, number>;
    scoreThreshold: number; // 0-1
  };
}

export interface HealthCheckDefinition {
  name: string;
  type: 'http' | 'tcp' | 'script' | 'grpc' | 'websocket';
  config: Record<string, any>;
  timeout: number;
  interval: number;
  weight: number;
  critical: boolean;
}

// Prometheus metrics interfaces
export interface PrometheusMetrics {
  // Counter metrics
  counters: {
    requests_total: Map<string, number>;
    failures_total: Map<string, number>;
    circuit_breaker_trips_total: Map<string, number>;
  };

  // Gauge metrics
  gauges: {
    active_connections: Map<string, number>;
    node_weight: Map<string, number>;
    health_score: Map<string, number>;
    response_time_ms: Map<string, number>;
  };

  // Histogram metrics
  histograms: {
    request_duration_seconds: Map<string, number[]>;
    node_selection_time_seconds: number[];
  };

  // Summary metrics
  summaries: {
    response_time_summary: Map<string, number>;
  };
}