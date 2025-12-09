import { NodeInfo } from '../types';
import { Logger } from '../utils/Logger';
import { ServiceTier, SmartContractBridge } from './SmartContractBridge';

interface LoadBalancerState {
  currentIndex: number;
  nodeWeights: Record<string, number>;
  nodeConnections: Record<string, number>;
  lastUpdateTime: number;
}

interface LoadBalancerConfig {
  strategy: 'reputation-weighted' | 'health-first' | 'stake-weighted' | 'balanced';
  maxNodes: number;
  healthCheckInterval: number;
  failureThreshold: number;
  recoveryThreshold: number;
  enableFailover: boolean;
  cacheResults: boolean;
  subscriptionAwareRouting: boolean;
}

interface NodeSelectionContext {
  userAddress?: string;
  serviceTier?: ServiceTier;
  requestType?: 'read' | 'write' | 'admin';
  geolocation?: string;
  capabilities?: string[];
}

interface SelectionResult {
  node: NodeInfo;
  strategy: string;
  confidence: number;
  fallbackUsed: boolean;
  selectionTime: number;
  metadata: {
    score: number;
    weight: number;
    reasoning: string;
  };
}

/**
 * Smart Contract Load Balancer
 *
 * Advanced load balancing that integrates with smart contract data:
 * - Reputation-based node selection
 * - Subscription-aware routing
 * - Health-aware failover
 * - Geographic and capability filtering
 */
export class SmartContractLoadBalancer {
  private config: LoadBalancerConfig;
  private logger: Logger;
  private smartContractBridge: SmartContractBridge;
  private state: LoadBalancerState;

  // Performance tracking
  private totalSelections = 0;
  private successfulSelections = 0;
  private fallbackUsage = 0;
  private averageSelectionTime = 0;
  private nodeUsageCount: Record<string, number> = {};

  constructor(
    config: LoadBalancerConfig,
    smartContractBridge: SmartContractBridge,
    logger: Logger
  ) {
    this.config = config;
    this.logger = logger;
    this.smartContractBridge = smartContractBridge;

    this.state = {
      currentIndex: 0,
      nodeWeights: {},
      nodeConnections: {},
      lastUpdateTime: Date.now()
    };

    this.logger.info('Smart Contract Load Balancer initialized', { config });
  }

  /**
   * Select optimal node based on context and smart contract data
   */
  async selectNode(context: NodeSelectionContext = {}): Promise<SelectionResult> {
    const startTime = Date.now();
    this.totalSelections++;

    try {
      this.logger.debug('Node selection started', { context });

      // Get subscription benefits if user address provided
      let serviceTier = context.serviceTier;
      if (context.userAddress && !serviceTier && this.config.subscriptionAwareRouting) {
        const subscriptionInfo = await this.smartContractBridge.handleSubscriptionBenefits(context.userAddress);
        serviceTier = subscriptionInfo.tier;
      }

      // Get candidate nodes from smart contract
      const discoveryResult = await this.smartContractBridge.discoverOptimalNodes({
        limit: this.config.maxNodes,
        geolocation: context.geolocation,
        capabilities: context.capabilities,
        useCache: this.config.cacheResults
      });

      let candidateNodes = discoveryResult.nodes;

      // Filter by service tier requirements
      candidateNodes = this.filterByServiceTier(candidateNodes, serviceTier);

      // Filter by request type
      candidateNodes = this.filterByRequestType(candidateNodes, context.requestType);

      if (candidateNodes.length === 0) {
        throw new Error('No suitable nodes available');
      }

      // Select node using configured strategy
      let selectedNode: NodeInfo;
      let strategy: string;
      let metadata: any;

      switch (this.config.strategy) {
        case 'reputation-weighted':
          ({ node: selectedNode, metadata } = await this.selectByReputation(candidateNodes, context));
          strategy = 'reputation-weighted';
          break;

        case 'health-first':
          ({ node: selectedNode, metadata } = await this.selectByHealth(candidateNodes, context));
          strategy = 'health-first';
          break;

        case 'stake-weighted':
          ({ node: selectedNode, metadata } = await this.selectByStake(candidateNodes, context));
          strategy = 'stake-weighted';
          break;

        case 'balanced':
        default:
          ({ node: selectedNode, metadata } = await this.selectBalanced(candidateNodes, context));
          strategy = 'balanced';
          break;
      }

      // Update metrics
      this.updateMetrics(selectedNode, startTime);

      // Update connection tracking
      this.updateNodeConnections(selectedNode);

      const selectionTime = Date.now() - startTime;
      this.updateAverageSelectionTime(selectionTime);

      this.successfulSelections++;

      this.logger.info('Node selected successfully', {
        nodeId: selectedNode.address,
        strategy,
        selectionTime,
        serviceTier,
        candidateCount: candidateNodes.length
      });

      return {
        node: selectedNode,
        strategy,
        confidence: metadata.score / 100,
        fallbackUsed: false,
        selectionTime,
        metadata: {
          score: metadata.score,
          weight: metadata.weight,
          reasoning: metadata.reasoning
        }
      };

    } catch (error) {
      this.logger.error('Node selection failed', { context, error });

      // Fallback handling
      if (this.config.enableFailover) {
        return this.handleFallback(context, startTime);
      }

      throw error;
    }
  }

  /**
   * Select multiple nodes with load distribution
   */
  async selectMultipleNodes(
    count: number,
    context: NodeSelectionContext = {}
  ): Promise<SelectionResult[]> {
    try {
      // Get load balanced nodes from bridge
      const discoveryResult = await this.smartContractBridge.discoverOptimalNodes({
        limit: Math.max(count * 2, this.config.maxNodes), // Get more candidates
        useCache: this.config.cacheResults
      });

      const candidateNodes = discoveryResult.nodes;

      // Get weighted selection
      const loadBalancedNodes = await this.smartContractBridge.getLoadBalancedNodes(
        candidateNodes,
        count
      );

      const results: SelectionResult[] = loadBalancedNodes.map((lbNode, index) => ({
        node: lbNode.node,
        strategy: 'weighted-distribution',
        confidence: lbNode.score / 100,
        fallbackUsed: false,
        selectionTime: 0,
        metadata: {
          score: lbNode.score,
          weight: lbNode.weight,
          reasoning: `Weighted selection #${index + 1}, probability: ${lbNode.selectionProbability.toFixed(3)}`
        }
      }));

      this.logger.info('Node selected', {
        node: undefined, // selectedNode is not defined here, this will be 'undefined'
        strategy: undefined, // this.strategy is not defined
        score: undefined // selectedNode is not defined here
      });

      return results;
    } catch (error) {
      this.logger.error('Node selection failed', { strategy: undefined }, error as Error); // this.strategy is not defined
      throw error;
    }
  }
  /**
   * Update node performance metrics
   */
  updateNodePerformance(nodeId: string, metrics: {
    success: boolean;
    responseTime: number;
    errorType?: string;
  }): void {
    try {
      this.logger.debug('Updating node performance', { nodeId, metrics });

      // Update local metrics
      if (!this.nodeUsageCount[nodeId]) {
        this.nodeUsageCount[nodeId] = 0;
      }

      if (metrics.success) {
        this.nodeUsageCount[nodeId]++;
      }

      // Update smart contract reputation if this is an admin operation
      // In production, this would require proper authorization
      if (!metrics.success && metrics.errorType === 'timeout') {
        // Could trigger reputation update here
        this.logger.warn('Node performance issue detected', {
          nodeId,
          errorType: metrics.errorType,
          responseTime: metrics.responseTime
        });
      }

    } catch (error) {
      this.logger.error('Failed to update node performance', { nodeId, metrics, error });
    }
  }

  /**
   * Get load balancer metrics
   */
  getMetrics() {
    return {
      selection: {
        total: this.totalSelections,
        successful: this.successfulSelections,
        successRate: this.totalSelections > 0
          ? (this.successfulSelections / this.totalSelections) * 100
          : 0,
        fallbackUsed: this.fallbackUsage,
        averageTime: this.averageSelectionTime
      },
      nodes: {
        totalConnections: Object.keys(this.state.nodeConnections).length,
        nodeUsageCount: { ...this.nodeUsageCount },
        currentWeights: { ...this.state.nodeWeights }
      },
      bridge: this.smartContractBridge.getMetrics()
    };
  }

  /**
   * Reset load balancer state
   */
  reset(): void {
    this.state = {
      currentIndex: 0,
      nodeWeights: {},
      nodeConnections: {},
      lastUpdateTime: Date.now()
    };

    this.totalSelections = 0;
    this.successfulSelections = 0;
    this.fallbackUsage = 0;
    this.averageSelectionTime = 0;
    this.nodeUsageCount = {};

    this.logger.info('Load balancer state reset');
  }

  // Private helper methods

  private filterByServiceTier(nodes: NodeInfo[], tier?: ServiceTier): NodeInfo[] {
    if (!tier) return nodes;

    // Different tiers might have access to different node pools
    switch (tier) {
      case ServiceTier.ENTERPRISE:
        // Enterprise gets access to all nodes
        return nodes;

      case ServiceTier.PREMIUM:
        // Premium gets access to high-performing nodes
        return nodes.filter(node => {
          const successRate = (node.totalRequests || 0) > 0
            ? ((node.successfulRequests || 0) / (node.totalRequests || 1))
            : 0.5;
          return successRate >= 0.95 && node.isHealthy;
        });

      case ServiceTier.BASIC:
      default:
        // Basic gets access to healthy nodes
        return nodes.filter(node => node.isHealthy);
    }
  }

  private filterByRequestType(nodes: NodeInfo[], requestType?: string): NodeInfo[] {
    if (!requestType) return nodes;

    // In production, nodes would have capability metadata
    switch (requestType) {
      case 'write':
        // Write operations might need nodes with higher stakes
        return nodes.filter(node => (node.stakeWeight || 0) >= 100);

      case 'admin':
        // Admin operations might need specific capabilities
        return nodes.filter(node => node.capabilities?.includes('admin'));

      default:
        return nodes;
    }
  }

  private async selectByReputation(nodes: NodeInfo[], context: NodeSelectionContext): Promise<{ node: NodeInfo; metadata: any }> {
    const loadBalancedNodes = await this.smartContractBridge.getLoadBalancedNodes(nodes, 1);
    const selected = loadBalancedNodes[0];

    return {
      node: selected.node,
      metadata: {
        score: selected.score,
        weight: selected.weight,
        reasoning: 'Selected based on highest reputation score and weight'
      }
    };
  }

  private async selectByHealth(nodes: NodeInfo[], context: NodeSelectionContext): Promise<{ node: NodeInfo; metadata: any }> {
    // Sort by health metrics
    const healthyNodes = [...nodes].sort((a, b) => {
      // Primary sort: health status
      if (a.isHealthy !== b.isHealthy) {
        return a.isHealthy ? -1 : 1;
      }

      // Secondary sort: response time
      if (a.averageResponseTime !== b.averageResponseTime) {
        return (a.averageResponseTime || 0) - (b.averageResponseTime || 0);
      }

      // Tertiary sort: success rate
      const aSuccessRate = (a.totalRequests || 0) > 0 ? (a.successfulRequests || 0) / (a.totalRequests || 1) : 0;
      const bSuccessRate = (b.totalRequests || 0) > 0 ? (b.successfulRequests || 0) / (b.totalRequests || 1) : 0;
      return bSuccessRate - aSuccessRate;
    });

    const selected = healthyNodes[0];
    const score = this.calculateHealthScore(selected);

    return {
      node: selected,
      metadata: {
        score,
        weight: 1.0,
        reasoning: `Selected based on health metrics: ${selected.isHealthy ? 'healthy' : 'unhealthy'}, ${selected.averageResponseTime}ms avg response time`
      }
    };
  }

  private async selectByStake(nodes: NodeInfo[], context: NodeSelectionContext): Promise<{ node: NodeInfo; metadata: any }> {
    // Sort by stake weight
    const stakedNodes = [...nodes].sort((a, b) => (b.stakeWeight || 0) - (a.stakeWeight || 0));
    const selected = stakedNodes[0];
    const score = Math.min(100, ((selected.stakeWeight || 0) / 1000) * 100);

    return {
      node: selected,
      metadata: {
        score,
        weight: selected.stakeWeight,
        reasoning: `Selected based on stake weight: ${selected.stakeWeight}`
      }
    };
  }

  private async selectBalanced(nodes: NodeInfo[], context: NodeSelectionContext): Promise<{ node: NodeInfo; metadata: any }> {
    // Use the smart contract bridge's balanced scoring
    const loadBalancedNodes = await this.smartContractBridge.getLoadBalancedNodes(nodes, 1);
    const selected = loadBalancedNodes[0];

    return {
      node: selected.node,
      metadata: {
        score: selected.score,
        weight: selected.weight,
        reasoning: `Selected based on balanced score of ${selected.score.toFixed(1)} considering reputation, health, and stake`
      }
    };
  }

  private calculateHealthScore(node: NodeInfo): number {
    let score = 0;

    // Health status (40%)
    if (node.isHealthy) score += 40;

    // Success rate (30%)
    if ((node.totalRequests || 0) > 0) {
      const successRate = ((node.successfulRequests || 0) / (node.totalRequests || 1)) * 100;
      score += Math.min(30, successRate * 0.3);
    }

    // Calculate performance score (0-100)
      const avgResponseTime = (node as any).averageResponseTime || 100;
      const performanceScore = Math.max(0, 100 - (avgResponseTime / 10));

      // Calculate health score (0-100)
      const healthScore = 50; // Health score not available in NodeInfo

      // Calculate freshness score based on last health check
      const lastCheck = (node as any).lastHealthCheck || Date.now();
      const freshnessScore = Math.max(0, 100 - ((Date.now() - lastCheck) / 60000));

      // Weighted combination
      score += (performanceScore * 0.2) + (healthScore * 0.1) + (freshnessScore * 0.1);

    return Math.min(100, Math.max(0, score));
  }

  private async handleFallback(context: NodeSelectionContext, startTime: number): Promise<SelectionResult> {
    this.fallbackUsage++;

    try {
      // Try to get any available nodes as fallback
      const discoveryResult = await this.smartContractBridge.discoverOptimalNodes({
        limit: 10,
        minReputation: 0, // Lower threshold for fallback
        useCache: true // Force cache use for faster fallback
      });

      if (discoveryResult.nodes.length > 0) {
        const fallbackNode = discoveryResult.nodes[0]; // Just take the first available

        this.logger.warn('Using fallback node', {
          nodeId: fallbackNode.address,
          context
        });

        return {
          node: fallbackNode,
          strategy: 'fallback',
          confidence: 0.3,
          fallbackUsed: true,
          selectionTime: Date.now() - startTime,
          metadata: {
            score: 30,
            weight: 0.3,
            reasoning: 'Fallback node selection - limited availability'
          }
        };
      }

      throw new Error('No fallback nodes available');

    } catch (error) {
      this.logger.error('Fallback selection failed', error as Record<string, any>);
      throw new Error('No nodes available for request');
    }
  }

  private updateMetrics(node: NodeInfo, startTime: number): void {
    // Update node usage count
    if (!this.nodeUsageCount[node.address]) {
      this.nodeUsageCount[node.address] = 0;
    }
    this.nodeUsageCount[node.address]++;

    // Update state timestamp
    this.state.lastUpdateTime = Date.now();
  }

  private updateNodeConnections(node: NodeInfo): void {
    if (!this.state.nodeConnections[node.address]) {
      this.state.nodeConnections[node.address] = 0;
    }
    this.state.nodeConnections[node.address]++;
  }

  private updateAverageSelectionTime(selectionTime: number): void {
    if (this.totalSelections === 1) {
      this.averageSelectionTime = selectionTime;
    } else {
      this.averageSelectionTime = ((this.averageSelectionTime * (this.totalSelections - 1)) + selectionTime) / this.totalSelections;
    }
  }
}