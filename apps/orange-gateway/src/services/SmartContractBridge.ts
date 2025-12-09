import algosdk from 'algosdk';
import type { Account, Transaction } from 'algosdk';
import * as algokit from '@algorandfoundation/algokit-utils';
import { Logger } from '../utils/Logger';
import { NodeInfo } from '../types';

// Service Tier enum
export enum ServiceTier {
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise'
}

// Smart Contract ABI interfaces (simplified for bridge)
interface NodeRegistryContract {
  getNodeInfo(account: string): Promise<string>;
  getNodeStake(account: string): Promise<bigint>;
  getNodeStatus(account: string): Promise<number>;
  getNodeReputation(account: string): Promise<number>;
  listNodes(offset: number, limit: number): Promise<string[]>;
  totalNodes(): Promise<number>;
}

interface OrangeSubscriptionsContract {
  getSubscription(user: string): Promise<bigint>;
  hasActiveSubscription(user: string): Promise<boolean>;
  getLatestTimestamp(): Promise<bigint>;
  getPricing(): Promise<{ price30day: bigint; priceYear: bigint }>;
}

export interface SmartContractBridgeConfig {
  algod: {
    token: string;
    server: string;
    port: number;
  };
  indexer?: {
    token: string;
    server: string;
    port: number;
  };
  contracts: {
    nodeRegistryAppId: number;
    orangeSubscriptionsAppId: number;
  };
  network: 'mainnet' | 'testnet' | 'betanet';
  cache: {
    ttl: number; // seconds
    maxSize: number;
  };
  loadBalancing: {
    reputationWeight: number; // 0-1, how much reputation affects selection
    healthWeight: number; // 0-1, how much health affects selection
    stakeWeight: number; // 0-1, how much stake affects selection
  };
}

interface CachedNodeData {
  nodes: NodeInfo[];
  reputationScores: Record<string, number>;
  lastUpdate: number;
}

interface CachedSubscriptionData {
  userSubscriptions: Record<string, ServiceTier>;
  lastUpdate: number;
}


export interface NodeDiscoveryResult {
  nodes: NodeInfo[];
  totalNodes: number;
  lastUpdate: number;
  source: 'cache' | 'blockchain';
}

export interface LoadBalancedNode {
  node: NodeInfo;
  weight: number;
  score: number;
  selectionProbability: number;
}

/**
 * Smart Contract Bridge Service
 *
 * Provides integration between Orange Network gateway services and smart contracts:
 * - Dynamic node discovery from NodeRegistry contract
 * - Reputation-based load balancing
 * - Subscription benefits management
 * - Cached contract data for performance
 */
export class SmartContractBridge {
  private config: SmartContractBridgeConfig;
  private logger: Logger;
  private algodClient: algosdk.Algodv2;
  private indexerClient?: algosdk.Indexer;

  // Caching
  private nodeCache: Map<string, CachedNodeData> = new Map();
  private subscriptionCache: Map<string, CachedSubscriptionData> = new Map();
  private cacheHits = 0;
  private cacheMisses = 0;

  // Contract interfaces
  private nodeRegistryContract: NodeRegistryContract;
  private orangeSubscriptionsContract: OrangeSubscriptionsContract;

  constructor(config: SmartContractBridgeConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;

    // Initialize Algod client
    this.algodClient = new algosdk.Algodv2(
      config.algod.token,
      config.algod.server,
      config.algod.port
    );

    // Initialize Indexer client if provided
    if (config.indexer) {
      this.indexerClient = new algosdk.Indexer(
        config.indexer.token,
        config.indexer.server,
        config.indexer.port
      );
    }

    // Initialize contract interfaces (simplified)
    this.nodeRegistryContract = this.createNodeRegistryInterface();
    this.orangeSubscriptionsContract = this.createOrangeSubscriptionsInterface();
  }

  /**
   * Initialize the bridge service
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Smart Contract Bridge');

      // Verify contract connectivity
      await this.verifyContractConnectivity();

      // Warm up caches
      await this.warmUpCaches();

      this.logger.info('Smart Contract Bridge initialized successfully', {
        nodeRegistryAppId: this.config.contracts.nodeRegistryAppId,
        orangeSubscriptionsAppId: this.config.contracts.orangeSubscriptionsAppId,
        network: this.config.network
      });

    } catch (error) {
      this.logger.error('Failed to initialize Smart Contract Bridge', error as Record<string, any>);
      throw error;
    }
  }

  /**
   * Discover optimal nodes from smart contract with reputation-based filtering
   */
  async discoverOptimalNodes(options: {
    limit?: number;
    minReputation?: number;
    capabilities?: string[];
    geolocation?: string;
    useCache?: boolean;
  } = {}): Promise<NodeDiscoveryResult> {
    const {
      limit = 50,
      minReputation = 30,
      capabilities = [],
      geolocation,
      useCache = true
    } = options;

    try {
      const cacheKey = this.generateNodeCacheKey(options);

      // Check cache first
      if (useCache) {
        const cached = this.nodeCache.get(cacheKey);
        if (cached && this.isCacheValid(cached.lastUpdate, this.config.cache.ttl)) {
          this.cacheHits++;
          this.logger.debug('Using cached node data', { cacheKey });

          return {
            nodes: this.filterNodes(cached.nodes, options),
            totalNodes: cached.nodes.length,
            lastUpdate: cached.lastUpdate,
            source: 'cache'
          };
        }
      }

      this.cacheMisses++;
      this.logger.info('Fetching nodes from blockchain');

      // Fetch from blockchain
      const nodes = await this.fetchNodesFromContract();

      // Get reputation scores
      const reputationScores = await this.fetchReputationScores(nodes);

      // Cache the results
      const cacheData: CachedNodeData = {
        nodes,
        reputationScores,
        lastUpdate: Date.now()
      };

      this.nodeCache.set(cacheKey, cacheData);
      this.limitCacheSize();

      // Apply filters
      const filteredNodes = this.filterNodes(nodes, options);

      this.logger.info('Node discovery completed', {
        totalNodes: nodes.length,
        filteredNodes: filteredNodes.length,
        source: 'blockchain'
      });

      return {
        nodes: filteredNodes,
        totalNodes: nodes.length,
        lastUpdate: Date.now(),
        source: 'blockchain'
      };

    } catch (error) {
      this.logger.error('Node discovery failed', error as Record<string, any>);

      // Return cached data as fallback if available
      const fallbackCache = Array.from(this.nodeCache.values())[0];
      if (fallbackCache) {
        this.logger.warn('Using cached fallback data due to blockchain error');
        return {
          nodes: this.filterNodes(fallbackCache.nodes, options),
          totalNodes: fallbackCache.nodes.length,
          lastUpdate: fallbackCache.lastUpdate,
          source: 'cache'
        };
      }

      throw error;
    }
  }

  /**
   * Get reputation-based load balanced node selection
   */
  async getLoadBalancedNodes(nodes: NodeInfo[], count = 1): Promise<LoadBalancedNode[]> {
    try {
      // Get reputation scores for all nodes
      const nodeReputations = await Promise.all(
        nodes.map(async (node) => ({
          node,
          reputation: await this.getNodeReputation(node.address)
        }))
      );

      // Calculate weighted scores
      const scoredNodes: LoadBalancedNode[] = nodeReputations.map(({ node, reputation }) => {
        const score = this.calculateNodeScore(node, reputation);
        const weight = this.calculateNodeWeight(node, reputation);

        return {
          node,
          weight,
          score,
          selectionProbability: 0 // Will be calculated next
        };
      });

      // Normalize weights to probabilities
      const totalWeight = scoredNodes.reduce((sum, n) => sum + n.weight, 0);
      scoredNodes.forEach(node => {
        node.selectionProbability = totalWeight > 0 ? node.weight / totalWeight : 1 / scoredNodes.length;
      });

      // Sort by score (highest first) and return top nodes
      scoredNodes.sort((a, b) => b.score - a.score);

      return scoredNodes.slice(0, Math.min(count, scoredNodes.length));

    } catch (error) {
      this.logger.error('Load balancing failed', error as Record<string, any>);

      // Fallback to basic selection
      return nodes.slice(0, count).map(node => ({
        node,
        weight: 1,
        score: 50,
        selectionProbability: 1 / Math.min(count, nodes.length)
      }));
    }
  }

  /**
   * Update node reputation in smart contract
   */
  async updateNodeReputation(nodeId: string, scoreChange: number, adminAccount?: Account): Promise<void> {
    try {
      if (!adminAccount) {
        throw new Error('Admin account required for reputation updates');
      }

      this.logger.info('Updating node reputation', { nodeId, scoreChange });

      // Create reputation update transaction
      const suggestedParams = await this.algodClient.getTransactionParams().do();

      const reputationTxn = algosdk.makeApplicationCallTxnFromObject({
        sender: adminAccount.addr,
        appIndex: this.config.contracts.nodeRegistryAppId,
        onComplete: algosdk.OnApplicationComplete.NoOpOC,
        appArgs: [
          new Uint8Array(Buffer.from('updateReputation')),
          new Uint8Array(Buffer.from(nodeId)),
          algosdk.encodeUint64(scoreChange)
        ],
        suggestedParams,
        accounts: [nodeId]
      });

      // Sign and send transaction
      const signedTxn = reputationTxn.signTxn(adminAccount.sk);
      const response = await this.algodClient.sendRawTransaction(signedTxn).do();
      const txId = response.txid;

      // Wait for confirmation
      const confirmedTxn = await algosdk.waitForConfirmation(
        this.algodClient,
        txId,
        10
      );

      // Clear relevant cache entries
      this.clearNodeCache(nodeId);

      this.logger.info('Node reputation updated successfully', {
        nodeId,
        scoreChange,
        txId,
        confirmedRound: confirmedTxn.confirmedRound
      });

    } catch (error) {
      this.logger.error('Failed to update node reputation', { nodeId, scoreChange, error });
      throw error;
    }
  }

  /**
   * Handle subscription benefits for a user
   */
  async handleSubscriptionBenefits(userAddress: string): Promise<{
    tier: ServiceTier;
    hasActiveSubscription: boolean;
    expirationTime?: number;
    benefits: string[];
  }> {
    try {
      const cacheKey = `subscription_${userAddress}`;

      // Check cache
      const cached = this.subscriptionCache.get(cacheKey);
      if (cached && this.isCacheValid(cached.lastUpdate, this.config.cache.ttl / 2)) {
        const tier = cached.userSubscriptions[userAddress];
        return {
          tier,
          hasActiveSubscription: tier !== ServiceTier.BASIC,
          benefits: this.getServiceTierBenefits(tier)
        };
      }

      // Get subscription info from contract
      const hasActiveSubscription = await this.orangeSubscriptionsContract.hasActiveSubscription(userAddress);
      const expirationTime = hasActiveSubscription
        ? Number(await this.orangeSubscriptionsContract.getSubscription(userAddress))
        : undefined;

      // Determine service tier
      let tier: ServiceTier;
      if (!hasActiveSubscription) {
        tier = ServiceTier.BASIC;
      } else {
        // Check expiration time to determine tier
        const currentTimestamp = Number(await this.orangeSubscriptionsContract.getLatestTimestamp());
        const timeUntilExpiration = expirationTime ? expirationTime - currentTimestamp : 0;

        if (timeUntilExpiration > 365 * 24 * 60 * 60) { // More than 1 year
          tier = ServiceTier.ENTERPRISE;
        } else {
          tier = ServiceTier.PREMIUM;
        }
      }

      // Cache the result
      const cacheData: CachedSubscriptionData = {
        userSubscriptions: { [userAddress]: tier },
        lastUpdate: Date.now()
      };
      this.subscriptionCache.set(cacheKey, cacheData);

      const benefits = this.getServiceTierBenefits(tier);

      this.logger.info('Subscription benefits retrieved', {
        userAddress,
        tier,
        hasActiveSubscription,
        expirationTime
      });

      return {
        tier,
        hasActiveSubscription,
        expirationTime,
        benefits
      };

    } catch (error) {
      this.logger.error('Failed to get subscription benefits', { userAddress, error });

      // Return basic tier as fallback
      return {
        tier: ServiceTier.BASIC,
        hasActiveSubscription: false,
        benefits: this.getServiceTierBenefits(ServiceTier.BASIC)
      };
    }
  }

  /**
   * Get bridge metrics
   */
  getMetrics() {
    return {
      cache: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        hitRate: this.cacheHits + this.cacheMisses > 0
          ? (this.cacheHits / (this.cacheHits + this.cacheMisses)) * 100
          : 0,
        nodeCacheSize: this.nodeCache.size,
        subscriptionCacheSize: this.subscriptionCache.size
      },
      contracts: {
        nodeRegistryAppId: this.config.contracts.nodeRegistryAppId,
        orangeSubscriptionsAppId: this.config.contracts.orangeSubscriptionsAppId,
        network: this.config.network
      }
    };
  }

  /**
   * Clear caches
   */
  clearCaches(): void {
    this.nodeCache.clear();
    this.subscriptionCache.clear();
    this.logger.info('Caches cleared');
  }

  // Private helper methods

  private createNodeRegistryInterface(): NodeRegistryContract {
    // Simplified interface - in production would use actual contract ABI
    return {
      getNodeInfo: async (account: string) => {
        // Mock implementation
        return '';
      },
      getNodeStake: async (account: string) => {
        // Mock implementation
        return BigInt(1000000);
      },
      getNodeStatus: async (account: string) => {
        // Mock implementation
        return 1; // ACTIVE
      },
      getNodeReputation: async (account: string) => {
        // Mock implementation
        return 50;
      },
      listNodes: async (offset: number, limit: number) => {
        // Mock implementation - would call actual contract
        return [];
      },
      totalNodes: async () => {
        // Mock implementation
        return 0;
      }
    };
  }

  private createOrangeSubscriptionsInterface(): OrangeSubscriptionsContract {
    // Simplified interface - in production would use actual contract ABI
    return {
      getSubscription: async (user: string) => {
        // Mock implementation
        return BigInt(0);
      },
      hasActiveSubscription: async (user: string) => {
        // Mock implementation
        return false;
      },
      getLatestTimestamp: async () => {
        return BigInt(Date.now() / 1000);
      },
      getPricing: async () => {
        return {
          price30day: BigInt(10000000), // 1 ALGO
          priceYear: BigInt(120000000)  // 12 ALGO
        };
      }
    };
  }

  private async verifyContractConnectivity(): Promise<void> {
    try {
      // Test connection to contracts
      await this.algodClient.healthCheck().do();

      // Verify contracts exist
      await this.algodClient.getApplicationByID(this.config.contracts.nodeRegistryAppId).do();
      await this.algodClient.getApplicationByID(this.config.contracts.orangeSubscriptionsAppId).do();

      this.logger.info('Contract connectivity verified');
    } catch (error) {
      this.logger.error('Contract connectivity failed', error as Record<string, any>);
      throw error;
    }
  }

  private async warmUpCaches(): Promise<void> {
    try {
      // Warm up node cache
      await this.discoverOptimalNodes({ useCache: false });

      this.logger.info('Caches warmed up');
    } catch (error) {
      this.logger.warn('Cache warm-up failed', error as Record<string, any>);
    }
  }

  private generateNodeCacheKey(options: any): string {
    return JSON.stringify({
      limit: options.limit || 50,
      minReputation: options.minReputation || 30,
      capabilities: options.capabilities || [],
      geolocation: options.geolocation
    });
  }

  private isCacheValid(lastUpdate: number, ttl: number): boolean {
    return (Date.now() - lastUpdate) < (ttl * 1000);
  }

  private async fetchNodesFromContract(): Promise<NodeInfo[]> {
    try {
      // In production, this would call the actual smart contract
      // For now, return mock data based on existing structure

      const nodes: NodeInfo[] = [
        {
          id: 'node1',
          address: 'node1',
          friendlyName: 'Node 1',
          fqdn: 'node1.example.com',
          port: 8080,
          publicKey: 'pubkey1',
          network: this.config.network,
          version: '1.0.0',
          geolocation: 'us-east',
          capabilities: ['history', 'analytics'],
          registeredAt: Date.now(),
          lastActiveAt: Date.now(),
          status: 'active',
          stakeWeight: 100,
          isActive: true,
          isHealthy: true,
          lastHealthCheck: Date.now(),
          totalRequests: 1000,
          successfulRequests: 950,
          failedRequests: 50,
          averageResponseTime: 150
        },
        {
          id: 'node2',
          address: 'node2',
          friendlyName: 'Node 2',
          fqdn: 'node2.example.com',
          port: 8080,
          publicKey: 'pubkey2',
          network: this.config.network,
          version: '1.0.0',
          geolocation: 'us-west',
          capabilities: ['history', 'analytics'],
          registeredAt: Date.now(),
          lastActiveAt: Date.now(),
          status: 'active',
          stakeWeight: 200,
          isActive: true,
          isHealthy: true,
          lastHealthCheck: Date.now(),
          totalRequests: 800,
          successfulRequests: 780,
          failedRequests: 20,
          averageResponseTime: 120
        }
      ];

      return nodes;
    } catch (error) {
      this.logger.error('Failed to fetch nodes from contract', error as Record<string, any>);
      throw error;
    }
  }

  private async fetchReputationScores(nodes: NodeInfo[]): Promise<Record<string, number>> {
    const scores: Record<string, number> = {};

    for (const node of nodes) {
      try {
        scores[node.address] = await this.getNodeReputation(node.address);
      } catch (error) {
        this.logger.warn('Failed to get reputation for node', { nodeId: node.address });
        scores[node.address] = 50; // Default reputation
      }
    }

    return scores;
  }

  private filterNodes(nodes: NodeInfo[], options: any): NodeInfo[] {
    return nodes.filter(node => {
      // Filter by reputation
      if (options.minReputation && node.averageResponseTime && node.averageResponseTime > 0) {
        // Calculate reputation from success rate
        const successRate = node.totalRequests && node.totalRequests > 0
          ? ((node.successfulRequests || 0) / node.totalRequests) * 100
          : 50;

        if (successRate < options.minReputation) return false;
      }

      // Filter by capabilities (would need to be added to NodeInfo)
      if (options.capabilities && options.capabilities.length > 0) {
        // Implementation depends on capabilities structure
      }

      // Filter by geolocation
      if (options.geolocation && node.geolocation !== options.geolocation) {
        return false;
      }

      // Filter by health
      if (!node.isHealthy || !node.isActive) {
        return false;
      }

      return true;
    }).slice(0, options.limit || 50);
  }

  private calculateNodeScore(node: NodeInfo, reputation: number): number {
    const { reputationWeight, healthWeight, stakeWeight: stakeWeightConfig } = this.config.loadBalancing;

    // Success rate component
    const successRate = node.totalRequests && node.totalRequests > 0
      ? ((node.successfulRequests || 0) / node.totalRequests) * 100
      : 50;

    // Response time component (inverted - lower is better)
    const responseTimeScore = Math.max(0, 100 - ((node.averageResponseTime || 100) / 10));

    // Stake weight component
    const stakeScore = Math.min(100, (node.stakeWeight || 0) / 10);

    // Calculate weighted score
    const score =
      (reputation * reputationWeight) +
      ((node.isHealthy ? 100 : 0) * healthWeight) +
      (stakeScore * stakeWeightConfig) +
      (successRate * 0.2) +
      (responseTimeScore * 0.1);

    return Math.min(100, Math.max(0, score));
  }

  private calculateNodeWeight(node: NodeInfo, reputation: number): number {
    // Weight based on score with exponential scaling for better distribution
    const score = this.calculateNodeScore(node, reputation);
    return Math.pow(score / 100, 2); // Square the normalized score
  }

  private async getNodeReputation(nodeId: string): Promise<number> {
    try {
      return await this.nodeRegistryContract.getNodeReputation(nodeId);
    } catch (error) {
      this.logger.warn('Failed to get node reputation from contract', { nodeId });

      // Fallback to calculated reputation from metrics
      // This would be based on historical performance
      return 50; // Default neutral reputation
    }
  }

  private getServiceTierBenefits(tier: ServiceTier): string[] {
    switch (tier) {
      case ServiceTier.BASIC:
        return [
          'Access to public nodes',
          'Rate limit: 100 requests/minute',
          'Best effort routing'
        ];

      case ServiceTier.PREMIUM:
        return [
          'Access to premium nodes',
          'Rate limit: 1000 requests/minute',
          'Priority routing',
          'Health monitoring',
          'Enhanced reliability'
        ];

      case ServiceTier.ENTERPRISE:
        return [
          'Access to enterprise nodes',
          'Unlimited requests',
          'Highest priority routing',
          'Advanced health monitoring',
          'SLA guarantees',
          'Dedicated support',
          'Custom routing rules'
        ];

      default:
        return [];
    }
  }

  private limitCacheSize(): void {
    if (this.nodeCache.size > this.config.cache.maxSize) {
      const oldestKey = this.nodeCache.keys().next().value;
      if (oldestKey) {
        this.nodeCache.delete(oldestKey);
      }
    }
  }

  private clearNodeCache(nodeId?: string): void {
    if (nodeId) {
      // Clear specific node from all cache entries
      for (const [key, data] of this.nodeCache.entries()) {
        data.nodes = data.nodes.filter(node => node.address !== nodeId);
        delete data.reputationScores[nodeId];
      }
    } else {
      this.nodeCache.clear();
    }
  }
}