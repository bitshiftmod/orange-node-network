/**
 * Subscription Management Module
 * 
 * Provides subscription management functionality for the Orange Node Network.
 */

import type { Subscription, EventData, EventListener, EventType } from '../types';
import { SubscriptionError, NotFoundError, ValidationError } from '../errors';

/**
 * Subscription tier configuration
 */
export interface SubscriptionTier {
  id: string;
  name: string;
  /** Monthly price in microAlgos */
  price: number;
  features: string[];
  limits: {
    requestsPerSecond: number;
    requestsPerDay: number;
    concurrentRequests: number;
  };
  maxTransactionSize?: number;
  apiLevel: number;
}

/**
 * Available subscription tiers
 */
export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  basic: {
    id: 'basic',
    name: 'Basic',
    price: 1000000, // 1 ALGO
    features: ['read-api', 'basic-support'],
    limits: {
      requestsPerSecond: 10,
      requestsPerDay: 10000,
      concurrentRequests: 5
    },
    maxTransactionSize: 1000,
    apiLevel: 1
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    price: 5000000, // 5 ALGO
    features: ['read-api', 'write-api', 'advanced-support', 'priority-access'],
    limits: {
      requestsPerSecond: 50,
      requestsPerDay: 100000,
      concurrentRequests: 25
    },
    maxTransactionSize: 5000,
    apiLevel: 5
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 20000000, // 20 ALGO
    features: ['read-api', 'write-api', 'advanced-support', 'priority-access', 'custom-features', 'dedicated-support'],
    limits: {
      requestsPerSecond: 200,
      requestsPerDay: 1000000,
      concurrentRequests: 100
    },
    maxTransactionSize: 10000,
    apiLevel: 10
  }
};

/**
 * Options for creating a subscription
 */
export interface CreateSubscriptionOptions {
  tier: string;
  subscriber: string;
  billingPeriod?: number;
  autoRenew?: boolean;
  startsAt?: number;
  metadata?: Record<string, any>;
  giftTo?: string;
}

/**
 * Options for updating a subscription
 */
export interface UpdateSubscriptionOptions {
  tier?: string;
  autoRenew?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Subscription usage statistics
 */
export interface SubscriptionUsage {
  currentPeriod: {
    requests: number;
    dataTransferred: number;
    transactions: number;
    periodStart: number;
    periodEnd: number;
  };
  allTime: {
    requests: number;
    dataTransferred: number;
    transactions: number;
    since: number;
  };
}

/**
 * Subscription event data
 */
export interface SubscriptionEventData {
  subscriptionId: string;
  subscriber: string;
  event: 'created' | 'updated' | 'cancelled' | 'renewed' | 'expired' | 'upgraded' | 'downgraded';
  previousTier?: string;
  newTier?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Subscription Manager
 * 
 * Handles subscription lifecycle operations via the gateway API.
 */
export class SubscriptionManager {
  private eventListeners = new Map<EventType, EventListener[]>();
  private usageTracker = new Map<string, SubscriptionUsage>();

  constructor(private httpClient: any) {}

  /**
   * Create a new subscription
   */
  async createSubscription(options: CreateSubscriptionOptions): Promise<Subscription> {
    const tier = SUBSCRIPTION_TIERS[options.tier];
    if (!tier) {
      throw new ValidationError(`Invalid subscription tier: ${options.tier}`);
    }

    try {
      const payload = {
        tier: options.tier,
        subscriber: options.subscriber,
        giftTo: options.giftTo,
        billingPeriod: options.billingPeriod || (30 * 24 * 60 * 60),
        autoRenew: options.autoRenew !== undefined ? options.autoRenew : true,
        startsAt: options.startsAt || Date.now(),
        amount: tier.price,
        features: tier.features,
        metadata: options.metadata
      };

      const response = await this.httpClient.post('/subscriptions', payload);
      const subscription = response as Subscription;

      this.initializeUsageTracking(subscription);
      this.emitEvent('subscription:created', {
        subscriptionId: subscription.id,
        subscriber: subscription.subscriber,
        event: 'created',
        timestamp: Date.now(),
        metadata: { tier: subscription.tier }
      });

      return subscription;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new SubscriptionError(
        `Failed to create subscription: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<Subscription> {
    try {
      return await this.httpClient.get(`/subscriptions/${subscriptionId}`) as Subscription;
    } catch (error: any) {
      if (error.status === 404) {
        throw new NotFoundError('Subscription', subscriptionId);
      }
      throw new SubscriptionError(
        `Failed to get subscription: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Get subscriptions for a user address
   */
  async getUserSubscriptions(address: string): Promise<Subscription[]> {
    try {
      return await this.httpClient.get('/subscriptions', { subscriber: address }) as Subscription[];
    } catch (error) {
      throw new SubscriptionError(
        `Failed to get user subscriptions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get active subscription for a user
   */
  async getActiveSubscription(address: string): Promise<Subscription | null> {
    try {
      const subscriptions = await this.getUserSubscriptions(address);
      const now = Date.now();

      for (const subscription of subscriptions) {
        if (subscription.status === 'active' &&
            subscription.startsAt <= now &&
            subscription.endsAt > now) {
          return subscription;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Update subscription
   */
  async updateSubscription(subscriptionId: string, updates: UpdateSubscriptionOptions): Promise<Subscription> {
    try {
      const subscription = await this.httpClient.patch(`/subscriptions/${subscriptionId}`, updates) as Subscription;

      this.emitEvent('subscription:updated', {
        subscriptionId: subscription.id,
        subscriber: subscription.subscriber,
        event: 'updated',
        timestamp: Date.now(),
        metadata: updates
      });

      return subscription;
    } catch (error) {
      throw new SubscriptionError(
        `Failed to update subscription: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, reason?: string): Promise<void> {
    try {
      const subscription = await this.getSubscription(subscriptionId);
      await this.httpClient.delete(`/subscriptions/${subscriptionId}`, { reason });

      this.emitEvent('subscription:cancelled', {
        subscriptionId: subscription.id,
        subscriber: subscription.subscriber,
        event: 'cancelled',
        timestamp: Date.now(),
        metadata: { reason }
      });
    } catch (error) {
      throw new SubscriptionError(
        `Failed to cancel subscription: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Renew subscription
   */
  async renewSubscription(subscriptionId: string): Promise<Subscription> {
    try {
      const subscription = await this.httpClient.post(`/subscriptions/${subscriptionId}/renew`) as Subscription;

      this.emitEvent('subscription:renewed', {
        subscriptionId: subscription.id,
        subscriber: subscription.subscriber,
        event: 'renewed',
        timestamp: Date.now()
      });

      return subscription;
    } catch (error) {
      throw new SubscriptionError(
        `Failed to renew subscription: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Upgrade subscription tier
   */
  async upgradeSubscription(subscriptionId: string, newTier: string): Promise<Subscription> {
    const tier = SUBSCRIPTION_TIERS[newTier];
    if (!tier) {
      throw new ValidationError(`Invalid subscription tier: ${newTier}`);
    }

    try {
      const currentSubscription = await this.getSubscription(subscriptionId);
      const subscription = await this.httpClient.post(
        `/subscriptions/${subscriptionId}/upgrade`,
        { tier: newTier }
      ) as Subscription;

      this.emitEvent('subscription:upgraded', {
        subscriptionId: subscription.id,
        subscriber: subscription.subscriber,
        event: 'upgraded',
        previousTier: currentSubscription.tier,
        newTier: subscription.tier,
        timestamp: Date.now()
      });

      return subscription;
    } catch (error) {
      throw new SubscriptionError(
        `Failed to upgrade subscription: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if user has active subscription
   */
  async hasActiveSubscription(address: string): Promise<boolean> {
    const subscription = await this.getActiveSubscription(address);
    return subscription !== null;
  }

  /**
   * Check if user has minimum tier level
   */
  async hasMinimumTier(address: string, minimumTier: string): Promise<boolean> {
    const subscription = await this.getActiveSubscription(address);
    if (!subscription) return false;

    const currentTier = SUBSCRIPTION_TIERS[subscription.tier];
    const requiredTier = SUBSCRIPTION_TIERS[minimumTier];

    if (!currentTier || !requiredTier) return false;
    return currentTier.apiLevel >= requiredTier.apiLevel;
  }

  /**
   * Check if user has specific feature
   */
  async hasFeature(address: string, feature: string): Promise<boolean> {
    const subscription = await this.getActiveSubscription(address);
    if (!subscription) return false;
    return subscription.features.includes(feature);
  }

  /**
   * Get subscription usage statistics
   */
  async getSubscriptionUsage(subscriptionId: string): Promise<SubscriptionUsage> {
    try {
      return await this.httpClient.get(`/subscriptions/${subscriptionId}/usage`) as SubscriptionUsage;
    } catch (error) {
      throw new SubscriptionError(
        `Failed to get subscription usage: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get available subscription tiers
   */
  getAvailableTiers(): Record<string, SubscriptionTier> {
    return { ...SUBSCRIPTION_TIERS };
  }

  /**
   * Get tier information
   */
  getTierInfo(tierId: string): SubscriptionTier | null {
    return SUBSCRIPTION_TIERS[tierId] || null;
  }

  /**
   * Add event listener
   */
  addEventListener(eventType: EventType, listener: EventListener): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType)!.push(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(eventType: EventType, listener: EventListener): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) listeners.splice(index, 1);
    }
  }

  private emitEvent(eventType: EventType, data: SubscriptionEventData): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      const eventData: EventData = {
        type: eventType,
        timestamp: data.timestamp,
        id: `sub_${data.subscriptionId}_${Date.now()}`,
        payload: data,
        source: 'subscription-manager'
      };

      listeners.forEach(listener => {
        try {
          listener(eventData);
        } catch (error) {
          console.error('Event listener error:', error);
        }
      });
    }
  }

  private initializeUsageTracking(subscription: Subscription): void {
    const usage: SubscriptionUsage = {
      currentPeriod: {
        requests: 0,
        dataTransferred: 0,
        transactions: 0,
        periodStart: subscription.startsAt,
        periodEnd: subscription.endsAt
      },
      allTime: {
        requests: 0,
        dataTransferred: 0,
        transactions: 0,
        since: subscription.startsAt
      }
    };
    this.usageTracker.set(subscription.id, usage);
  }
}

/**
 * Subscription utility functions
 */
export class SubscriptionUtils {
  /**
   * Format subscription duration
   */
  static formatDuration(seconds: number): string {
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  /**
   * Calculate subscription price for period
   */
  static calculatePrice(tier: SubscriptionTier, billingPeriod: number): number {
    const monthlyPrice = tier.price;
    const monthlySeconds = 30 * 24 * 60 * 60;
    return Math.floor((monthlyPrice * billingPeriod) / monthlySeconds);
  }

  /**
   * Check if subscription is expiring soon
   */
  static isExpiringSoon(subscription: Subscription, daysThreshold: number = 7): boolean {
    const now = Date.now();
    const threshold = daysThreshold * 24 * 60 * 60 * 1000;
    return subscription.endsAt - now <= threshold;
  }

  /**
   * Get subscription status color
   */
  static getStatusColor(status: Subscription['status']): string {
    switch (status) {
      case 'active': return 'green';
      case 'inactive': return 'yellow';
      case 'expired': return 'red';
      case 'cancelled': return 'gray';
      default: return 'gray';
    }
  }
}
