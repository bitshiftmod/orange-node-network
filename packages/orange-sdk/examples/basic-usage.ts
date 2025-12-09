/**
 * Orange SDK - Basic Usage Examples
 *
 * This file demonstrates fundamental usage of the enhanced Orange SDK
 * with P2P discovery, reputation management, and decentralized features.
 */

import { OrangeSDK } from '../src/OrangeSDK';
import algosdk from 'algosdk';

// Example 1: Basic SDK Initialization (Subscription-only mode)
async function basicInitialization() {
  console.log('=== Basic SDK Initialization ===');

  const sdk = new OrangeSDK({
    algorand: {
      network: 'testnet',
      algodServer: 'https://testnet-api.algonode.cloud',
      algodToken: '',
      algodPort: '443'
    },
    contracts: {
      subscriptionContractId: 628375398
    },
    sdk: {
      enableP2P: false, // Disable P2P for basic usage
      enableReputation: false,
      enableStaking: false,
      autoReconnect: true,
      cacheEnabled: true,
      logLevel: 'info'
    }
  });

  try {
    await sdk.initialize();
    console.log('✅ SDK initialized successfully');

    // Set up event listeners
    sdk.on('subscribed', (data) => {
      console.log(`📦 User subscribed: ${data.address}`);
    });

    sdk.on('error', (error) => {
      console.error(`❌ SDK Error: ${error.message}`);
    });

    return sdk;
  } catch (error) {
    console.error('❌ Failed to initialize SDK:', error);
    throw error;
  }
}

// Example 2: Full P2P-enabled SDK Initialization
async function p2pInitialization() {
  console.log('=== P2P-Enabled SDK Initialization ===');

  const sdk = new OrangeSDK({
    algorand: {
      network: 'testnet',
      algodServer: 'https://testnet-api.algonode.cloud',
      algodToken: '',
      algodPort: '443'
    },
    contracts: {
      subscriptionContractId: 628375398,
      nodeRegistryContractId: 123456789, // Example contract ID
      reputationContractId: 987654321,  // Example contract ID
      stakingContractId: 555666777       // Example contract ID
    },
    p2p: {
      network: {
        enabled: true,
        maxPeers: 50,
        discoveryInterval: 30000,
        connectionTimeout: 10000,
        heartbeatInterval: 60000
      },
      security: {
        encryption: true,
        verification: true,
        minTrustLevel: 'basic',
        challengeInterval: 300000
      },
      discovery: {
        bootstrapPeers: [
          '/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWExample1',
          '/ip4/127.0.0.1/tcp/4002/p2p/12D3KooWExample2'
        ],
        dhtEnabled: true,
        mdnsEnabled: false,
        relayEnabled: true
      },
      performance: {
        bandwidthLimit: BigInt(1024 * 1024 * 1024), // 1GB
        maxMessageSize: 1024 * 1024, // 1MB
        compressionEnabled: true
      },
      logging: {
        level: 'info',
        enabled: true
      }
    },
    sdk: {
      enableP2P: true,
      enableReputation: true,
      enableStaking: true,
      autoReconnect: true,
      cacheEnabled: true,
      logLevel: 'info'
    },
    security: {
      verifySignatures: true,
      requireMinimumStake: false,
      minReputationScore: 60,
      enableEncryption: true
    }
  });

  try {
    await sdk.initialize();
    console.log('✅ P2P SDK initialized successfully');

    // Set up comprehensive event listeners
    sdk.on('node-discovered', (data) => {
      console.log(`🔍 Node discovered: ${data.nodeId}`);
    });

    sdk.on('node-connected', (data) => {
      console.log(`🔗 Node connected: ${data.peerId}`);
    });

    sdk.on('reputation-updated', (data) => {
      console.log(`⭐ Reputation updated: ${data.nodeId} -> ${data.reputation.overall}`);
    });

    sdk.on('staked', (data) => {
      console.log(`💰 Tokens staked: ${data.nodeId} (${data.amount})`);
    });

    return sdk;
  } catch (error) {
    console.error('❌ Failed to initialize P2P SDK:', error);
    throw error;
  }
}

// Example 3: Managing Subscriptions
async function subscriptionManagement(sdk: OrangeSDK) {
  console.log('=== Subscription Management ===');

  try {
    // Example user address (in production, this would come from wallet)
    const userAddress = 'X2F7A3N4D5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D9E0F1';

    // Check existing subscription
    const existingSubscription = await sdk.getSubscription(userAddress);
    if (existingSubscription) {
      console.log(`📋 Existing subscription found: ${existingSubscription.serviceTier}`);
      console.log(`   Expires: ${existingSubscription.expirationDate}`);
      console.log(`   Assigned nodes: ${existingSubscription.assignedNodes.length}`);
      return existingSubscription;
    }

    // Create new subscription (requires signer)
    console.log('📝 Creating new subscription...');

    // In production, you would get this from the user's wallet
    const mockSigner: algosdk.TransactionSigner = async (txns, indexes) => {
      // This is a mock signer - in production, integrate with actual wallet
      console.log(`📝 Signing ${txns.length} transaction(s) at indexes: ${indexes.join(', ')}`);

      // Return mock signed transactions
      return txns.map((txn, index) => ({
        txn,
        sig: new Uint8Array(64).fill(1) // Mock signature
      }));
    };

    // Subscribe to 30-day plan
    const { Subscription30Day } = await import('../src/sdk');
    const result = await sdk.subscribe(Subscription30Day, userAddress, mockSigner);
    console.log(`✅ Subscription created with tx ID: ${result.txId}`);

    // Get the enhanced subscription details
    const subscription = await sdk.getSubscription(userAddress);
    if (subscription) {
      console.log(`🎯 Service tier: ${subscription.serviceTier}`);
      console.log(`📊 Service status: ${subscription.serviceStatus.successRate}% success rate`);
    }

    return subscription;
  } catch (error) {
    console.error('❌ Subscription management failed:', error);
    throw error;
  }
}

// Example 4: P2P Node Discovery and Selection
async function nodeDiscovery(sdk: OrangeSDK) {
  console.log('=== P2P Node Discovery ===');

  if (!sdk.p2p) {
    console.log('⚠️ P2P not enabled in this SDK instance');
    return;
  }

  try {
    // Connect to P2P network
    console.log('🌐 Connecting to P2P network...');
    await sdk.p2p.connect({
      maxPeers: 20,
      discoveryTimeout: 30000,
      includeRelayNodes: true,
      verifyOnChainRegistration: true,
      trustLevel: 'known'
    });

    // Discover optimal nodes
    console.log('🔍 Discovering optimal nodes...');
    const optimalNodes = await sdk.discoverOptimalNodes({
      minReputationScore: 75,
      maxResponseTime: 1000,
      minSuccessRate: 0.95,
      maxFailedChallenges: 2,
      networkType: 'testnet',
      preferredCapabilities: [
        { type: 'relay', version: '1.0.0' },
        { type: 'storage', version: '1.0.0' }
      ]
    });

    console.log(`📈 Found ${optimalNodes.length} optimal nodes:`);
    optimalNodes.forEach((node, index) => {
      console.log(`  ${index + 1}. ${node.id}`);
      console.log(`     Reputation: ${node.reputation.overall}/100`);
      console.log(`     Region: ${node.region || 'Unknown'}`);
      console.log(`     Capabilities: ${node.capabilities.map(c => c.type).join(', ')}`);
      console.log(`     Staked: ${node.stakingInfo?.amount || 0} microAlgos`);
    });

    // Select best node for specific operation
    const bestNode = await sdk.discoverOptimalNodes({
      minReputationScore: 80,
      maxResponseTime: 500,
      preferredCapabilities: [{ type: 'compute', version: '1.0.0' }]
    }, 1);

    if (bestNode.length > 0) {
      console.log(`🏆 Best node selected: ${bestNode[0].id}`);
      return bestNode[0];
    }

    return optimalNodes;
  } catch (error) {
    console.error('❌ Node discovery failed:', error);
    throw error;
  }
}

// Example 5: Reputation System Usage
async function reputationManagement(sdk: OrangeSDK, nodeIds: string[]) {
  console.log('=== Reputation Management ===');

  try {
    // Get reputation analytics for multiple nodes
    console.log('📊 Fetching reputation analytics...');
    const analytics = await sdk.getReputationAnalytics(nodeIds);

    console.log(`📈 Network Reputation Overview:`);
    console.log(`  Total nodes: ${analytics.totalNodes}`);
    console.log(`  Average score: ${analytics.averageReputation.toFixed(2)}`);
    console.log(`  Distribution:`);
    console.log(`    Excellent (90-100): ${analytics.distribution.excellent}`);
    console.log(`    Good (75-89): ${analytics.distribution.good}`);
    console.log(`    Average (60-74): ${analytics.distribution.average}`);
    console.log(`    Poor (<60): ${analytics.distribution.poor}`);

    console.log('\n🏆 Top Performers:');
    analytics.topPerformers.forEach((performer, index) => {
      console.log(`  ${index + 1}. ${performer.nodeId}: ${performer.score}/100 - ${performer.reason}`);
    });

    // Get detailed reputation for a specific node
    if (nodeIds.length > 0) {
      const nodeId = nodeIds[0];
      if (sdk.p2p) {
        const reputation = await sdk.p2p.getReputation(nodeId);
        if (reputation) {
          console.log(`\n🎯 Detailed Reputation for ${nodeId}:`);
          console.log(`  Overall: ${reputation.overall}/100`);
          console.log(`  Components:`);
          console.log(`    Performance: ${reputation.components.performance}/100`);
          console.log(`    Availability: ${reputation.components.availability}/100`);
          console.log(`    Responsiveness: ${reputation.components.responsiveness}/100`);
          console.log(`    Security: ${reputation.components.security}/100`);
          console.log(`    Stake Weight: ${reputation.components.stakeWeight}/100`);

          if (reputation.badges.length > 0) {
            console.log(`  Badges: ${reputation.badges.map(b => b.type).join(', ')}`);
          }

          // Get recent reputation history
          const history = await sdk.p2p?.getReputation?.(nodeId);
          if (history && history.history.length > 0) {
            console.log(`  Recent changes:`);
            history.history.slice(-5).forEach((entry, index) => {
              const date = new Date(entry.timestamp).toLocaleString();
              console.log(`    ${date}: ${entry.change > 0 ? '+' : ''}${entry.change} (${entry.reason})`);
            });
          }
        }
      }
    }

    return analytics;
  } catch (error) {
    console.error('❌ Reputation management failed:', error);
    throw error;
  }
}

// Example 6: Economic Features - Staking and Rewards
async function economicFeatures(sdk: OrangeSDK, nodeId: string) {
  console.log('=== Economic Features ===');

  // Note: This example requires staking to be enabled and proper contract setup

  try {
    // Mock signer for staking operations
    const mockSigner: algosdk.TransactionSigner = async (txns, indexes) => {
      console.log(`💰 Signing staking transaction(s)`);
      return txns.map((txn, index) => ({
        txn,
        sig: new Uint8Array(64).fill(1)
      }));
    };

    // Calculate dynamic fee for operation
    console.log('💸 Calculating dynamic fees...');
    const feeStructure = await sdk.calculateNetworkFee('compute', nodeId);
    console.log(`Fee breakdown:`);
    console.log(`  Base fee: ${feeStructure.baseFee} microAlgos`);
    console.log(`  Network load multiplier: ${feeStructure.networkLoadMultiplier}x`);
    console.log(`  Reputation discount: ${(feeStructure.reputationDiscount * 100).toFixed(1)}%`);
    console.log(`  Stake weight bonus: ${(feeStructure.stakeWeightBonus * 100).toFixed(1)}%`);
    console.log(`  Estimated fee: ${feeStructure.estimatedFee} microAlgos`);

    // Note: Actual staking would require integration with staking contracts
    console.log('\n💡 Staking Operations:');
    console.log('  (These would require proper contract integration)');
    console.log(`  - Stake: 100 ALGO for 30 days`);
    console.log(`  - Delegate: 50 ALGO to node ${nodeId}`);
    console.log(`  - Claim rewards: Available after staking period`);

    return feeStructure;
  } catch (error) {
    console.error('❌ Economic features failed:', error);
    throw error;
  }
}

// Example 7: Network Health and Monitoring
async function networkMonitoring(sdk: OrangeSDK) {
  console.log('=== Network Health Monitoring ===');

  try {
    // Get current network health
    const health = await sdk.getNetworkHealth();
    console.log(`🏥 Network Health Status: ${health.status.toUpperCase()}`);
    console.log(`📊 Network Metrics:`);
    console.log(`  Total nodes: ${health.metrics.totalNodes}`);
    console.log(`  Active nodes: ${health.metrics.activeNodes}`);
    console.log(`  Average reputation: ${health.metrics.averageReputation.toFixed(2)}`);
    console.log(`  Network load: ${(health.metrics.networkLoad * 100).toFixed(1)}%`);
    console.log(`  Average latency: ${health.metrics.averageLatency}ms`);
    console.log(`  Error rate: ${(health.metrics.errorRate * 100).toFixed(2)}%`);

    if (health.issues.length > 0) {
      console.log(`\n⚠️ Network Issues:`);
      health.issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue.type} (${issue.severity}): ${issue.description}`);
      });
    }

    if (health.recommendations.length > 0) {
      console.log(`\n💡 Recommendations:`);
      health.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    }

    // Get usage statistics
    console.log('\n📈 Usage Statistics:');
    const usageStats = await sdk.getUsageStatistics('day');
    console.log(`  Requests (24h): ${usageStats.requests.total}`);
    console.log(`  Success rate: ${((usageStats.requests.successful / usageStats.requests.total) * 100).toFixed(2)}%`);
    console.log(`  Average response time: ${usageStats.requests.averageResponseTime}ms`);
    console.log(`  Bandwidth used: ${Number(usageStats.bandwidth.sent) / 1024} KB sent, ${Number(usageStats.bandwidth.received) / 1024} KB received`);
    console.log(`  Total fees: ${usageStats.costs.totalFees} microAlgos`);

    return { health, usageStats };
  } catch (error) {
    console.error('❌ Network monitoring failed:', error);
    throw error;
  }
}

// Example 8: Complete Workflow
async function completeWorkflow() {
  console.log('🚀 Starting Complete Orange SDK Workflow');

  try {
    // 1. Initialize SDK with P2P features
    const sdk = await p2pInitialization();

    // 2. Manage user subscription
    const subscription = await subscriptionManagement(sdk);
    if (subscription) {
      console.log(`✅ Subscription active: ${subscription.serviceTier}`);
    }

    // 3. Discover and connect to P2P nodes
    const nodes = await nodeDiscovery(sdk);
    const nodeIds = nodes?.slice(0, 5).map(n => n.id) || [];

    // 4. Analyze reputation
    if (nodeIds.length > 0) {
      await reputationManagement(sdk, nodeIds);

      // 5. Calculate fees
      if (nodes && nodes.length > 0) {
        await economicFeatures(sdk, nodes[0].id);
      }
    }

    // 6. Monitor network health
    await networkMonitoring(sdk);

    console.log('\n🎉 Complete workflow finished successfully!');

    // Cleanup
    await sdk.destroy();
    console.log('🧹 SDK destroyed and resources cleaned up');

  } catch (error) {
    console.error('❌ Complete workflow failed:', error);
    throw error;
  }
}

// Example 9: Error Handling and Resilience
async function errorHandlingExample() {
  console.log('=== Error Handling and Resilience ===');

  const sdk = new OrangeSDK({
    algorand: {
      network: 'testnet',
      algodServer: 'https://invalid-server.example.com', // Invalid server to test error handling
      algodToken: '',
      algodPort: '443'
    },
    sdk: {
      enableP2P: false,
      enableReputation: false,
      enableStaking: false,
      autoReconnect: true,
      logLevel: 'info'
    }
  });

  // Set up comprehensive error handling
  sdk.on('error', (error) => {
    console.error(`🚨 SDK Error: ${error.type} - ${error.message}`);

    // Handle specific error types
    switch (error.type) {
      case 'connection_failed':
        console.log('🔄 Attempting to reconnect...');
        break;
      case 'node_discovery_failed':
        console.log('🔍 Falling back to known nodes...');
        break;
      case 'reputation_fetch_failed':
        console.log('⭐ Using cached reputation data...');
        break;
      default:
        console.log('❓ Unknown error type, using default handling...');
    }
  });

  try {
    await sdk.initialize();
  } catch (error) {
    console.log('✅ Expected error caught and handled gracefully');
  }

  // Example of resilient subscription check
  try {
    const subscription = await sdk.getSubscription('invalid-address');
    if (!subscription) {
      console.log('📝 No subscription found (expected for invalid address)');
    }
  } catch (error) {
    console.log('✅ Subscription check handled gracefully');
  }

  await sdk.destroy();
}

// Export examples for use in tests or other modules
export {
  basicInitialization,
  p2pInitialization,
  subscriptionManagement,
  nodeDiscovery,
  reputationManagement,
  economicFeatures,
  networkMonitoring,
  completeWorkflow,
  errorHandlingExample
};

// Run examples if this file is executed directly
if (require.main === module) {
  console.log('🎯 Running Orange SDK Examples...\n');

  // Run a specific example or the complete workflow
  completeWorkflow()
    .then(() => {
      console.log('\n✅ All examples completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Example failed:', error);
      process.exit(1);
    });
}