import { LogLevel, LogEntry, LogEntry as LogEntryType } from '../types';
import { LoadBalancerEvent, RoutingContext, RoutingDecision } from '../types/load-balancer';

export interface LogContext {
  service: string;
  version: string;
  environment: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  clientIp?: string;
  userAgent?: string;
  traceId?: string;
  spanId?: string;
  nodeId?: string;
  correlationId?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  format: 'json' | 'text';
  output: 'console' | 'file' | 'both';
  filePath?: string;
  maxFileSize?: number; // MB
  maxFiles?: number;
  enableColors: boolean;
  enableTimestamp: boolean;
  enableContext: boolean;
  structuredLogging: boolean;
  metadata: Record<string, any>;
}

export class Logger {
  private level: LogLevel;
  private logs: LogEntryType[] = [];
  private maxLogSize: number = 10000;
  private config: LoggerConfig;
  private context: LogContext;

  constructor(level: LogLevel = LogLevel.INFO, config: Partial<LoggerConfig> = {}) {
    this.level = level;
    this.config = {
      level,
      format: 'text',
      output: 'console',
      enableColors: true,
      enableTimestamp: true,
      enableContext: true,
      structuredLogging: false,
      metadata: {},
      ...config
    };

    this.context = {
      service: 'orange-load-balancer',
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      ...this.config.metadata
    };
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Log an error message
   */
  error(message: string, metadata?: Record<string, any>, error?: Error): void {
    this.log(LogLevel.ERROR, message, metadata, error);
  }

  /**
   * Log a warning message
   */
  warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * Log an info message
   */
  info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * Log a debug message
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Generic log method
   */
  private log(level: LogLevel, message: string, metadata?: Record<string, any>, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry: LogEntryType = {
      timestamp: Date.now(),
      level,
      message,
      metadata: {
        ...this.context,
        ...metadata
      },
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    };

    this.logs.push(logEntry);

    // Maintain log size limit
    if (this.logs.length > this.maxLogSize) {
      this.logs = this.logs.slice(-this.maxLogSize);
    }

    // Output to console
    this.outputToConsole(logEntry);
  }

  /**
   * Log a load balancer event
   */
  logLoadBalancerEvent(event: LoadBalancerEvent, additionalContext?: Partial<LogContext>): void {
    const metadata = {
      eventType: event.type,
      nodeId: event.nodeId,
      eventData: event.data,
      timestamp: event.timestamp
    };

    const level = this.getEventLogLevel(event.type);
    const context = { ...this.context, ...additionalContext };

    this.log(level, `Load balancer event: ${event.type}`, { ...context, ...metadata });
  }

  /**
   * Log routing decision
   */
  logRoutingDecision(decision: RoutingDecision, context: RoutingContext): void {
    const metadata = {
      selectedNode: decision.selectedNode.address,
      strategy: decision.strategy,
      confidence: decision.confidence,
      selectionTime: decision.metadata.selectionTime,
      nodeHealth: decision.metadata.nodeHealth,
      circuitBreakerState: decision.metadata.circuitBreakerState.state,
      alternatives: decision.alternatives.map(alt => ({
        nodeId: alt.node.address,
        score: alt.score,
        reason: alt.reason
      }))
    };

    const logContext = {
      ...this.context,
      requestId: context.request.id,
      userId: context.client.userId,
      sessionId: context.client.sessionId,
      clientIp: context.client.ip
    };

    this.log(
      LogLevel.INFO,
      `Node selected: ${decision.selectedNode.address} using ${decision.strategy} strategy`,
      { ...logContext, ...metadata }
    );
  }

  /**
   * Log request execution
   */
  logRequestExecution(
    nodeId: string,
    success: boolean,
    duration: number,
    context: RoutingContext,
    error?: Error
  ): void {
    const metadata: {
      nodeId: string;
      success: boolean;
      duration: number;
      method: string;
      path: string;
      statusCode: number;
      error?: { name: string; message: string; stack?: string };
    } = {
      nodeId,
      success,
      duration,
      method: context.request.method,
      path: context.request.path,
      statusCode: success ? 200 : 500
    };

    if (error) {
      metadata.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }

    const logContext = {
      ...this.context,
      requestId: context.request.id,
      userId: context.client.userId,
      sessionId: context.client.sessionId,
      clientIp: context.client.ip
    };

    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    const message = success
      ? `Request completed successfully in ${duration}ms`
      : `Request failed after ${duration}ms: ${error?.message}`;

    this.log(level, message, { ...logContext, ...metadata }, error);
  }

  /**
   * Log circuit breaker events
   */
  logCircuitBreakerEvent(
    nodeId: string,
    event: 'tripped' | 'reset' | 'half-open',
    failureRate: number,
    additionalContext?: Partial<LogContext>
  ): void {
    const metadata = {
      nodeId,
      event,
      failureRate,
      timestamp: Date.now()
    };

    const context = { ...this.context, nodeId, ...additionalContext };
    const level = event === 'tripped' ? LogLevel.WARN : LogLevel.INFO;
    const message = `Circuit breaker ${event} for node ${nodeId} (failure rate: ${(failureRate * 100).toFixed(2)}%)`;

    this.log(level, message, { ...context, ...metadata });
  }

  /**
   * Log health check results
   */
  logHealthCheckResult(
    nodeId: string,
    isHealthy: boolean,
    score: number,
    responseTime: number,
    checks: Array<{ name: string; status: string; error?: string }>
  ): void {
    const metadata = {
      nodeId,
      isHealthy,
      score,
      responseTime,
      checks,
      timestamp: Date.now()
    };

    const context = { ...this.context, nodeId };
    const level = isHealthy ? LogLevel.DEBUG : LogLevel.WARN;
    const message = `Health check for ${nodeId}: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'} (score: ${score.toFixed(2)}, response time: ${responseTime}ms)`;

    this.log(level, message, { ...context, ...metadata });
  }

  /**
   * Log service discovery events
   */
  logServiceDiscoveryEvent(
    event: 'service-registered' | 'service-deregistered' | 'service-updated',
    serviceId: string,
    serviceName: string,
    additionalMetadata?: Record<string, any>
  ): void {
    const metadata = {
      event,
      serviceId,
      serviceName,
      ...additionalMetadata,
      timestamp: Date.now()
    };

    this.log(
      LogLevel.INFO,
      `Service discovery: ${event} for service ${serviceName} (${serviceId})`,
      { ...this.context, ...metadata }
    );
  }

  /**
   * Log performance metrics
   */
  logPerformanceMetrics(metrics: any): void {
    const metadata = {
      metrics: {
        totalRequests: metrics.totalRequests,
        averageResponseTime: metrics.averageResponseTime,
        healthyNodes: metrics.healthMetrics?.healthyNodes || 0,
        errorRate: metrics.performanceMetrics?.errorRate || 0,
        throughput: metrics.performanceMetrics?.throughput || 0
      }
    };

    this.log(LogLevel.DEBUG, 'Performance metrics updated', { ...this.context, ...metadata });
  }

  /**
   * Get log level for event type
   */
  private getEventLogLevel(eventType: string): LogLevel {
    switch (eventType) {
      case 'node-failed':
      case 'circuit-breaker-tripped':
      case 'health-check-failed':
        return LogLevel.WARN;
      case 'node-selected':
      case 'node-recovered':
      case 'circuit-breaker-reset':
        return LogLevel.INFO;
      case 'metrics-updated':
      case 'configuration-changed':
        return LogLevel.DEBUG;
      default:
        return LogLevel.INFO;
    }
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
    const currentLevelIndex = levels.indexOf(this.level);
    const messageLevelIndex = levels.indexOf(level);

    return messageLevelIndex <= currentLevelIndex;
  }

  /**
   * Output log entry to console with appropriate formatting
   */
  private outputToConsole(logEntry: LogEntryType): void {
    const timestamp = new Date(logEntry.timestamp).toISOString();
    const level = logEntry.level.toUpperCase().padEnd(5);
    let message = `[${timestamp}] ${level} ${logEntry.message}`;

    // Add metadata if present
    if (logEntry.metadata && Object.keys(logEntry.metadata).length > 0) {
      message += ` | ${JSON.stringify(logEntry.metadata)}`;
    }

    // Add error details if present
    if (logEntry.error) {
      message += ` | Error: ${logEntry.error.message}`;
      if (logEntry.error.stack) {
        console.error(message);
        console.error(logEntry.error.stack);
        return;
      }
    }

    // Output based on level
    switch (logEntry.level) {
      case LogLevel.ERROR:
        console.error(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.INFO:
        console.info(message);
        break;
      case LogLevel.DEBUG:
        console.debug(message);
        break;
    }
  }

  /**
   * Get all log entries
   */
  getLogs(): LogEntryType[] {
    return [...this.logs];
  }

  /**
   * Get log entries filtered by level
   */
  getLogsByLevel(level: LogLevel): LogEntryType[] {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Get recent log entries
   */
  getRecentLogs(count: number = 100): LogEntryType[] {
    return this.logs.slice(-count);
  }

  /**
   * Get logs within a time range
   */
  getLogsByTimeRange(startTime: number, endTime: number): LogEntryType[] {
    return this.logs.filter(log => log.timestamp >= startTime && log.timestamp <= endTime);
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Get log statistics
   */
  getStats(): {
    total: number;
    byLevel: Record<LogLevel, number>;
    oldestTimestamp?: number;
    newestTimestamp?: number;
  } {
    const byLevel: Record<LogLevel, number> = {
      [LogLevel.ERROR]: 0,
      [LogLevel.WARN]: 0,
      [LogLevel.INFO]: 0,
      [LogLevel.DEBUG]: 0,
    };

    let oldestTimestamp: number | undefined;
    let newestTimestamp: number | undefined;

    for (const log of this.logs) {
      byLevel[log.level]++;

      if (!oldestTimestamp || log.timestamp < oldestTimestamp) {
        oldestTimestamp = log.timestamp;
      }
      if (!newestTimestamp || log.timestamp > newestTimestamp) {
        newestTimestamp = log.timestamp;
      }
    }

    return {
      total: this.logs.length,
      byLevel,
      oldestTimestamp,
      newestTimestamp,
    };
  }

  /**
   * Export logs to JSON string
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Import logs from JSON string
   */
  importLogs(logsJson: string): void {
    try {
      const importedLogs = JSON.parse(logsJson) as LogEntryType[];
      if (Array.isArray(importedLogs)) {
        this.logs = [...this.logs, ...importedLogs].sort((a, b) => a.timestamp - b.timestamp);

        // Maintain log size limit
        if (this.logs.length > this.maxLogSize) {
          this.logs = this.logs.slice(-this.maxLogSize);
        }
      }
    } catch (error) {
      this.error('Failed to import logs', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Partial<LogContext>): ChildLogger {
    return new ChildLogger(this, context);
  }

  /**
   * Create a child logger with correlation ID
   */
  withCorrelation(correlationId: string, additionalContext?: Partial<LogContext>): ChildLogger {
    return new ChildLogger(this, {
      correlationId,
      ...additionalContext
    });
  }

  /**
   * Create a request-specific logger
   */
  forRequest(requestId: string, context: RoutingContext): ChildLogger {
    return new ChildLogger(this, {
      requestId,
      userId: context.client.userId,
      sessionId: context.client.sessionId,
      clientIp: context.client.ip,
      traceId: context.request.id
    });
  }
}

/**
 * Load Balancer specific logger with predefined context and methods
 */
export class LoadBalancerLogger extends Logger {
  constructor(config: Partial<LoggerConfig> = {}) {
    super(LogLevel.INFO, {
      ...config,
      metadata: {
        component: 'load-balancer',
        ...config.metadata
      }
    });
  }

  /**
   * Log node addition
   */
  logNodeAdded(node: any): void {
    this.info(
      `Node added: ${node.address} (${node.friendlyName})`,
      {
        nodeId: node.address,
        nodeInfo: {
          address: node.address,
          friendlyName: node.friendlyName,
          network: node.network,
          version: node.version,
          geolocation: node.geolocation
        }
      }
    );
  }

  /**
   * Log node removal
   */
  logNodeRemoved(nodeId: string, reason?: string): void {
    this.info(
      `Node removed: ${nodeId}${reason ? ` (${reason})` : ''}`,
      { nodeId }
    );
  }

  /**
   * Log strategy change
   */
  logStrategyChange(from: string, to: string, reason?: string): void {
    this.info(
      `Load balancing strategy changed from ${from} to ${to}`,
      {
        strategyChange: { from, to, reason },
        timestamp: Date.now()
      }
    );
  }

  /**
   * Log configuration changes
   */
  logConfigurationChange(
    component: string,
    changes: Record<string, any>,
    reason?: string
  ): void {
    this.info(
      `Configuration updated for ${component}`,
      {
        configurationChange: {
          component,
          changes,
          reason,
          timestamp: Date.now()
        }
      }
    );
  }
}

/**
 * Child logger that automatically includes context metadata
 */
export class ChildLogger {
  private parent: Logger;
  private context: Record<string, any>;

  constructor(parent: Logger, context: Record<string, any>) {
    this.parent = parent;
    this.context = context;
  }

  error(message: string, metadata?: Record<string, any>, error?: Error): void {
    this.parent.error(message, { ...this.context, ...metadata }, error);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.parent.warn(message, { ...this.context, ...metadata });
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.parent.info(message, { ...this.context, ...metadata });
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.parent.debug(message, { ...this.context, ...metadata });
  }

  getLogs(): LogEntryType[] {
    return this.parent.getLogs();
  }

  getStats(): ReturnType<Logger['getStats']> {
    return this.parent.getStats();
  }
}

/**
 * Create a new logger instance
 */
export function createLogger(level?: LogLevel, config?: Partial<LoggerConfig>): Logger {
  return new Logger(level, config);
}

/**
 * Create a logger with correlation ID
 */
export function createLoggerWithCorrelation(correlationId: string, additionalContext?: Partial<LogContext>): Logger {
  return new Logger(LogLevel.INFO, {
    metadata: {
      correlationId,
      ...additionalContext
    }
  });
}

/**
 * Global logger instance
 */
export const logger = new LoadBalancerLogger({
  level: process.env.LOG_LEVEL ? LogLevel[process.env.LOG_LEVEL.toUpperCase() as keyof typeof LogLevel] : LogLevel.INFO,
  format: process.env.LOG_FORMAT as 'json' | 'text' || 'text',
  enableColors: process.env.NODE_ENV !== 'production',
  structuredLogging: process.env.NODE_ENV === 'production'
});

/**
 * Create a request-specific logger
 */
export function createRequestLogger(requestId: string, context: RoutingContext): ChildLogger {
  return logger.forRequest(requestId, context);
}