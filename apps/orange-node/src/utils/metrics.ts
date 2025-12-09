import client from 'prom-client';
import { NodeMetrics, PerformanceMetric, ErrorMetric } from '../types';

export class MetricsCollector {
  private registry: client.Registry;
  private metrics: {
    // HTTP request metrics
    httpRequestsTotal: client.Counter;
    httpRequestDuration: client.Histogram;
    httpRequestSize: client.Histogram;
    httpResponseSize: client.Histogram;

    // Error metrics
    httpErrorsTotal: client.Counter;
    errorRate: client.Gauge;

    // Connection metrics
    activeConnections: client.Gauge;
    connectionPoolSize: client.Gauge;
    connectionErrorsTotal: client.Counter;

    // Cache metrics
    cacheHits: client.Counter;
    cacheMisses: client.Counter;
    cacheSize: client.Gauge;

    // Rate limiting metrics
    rateLimitHits: client.Counter;
    rateLimitBlocks: client.Counter;

    // Circuit breaker metrics
    circuitBreakerState: client.Gauge;
    circuitBreakerFailures: client.Counter;

    // Node-specific metrics
    algodRequestsTotal: client.Counter;
    algodRequestDuration: client.Histogram;
    algodErrorsTotal: client.Counter;
    algodLastBlock: client.Gauge;
    algodConnections: client.Gauge;

    // System metrics
    memoryUsage: client.Gauge;
    cpuUsage: client.Gauge;
    uptime: client.Gauge;
  };

  private performanceMetrics: PerformanceMetric[] = [];
  private errorMetrics: ErrorMetric[] = [];
  private readonly maxMetricsHistory = 10000;
  private readonly metricsCleanupInterval = 60000; // 1 minute
  private maxConcurrentConnections = 0;
  private metricsCollectionInterval: NodeJS.Timeout | undefined;
  private metricsCleanupIntervalTimer: NodeJS.Timeout | undefined;

  constructor() {
    this.registry = new client.Registry();
    // Initialize metrics property before initializing metrics
    this.metrics = {} as any;
    this.initializeMetrics();
    this.startMetricsCollection();
    this.startMetricsCleanup();
  }

  private initializeMetrics(): void {
    // HTTP request metrics
    this.metrics.httpRequestsTotal = new client.Counter({
      name: 'orange_node_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry]
    });

    this.metrics.httpRequestDuration = new client.Histogram({
      name: 'orange_node_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
      registers: [this.registry]
    });

    this.metrics.httpRequestSize = new client.Histogram({
      name: 'orange_node_http_request_size_bytes',
      help: 'Size of HTTP requests in bytes',
      labelNames: ['method', 'route'],
      buckets: [100, 500, 1000, 5000, 10000, 50000, 100000],
      registers: [this.registry]
    });

    this.metrics.httpResponseSize = new client.Histogram({
      name: 'orange_node_http_response_size_bytes',
      help: 'Size of HTTP responses in bytes',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [100, 500, 1000, 5000, 10000, 50000, 100000],
      registers: [this.registry]
    });

    // Error metrics
    this.metrics.httpErrorsTotal = new client.Counter({
      name: 'orange_node_http_errors_total',
      help: 'Total number of HTTP errors',
      labelNames: ['method', 'route', 'status_code', 'error_type'],
      registers: [this.registry]
    });

    this.metrics.errorRate = new client.Gauge({
      name: 'orange_node_error_rate',
      help: 'Current error rate (errors / total requests)',
      labelNames: ['method', 'route'],
      registers: [this.registry]
    });

    // Connection metrics
    this.metrics.activeConnections = new client.Gauge({
      name: 'orange_node_active_connections',
      help: 'Number of active connections',
      registers: [this.registry]
    });

    this.metrics.connectionPoolSize = new client.Gauge({
      name: 'orange_node_connection_pool_size',
      help: 'Size of the connection pool',
      registers: [this.registry]
    });

    this.metrics.connectionErrorsTotal = new client.Counter({
      name: 'orange_node_connection_errors_total',
      help: 'Total number of connection errors',
      labelNames: ['type'],
      registers: [this.registry]
    });

    // Cache metrics
    this.metrics.cacheHits = new client.Counter({
      name: 'orange_node_cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['endpoint'],
      registers: [this.registry]
    });

    this.metrics.cacheMisses = new client.Counter({
      name: 'orange_node_cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['endpoint'],
      registers: [this.registry]
    });

    this.metrics.cacheSize = new client.Gauge({
      name: 'orange_node_cache_size',
      help: 'Current cache size',
      registers: [this.registry]
    });

    // Rate limiting metrics
    this.metrics.rateLimitHits = new client.Counter({
      name: 'orange_node_rate_limit_hits_total',
      help: 'Total number of rate limit hits',
      registers: [this.registry]
    });

    this.metrics.rateLimitBlocks = new client.Counter({
      name: 'orange_node_rate_limit_blocks_total',
      help: 'Total number of requests blocked by rate limiting',
      registers: [this.registry]
    });

    // Circuit breaker metrics
    this.metrics.circuitBreakerState = new client.Gauge({
      name: 'orange_node_circuit_breaker_state',
      help: 'Circuit breaker state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)',
      labelNames: ['service'],
      registers: [this.registry]
    });

    this.metrics.circuitBreakerFailures = new client.Counter({
      name: 'orange_node_circuit_breaker_failures_total',
      help: 'Total number of circuit breaker failures',
      labelNames: ['service'],
      registers: [this.registry]
    });

    // Node-specific metrics
    this.metrics.algodRequestsTotal = new client.Counter({
      name: 'orange_node_algod_requests_total',
      help: 'Total number of requests to Algod',
      labelNames: ['endpoint', 'method'],
      registers: [this.registry]
    });

    this.metrics.algodRequestDuration = new client.Histogram({
      name: 'orange_node_algod_request_duration_seconds',
      help: 'Duration of requests to Algod in seconds',
      labelNames: ['endpoint', 'method'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
      registers: [this.registry]
    });

    this.metrics.algodErrorsTotal = new client.Counter({
      name: 'orange_node_algod_errors_total',
      help: 'Total number of errors from Algod',
      labelNames: ['endpoint', 'error_type'],
      registers: [this.registry]
    });

    this.metrics.algodLastBlock = new client.Gauge({
      name: 'orange_node_algod_last_block',
      help: 'Last block number from Algod',
      registers: [this.registry]
    });

    this.metrics.algodConnections = new client.Gauge({
      name: 'orange_node_algod_connections',
      help: 'Number of active connections to Algod',
      registers: [this.registry]
    });

    // System metrics
    this.metrics.memoryUsage = new client.Gauge({
      name: 'orange_node_memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['type'],
      registers: [this.registry]
    });

    this.metrics.cpuUsage = new client.Gauge({
      name: 'orange_node_cpu_usage_percent',
      help: 'CPU usage percentage',
      registers: [this.registry]
    });

    this.metrics.uptime = new client.Gauge({
      name: 'orange_node_uptime_seconds',
      help: 'Uptime in seconds',
      registers: [this.registry]
    });

    // Set default labels and values
    this.setDefaultMetrics();
  }

  private setDefaultMetrics(): void {
    this.metrics.circuitBreakerState.set({ service: 'algod' }, 0); // CLOSED
  }

  private startMetricsCollection(): void {
    // Collect system metrics every 5 seconds
    this.metricsCollectionInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 5000);
  }

  private startMetricsCleanup(): void {
    // Clean up old metrics every minute
    this.metricsCleanupIntervalTimer = setInterval(() => {
      this.cleanupOldMetrics();
    }, this.metricsCleanupInterval);
  }

  private collectSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage.set({ type: 'heap_used' }, memUsage.heapUsed);
    this.metrics.memoryUsage.set({ type: 'heap_total' }, memUsage.heapTotal);
    this.metrics.memoryUsage.set({ type: 'rss' }, memUsage.rss);
    this.metrics.memoryUsage.set({ type: 'external' }, memUsage.external);

    this.metrics.uptime.set(process.uptime());
  }

  private cleanupOldMetrics(): void {
    // Keep only the most recent metrics
    const now = Date.now();
    const cutoff = now - (24 * 60 * 60 * 1000); // 24 hours

    this.performanceMetrics = this.performanceMetrics.filter(m =>
      new Date(m.timestamp).getTime() > cutoff
    );

    this.errorMetrics = this.errorMetrics.filter(m =>
      new Date(m.timestamp).getTime() > cutoff
    );

    // Ensure we don't exceed max history
    if (this.performanceMetrics.length > this.maxMetricsHistory) {
      this.performanceMetrics = this.performanceMetrics.slice(-this.maxMetricsHistory);
    }

    if (this.errorMetrics.length > this.maxMetricsHistory) {
      this.errorMetrics = this.errorMetrics.slice(-this.maxMetricsHistory);
    }
  }

  // HTTP request metrics
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number, requestSize: number, responseSize: number): void {
    const labels = { method, route, status_code: statusCode.toString() };

    this.metrics.httpRequestsTotal.inc(labels);
    this.metrics.httpRequestDuration.observe(labels, duration / 1000);
    this.metrics.httpRequestSize.observe({ method, route }, requestSize);
    this.metrics.httpResponseSize.observe(labels, responseSize);

    // Record performance metric
    this.performanceMetrics.push({
      timestamp: new Date(),
      endpoint: route,
      method,
      responseTime: duration,
      statusCode,
      cacheHit: false,
      retryAttempt: 0
    });

    // Record error if status code indicates error
    if (statusCode >= 400) {
      this.recordHttpError(method, route, statusCode, 'http_error', duration);
    }

    // Trim metrics history if needed
    if (this.performanceMetrics.length > this.maxMetricsHistory) {
      this.performanceMetrics = this.performanceMetrics.slice(-this.maxMetricsHistory);
    }
  }

  recordHttpError(method: string, route: string, statusCode: number, errorType: string, _duration: number): void {
    const labels = { method, route, status_code: statusCode.toString(), error_type: errorType };
    this.metrics.httpErrorsTotal.inc(labels);

    // Calculate error rate
    this.calculateErrorRate(method, route);
  }

  private calculateErrorRate(method: string, route: string): void {
    // This is a simplified calculation - in production, you'd want a more sophisticated approach
    const recentMetrics = this.performanceMetrics.filter(m =>
      m.method === method &&
      m.endpoint === route &&
      new Date(m.timestamp).getTime() > Date.now() - 60000 // Last minute
    );

    if (recentMetrics.length > 0) {
      const errorCount = recentMetrics.filter(m => m.statusCode >= 400).length;
      const errorRate = errorCount / recentMetrics.length;
      this.metrics.errorRate.set({ method, route }, errorRate);
    }
  }

  // Connection metrics
  incrementActiveConnections(): void {
    this.metrics.activeConnections.inc();
    const current = this.performanceMetrics.length; // Approximate
    if (current > this.maxConcurrentConnections) {
      this.maxConcurrentConnections = current;
    }
  }

  decrementActiveConnections(): void {
    this.metrics.activeConnections.dec();
  }

  updateConnectionPoolSize(size: number): void {
    this.metrics.connectionPoolSize.set(size);
  }

  recordConnectionError(type: string): void {
    this.metrics.connectionErrorsTotal.inc({ type });
  }

  // Cache metrics
  recordCacheHit(endpoint: string): void {
    this.metrics.cacheHits.inc({ endpoint });
  }

  recordCacheMiss(endpoint: string): void {
    this.metrics.cacheMisses.inc({ endpoint });
  }

  updateCacheSize(size: number): void {
    this.metrics.cacheSize.set(size);
  }

  // Rate limiting metrics
  recordRateLimitHit(): void {
    this.metrics.rateLimitHits.inc();
  }

  recordRateLimitBlock(): void {
    this.metrics.rateLimitBlocks.inc();
  }

  // Circuit breaker metrics
  updateCircuitBreakerState(service: string, state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'): void {
    const stateValue = state === 'CLOSED' ? 0 : state === 'OPEN' ? 1 : 2;
    this.metrics.circuitBreakerState.set({ service }, stateValue);
  }

  recordCircuitBreakerFailure(service: string): void {
    this.metrics.circuitBreakerFailures.inc({ service });
  }

  // Algod metrics
  recordAlgodRequest(endpoint: string, method: string, duration: number): void {
    this.metrics.algodRequestsTotal.inc({ endpoint, method });
    this.metrics.algodRequestDuration.observe({ endpoint, method }, duration / 1000);
  }

  recordAlgodError(endpoint: string, errorType: string): void {
    this.metrics.algodErrorsTotal.inc({ endpoint, error_type: errorType });
  }

  updateAlgodLastBlock(blockNumber: number): void {
    this.metrics.algodLastBlock.set(blockNumber);
  }

  updateAlgodConnections(count: number): void {
    this.metrics.algodConnections.set(count);
  }

  // Get metrics data
  getNodeMetrics(): NodeMetrics {
    const recentMetrics = this.performanceMetrics.filter(m =>
      new Date(m.timestamp).getTime() > Date.now() - 300000 // Last 5 minutes
    );

    const responseTimes = recentMetrics.map(m => m.responseTime).sort((a, b) => a - b);
    const totalCount = recentMetrics.length;
    const errorCount = recentMetrics.filter(m => m.statusCode >= 400).length;

    return {
      requestCounters: {
        total: totalCount,
        successful: totalCount - errorCount,
        failed: errorCount,
        timeout: recentMetrics.filter(m => m.statusCode === 408).length,
        rateLimited: 0 // This would need to be tracked separately
      },
      responseTimeMetrics: {
        average: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
        p50: this.percentile(responseTimes, 50),
        p90: this.percentile(responseTimes, 90),
        p95: this.percentile(responseTimes, 95),
        p99: this.percentile(responseTimes, 99),
        min: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
        max: responseTimes.length > 0 ? Math.max(...responseTimes) : 0
      },
      errorMetrics: {
        totalErrors: errorCount,
        errorsByType: this.groupErrorsByType(this.errorMetrics),
        errorsByEndpoint: this.groupErrorsByEndpoint(this.errorMetrics),
        recentErrors: this.errorMetrics.slice(-100)
      },
      throughputMetrics: {
        requestsPerSecond: this.calculateRequestsPerSecond(recentMetrics, 1),
        requestsPerMinute: this.calculateRequestsPerSecond(recentMetrics, 60),
        requestsPerHour: this.calculateRequestsPerSecond(recentMetrics, 3600),
        peakRequestsPerSecond: this.calculatePeakRequestsPerSecond(recentMetrics)
      },
      connectionMetrics: {
        activeConnections: 0, // Would need async metrics.get()
        totalConnections: 0,
        connectionErrors: this.getConnectionErrorCount(),
        connectionTimeouts: 0, // This would need to be tracked separately
        maxConcurrentConnections: this.maxConcurrentConnections
      },
      cacheMetrics: {
        hitRate: this.calculateCacheHitRate(),
        missRate: this.calculateCacheMissRate(),
        cacheSize: 0, // Would need async metrics.get()
        evictions: 0, // This would need to be tracked separately
        keysTTL: 0 // Would need to be tracked
      }
    };
  }

  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)] || 0;
  }

  private groupErrorsByType(errors: ErrorMetric[]): Record<string, number> {
    return errors.reduce((acc, error) => {
      acc[error.errorType] = (acc[error.errorType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private groupErrorsByEndpoint(errors: ErrorMetric[]): Record<string, number> {
    return errors.reduce((acc, error) => {
      acc[error.endpoint] = (acc[error.endpoint] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private calculateRequestsPerSecond(metrics: PerformanceMetric[], windowSeconds: number): number {
    if (metrics.length === 0) return 0;
    return metrics.length / windowSeconds;
  }

  private calculatePeakRequestsPerSecond(metrics: PerformanceMetric[]): number {
    // Group by second and find the peak
    const requestsBySecond: Record<string, number> = {};

    metrics.forEach(m => {
      const second = Math.floor(new Date(m.timestamp).getTime() / 1000);
      requestsBySecond[second] = (requestsBySecond[second] || 0) + 1;
    });

    return Math.max(...Object.values(requestsBySecond), 0);
  }

  private getConnectionErrorCount(): number {
    // This would need to be implemented by tracking connection errors separately
    return 0;
  }

  private calculateCacheHitRate(): number {
    // Simplified - in production sync metrics access would be needed
    return 0;
  }

  private calculateCacheMissRate(): number {
    // Simplified - in production sync metrics access would be needed
    return 0;
  }

  // Get Prometheus metrics string
  async getPrometheusMetrics(): Promise<string> {
    return await this.registry.metrics();
  }

  // Get the Prometheus registry
  getRegistry(): client.Registry {
    return this.registry;
  }

  // Cleanup resources
  destroy(): void {
    if (this.metricsCollectionInterval) {
      clearInterval(this.metricsCollectionInterval);
      this.metricsCollectionInterval = undefined;
    }
    if (this.metricsCleanupIntervalTimer) {
      clearInterval(this.metricsCleanupIntervalTimer);
      this.metricsCleanupIntervalTimer = undefined;
    }
    this.registry.clear();
  }
}

// Singleton instance
let metricsInstance: MetricsCollector | null = null;

export const createMetricsCollector = (): MetricsCollector => {
  if (!metricsInstance) {
    metricsInstance = new MetricsCollector();
  }
  return metricsInstance;
};

export const getMetricsCollector = (): MetricsCollector => {
  if (!metricsInstance) {
    throw new Error('Metrics collector not initialized. Call createMetricsCollector first.');
  }
  return metricsInstance;
};

export default MetricsCollector;