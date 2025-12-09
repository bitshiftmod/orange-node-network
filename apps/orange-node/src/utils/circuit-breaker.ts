import { EventEmitter } from 'events';
import { CircuitBreakerConfig, CircuitBreakerState } from '../types';

export class CircuitBreaker extends EventEmitter {
  private state: CircuitBreakerState;
  private config: CircuitBreakerConfig;
  private requestCount: number = 0;
  private failureCount: number = 0;
  private monitoringTimer?: NodeJS.Timeout;

  constructor(config: CircuitBreakerConfig) {
    super();
    this.config = config;
    this.state = {
      state: 'CLOSED',
      failureCount: 0,
      lastFailureTime: new Date(),
      successCount: 0
    };
    this.startMonitoring();
  }

  private startMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }

    this.monitoringTimer = setInterval(() => {
      this.resetMonitoring();
    }, this.config.monitoringPeriod);
  }

  private resetMonitoring(): void {
    // Monitoring period reset;
    this.requestCount = 0;
    this.failureCount = 0;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.requestCount++;

    if (this.state.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const startTime = Date.now();
      const result = await operation();
      const duration = Date.now() - startTime;

      this.onSuccess(duration);
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  private onSuccess(duration: number): void {
    if (this.state.state === 'HALF_OPEN') {
      this.state.successCount++;
      if (this.state.successCount >= 2) { // Require 2 successes to close
        this.transitionToClosed();
      }
    } else {
      this.state.successCount = 0;
    }

    this.emit('success', { duration, state: this.state.state });
  }

  private onFailure(error: Error): void {
    this.failureCount++;
    this.state.failureCount++;
    this.state.lastFailureTime = new Date();

    if (this.state.state === 'HALF_OPEN') {
      this.transitionToOpen();
    } else if (this.shouldOpenCircuit()) {
      this.transitionToOpen();
    }

    this.emit('failure', { error, state: this.state.state });
  }

  private shouldOpenCircuit(): boolean {
    const timeSinceLastFailure = Date.now() - this.state.lastFailureTime.getTime();

    if (timeSinceLastFailure > this.config.monitoringPeriod) {
      return this.state.failureCount >= this.config.failureThreshold;
    }

    return false;
  }

  private shouldAttemptReset(): boolean {
    return Date.now() >= this.state.nextAttemptTime!.getTime();
  }

  private transitionToClosed(): void {
    const previousState = this.state.state;
    this.state = {
      state: 'CLOSED',
      failureCount: 0,
      lastFailureTime: new Date(),
      successCount: 0
    };
    this.emit('stateChange', { from: previousState, to: 'CLOSED' });
  }

  private transitionToOpen(): void {
    const previousState = this.state.state;
    this.state = {
      ...this.state,
      state: 'OPEN',
      nextAttemptTime: new Date(Date.now() + this.config.resetTimeout)
    };
    this.emit('stateChange', { from: previousState, to: 'OPEN' });
  }

  private transitionToHalfOpen(): void {
    const previousState = this.state.state;
    this.state = {
      ...this.state,
      state: 'HALF_OPEN',
      successCount: 0
    };
    this.emit('stateChange', { from: previousState, to: 'HALF_OPEN' });
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  getStats() {
    return {
      state: this.state.state,
      failureCount: this.state.failureCount,
      successCount: this.state.successCount,
      requestCount: this.requestCount,
      failureRate: this.requestCount > 0 ? this.failureCount / this.requestCount : 0,
      timeSinceLastFailure: this.state.lastFailureTime ? Date.now() - this.state.lastFailureTime.getTime() : 0
    };
  }

  reset(): void {
    this.transitionToClosed();
  }

  destroy(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    this.removeAllListeners();
  }
}