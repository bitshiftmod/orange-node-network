/**
 * Orange Node Network SDK
 *
 * A comprehensive TypeScript SDK for interacting with the Orange Node Network.
 * Provides gateway client integration and smart contract access.
 *
 * @packageDocumentation
 */

// Core types
export * from './types';

// Error classes
export * from './errors';

// Authentication
export { AuthManager, createApiKeyAuth, createJWTAuth, createOAuthAuth, isValidAlgorandAddress } from './auth';
export type { TokenInfo, JWTPayload } from './auth';

// HTTP Client
export { HttpClient } from './client';
export type { HttpClientConfig, RequestMiddleware, ResponseMiddleware } from './client';

// Utilities
export {
  sleep,
  withRetry,
  concurrent,
  debounce,
  throttle,
  Cache,
  RateLimiter,
  UrlBuilder,
  generateId,
  generateRequestId,
  deepClone,
  mergeOptions,
  isValidUrl,
  validateUrl,
  formatDuration,
  formatBytes,
  DEFAULT_RETRY_CONFIG
} from './utils';

// Contract clients and constants
export {
  SUBSCRIPTION_30_DAY,
  SUBSCRIPTION_YEAR,
  DURATION_30_DAYS,
  DURATION_YEAR,
  type SubscriptionType
} from './contracts';

// Re-export contract clients from main entry for convenience
export {
  OrangeSubscriptionsContractClient,
  OrangeSubscriptionsContractFactory,
  OrangeNodeRegistryClient,
  OrangeNodeRegistryFactory,
  OrangeGatewayRegistryClient,
  OrangeGatewayRegistryFactory,
} from './contracts/generated';

// Subscriptions
export {
  SubscriptionManager,
  SubscriptionUtils,
  SUBSCRIPTION_TIERS,
  type SubscriptionTier,
  type CreateSubscriptionOptions,
  type UpdateSubscriptionOptions,
  type SubscriptionUsage,
  type SubscriptionEventData
} from './subscriptions';

// Transactions
export {
  TransactionBuilder,
  TransactionVerifier,
  TransactionUtils,
  type TransactionParams,
  type TransactionType,
  type SignedTransaction,
  type TransactionGroup
} from './transactions';

// Import for SDK class
import type { SDKConfig, NetworkConfig, GatewayInfo, HealthCheckResult } from './types';
import { HttpClient } from './client';
import { AuthManager, createApiKeyAuth, createJWTAuth, createOAuthAuth } from './auth';
import { OrangeNetworkError } from './errors';
import { SubscriptionManager } from './subscriptions';

/**
 * Main Orange Network SDK class
 *
 * This is the primary entry point for interacting with the Orange Node Network.
 * It provides a unified interface for gateway communication and contract interaction.
 *
 * @example
 * ```typescript
 * import { OrangeSDK } from '@orange-node-network/sdk';
 *
 * const sdk = OrangeSDK.createWithApiKey(
 *   'https://gateway.example.com',
 *   'your-api-key',
 *   'mainnet'
 * );
 *
 * const health = await sdk.checkHealth();
 * ```
 */
export class OrangeSDK {
  private config: SDKConfig;
  private client: HttpClient;
  private auth: AuthManager;
  private subscriptions: SubscriptionManager;

  constructor(config: SDKConfig) {
    this.validateConfig(config);
    this.config = { ...config };

    this.auth = this.createAuthManager(config.auth);

    this.client = new HttpClient({
      ...config,
      auth: this.auth
    });

    this.subscriptions = new SubscriptionManager(this.client);
  }

  private validateConfig(config: SDKConfig): void {
    if (!config.gatewayUrl) {
      throw new Error('Gateway URL is required');
    }

    if (!config.auth) {
      throw new Error('Authentication configuration is required');
    }

    if (!['mainnet', 'testnet', 'betanet'].includes(config.network)) {
      throw new Error('Invalid network. Must be mainnet, testnet, or betanet');
    }

    try {
      new URL(config.gatewayUrl);
    } catch {
      throw new Error('Invalid gateway URL format');
    }
  }

  private createAuthManager(authConfig: SDKConfig['auth']): AuthManager {
    switch (authConfig.method) {
      case 'api-key':
        if (!authConfig.apiKey) {
          throw new Error('API key is required for API key authentication');
        }
        return createApiKeyAuth(authConfig.apiKey);

      case 'jwt':
        if (!authConfig.jwt?.token) {
          throw new Error('JWT token is required for JWT authentication');
        }
        return createJWTAuth({
          accessToken: authConfig.jwt.token,
          refreshToken: authConfig.jwt.refreshToken,
          expiresAt: authConfig.jwt.expiresAt || 0,
          tokenType: 'Bearer'
        });

      case 'oauth':
        if (!authConfig.oauth?.token) {
          throw new Error('OAuth token is required for OAuth authentication');
        }
        return createOAuthAuth(
          authConfig.oauth.token,
          authConfig.oauth.refreshToken,
          authConfig.oauth.expiresAt
        );

      default:
        throw new Error(`Unsupported authentication method: ${authConfig.method}`);
    }
  }

  /**
   * Get gateway information
   */
  async getGatewayInfo(): Promise<GatewayInfo> {
    try {
      return await this.client.get<GatewayInfo>('/gateway/info');
    } catch (error) {
      throw new OrangeNetworkError(
        `Failed to get gateway info: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check gateway health
   */
  async checkHealth(): Promise<HealthCheckResult> {
    try {
      return await this.client.get<HealthCheckResult>('/health');
    } catch (error) {
      throw new OrangeNetworkError(
        `Failed to check gateway health: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get available nodes
   */
  async getNodes(): Promise<any[]> {
    try {
      return await this.client.get<any[]>('/nodes');
    } catch (error) {
      throw new OrangeNetworkError(
        `Failed to get nodes: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get HTTP client for custom requests
   */
  getHttpClient(): HttpClient {
    return this.client;
  }

  /**
   * Get authentication manager
   */
  getAuth(): AuthManager {
    return this.auth;
  }

  /**
   * Get subscription manager
   */
  getSubscriptions(): SubscriptionManager {
    return this.subscriptions;
  }

  /**
   * Update SDK configuration
   */
  updateConfig(updates: Partial<SDKConfig>): void {
    if (updates.auth) {
      this.auth = this.createAuthManager(updates.auth);
      this.client.updateConfig({ auth: this.auth });
    }

    if (updates.gatewayUrl || updates.network || updates.timeout || updates.headers) {
      this.client.updateConfig(updates as any);
    }

    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current configuration
   */
  getConfig(): {
    gatewayUrl: string;
    network: string;
    timeout?: number;
    auth: { method: string };
    networkConfig: NetworkConfig;
  } {
    return {
      gatewayUrl: this.config.gatewayUrl,
      network: this.config.network,
      timeout: this.config.timeout,
      auth: {
        method: this.auth.getAuthMethod()
      },
      networkConfig: this.client.getNetworkConfig()
    };
  }

  /**
   * Test connection to gateway
   */
  async testConnection(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();

    try {
      await this.checkHealth();
      return {
        success: true,
        latency: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Close SDK and cleanup resources
   */
  async close(): Promise<void> {
    this.client.clearCache();
    this.client.resetRateLimit();

    if (this.config.debug) {
      const logger = this.config.logger || console;
      logger.info('Orange Network SDK closed');
    }
  }

  /**
   * Get SDK version
   */
  static getVersion(): string {
    return '1.0.0';
  }

  /**
   * Create SDK instance with API key authentication
   */
  static createWithApiKey(
    gatewayUrl: string,
    apiKey: string,
    network: 'mainnet' | 'testnet' | 'betanet' = 'mainnet',
    options: Partial<SDKConfig> = {}
  ): OrangeSDK {
    return new OrangeSDK({
      gatewayUrl,
      network,
      auth: {
        method: 'api-key',
        apiKey
      },
      ...options
    });
  }

  /**
   * Create SDK instance with JWT authentication
   */
  static createWithJWT(
    gatewayUrl: string,
    token: string,
    refreshToken?: string,
    network: 'mainnet' | 'testnet' | 'betanet' = 'mainnet',
    options: Partial<SDKConfig> = {}
  ): OrangeSDK {
    return new OrangeSDK({
      gatewayUrl,
      network,
      auth: {
        method: 'jwt',
        jwt: {
          token,
          refreshToken
        }
      },
      ...options
    });
  }

  /**
   * Create SDK instance with OAuth authentication
   */
  static createWithOAuth(
    gatewayUrl: string,
    accessToken: string,
    refreshToken?: string,
    network: 'mainnet' | 'testnet' | 'betanet' = 'mainnet',
    options: Partial<SDKConfig> = {}
  ): OrangeSDK {
    return new OrangeSDK({
      gatewayUrl,
      network,
      auth: {
        method: 'oauth',
        oauth: {
          token: accessToken,
          tokenType: 'Bearer',
          refreshToken
        }
      },
      ...options
    });
  }
}

// Default export
export default OrangeSDK;

/**
 * Convenience function to create SDK instance
 */
export function createSDK(config: SDKConfig): OrangeSDK {
  return new OrangeSDK(config);
}

/**
 * Create SDK with environment variables
 */
export function createSDKFromEnv(network: 'mainnet' | 'testnet' | 'betanet' = 'mainnet'): OrangeSDK {
  const gatewayUrl = typeof process !== 'undefined' ? process.env?.ORANGE_GATEWAY_URL : undefined;
  const apiKey = typeof process !== 'undefined' ? process.env?.ORANGE_API_KEY : undefined;
  const jwtToken = typeof process !== 'undefined' ? process.env?.ORANGE_JWT_TOKEN : undefined;

  if (!gatewayUrl) {
    throw new Error('ORANGE_GATEWAY_URL environment variable is required');
  }

  if (apiKey) {
    return OrangeSDK.createWithApiKey(gatewayUrl, apiKey, network);
  } else if (jwtToken) {
    return OrangeSDK.createWithJWT(gatewayUrl, jwtToken, undefined, network);
  } else {
    throw new Error('Either ORANGE_API_KEY or ORANGE_JWT_TOKEN environment variable is required');
  }
}