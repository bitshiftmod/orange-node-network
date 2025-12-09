/**
 * Orange SDK - Advanced Features Examples
 *
 * This file demonstrates advanced usage patterns including:
 * - Custom node selection strategies
 * - Security and trust management
 * - Performance optimization
 * - Event-driven architecture
 * - Custom configurations
 */

import { OrangeSDK } from '../src/OrangeSDK';
import { SecurityManager, SecurityConfig } from '../src/security/SecurityManager';
import algosdk from 'algosdk';

// Example 1: Custom Node Selection Strategies
async function customNodeSelection() {
  console.log('=== Custom Node Selection Strategies ===');

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
    sdk: { enableP2P: true, enableReputation: true }
  });

  await sdk.initialize();

  // Geographic-based node selection
  console.log('🌍 Geographic-based Selection:');
  const geoNodes = await sdk.discoverOptimalNodes({
    minReputationScore: 70,
    maxResponseTime: 2000,
    geoPreference: 'us-east',
    preferredCapabilities: [{ type: 'storage', version: '1.0.0' }]
  }, 5);

  console.log(`Found ${geoNodes.length} nodes in us-east region`);

  // High-performance selection for compute operations
  console.log('⚡ High-performance Selection:');
  const perfNodes = await sdk.discoverOptimalNodes({
    minReputationScore: 90,
    maxResponseTime: 100,
    minSuccessRate: 0.99,
    preferredCapabilities: [{ type: 'compute', version: '2.0.0' }]
  }, 3);

  console.log(`Found ${perfNodes.length} high-performance compute nodes`);

  // Cost-optimized selection
  console.log('💰 Cost-optimized Selection:');
  const costNodes = await sdk.discoverOptimalNodes({
    minReputationScore: 60,
    maxResponseTime: 5000,
    maxFeeRate: BigInt(5000) // Maximum 0.005 ALGO per operation
  }, 5);

  console.log(`Found ${costNodes.length} cost-optimized nodes`);

  // Reputation-weighted selection
  console.log('⭐ Reputation-weighted Selection:');
  const repNodes = await sdk.discoverOptimalNodes({
    minReputationScore: 80,
    maxResponseTime: 1500,
    excludeNodes: [], // Could exclude previously failed nodes
    preferredCapabilities: [
      { type: 'relay', version: '1.0.0' },
      { type: 'indexing', version: '1.0.0' }
    ]
  }, 5);

  console.log(`Found ${repNodes.length} high-reputation nodes`);

  await sdk.destroy();
  return { geoNodes, perfNodes, costNodes, repNodes };
}

// Example 2: Security and Trust Management
async function securityManagement() {
  console.log('=== Security and Trust Management ===');

  const securityConfig: SecurityConfig = {
    encryption: {
      algorithm: 'aes-256-gcm',
      keySize: 256,
      ivSize: 12,
      tagSize: 16
    },
    identity: {
      verificationTimeout: 30000,
      challengeExpiration: 300000,
      maxFailedAttempts: 3,
      lockoutDuration: 3600000 // 1 hour
    },
    jwt: {
      secret: 'your-jwt-secret-key-here',
      expiresIn: '24h',
      issuer: 'orange-sdk',
      audience: 'orange-network'
    },
    trust: {
      minVerificationLevel: 'basic',
      requireSignatureVerification: true,
      enableReplayProtection: true,
      sessionTimeout: 3600000 // 1 hour
    },
    audit: {
      enabled: true,
      logLevel: 'info',
      retentionDays: 30,
      alertThresholds: {
        failedVerification: 5,
        suspiciousActivity: 3,
        securityEvents: 2
      }
    }
  };

  const securityManager = new SecurityManager(securityConfig);
  await securityManager.initialize();

  // Create and verify identity challenges
  console.log('🔐 Identity Verification Challenges:');

  const nodeId = 'example-node-123';

  // Create different types of challenges
  const powChallenge = await securityManager.createIdentityChallenge(
    nodeId,
    'proof-of-work',
    'medium'
  );
  console.log(`Created PoW challenge: ${powChallenge.id}`);

  const cryptoChallenge = await securityManager.createIdentityChallenge(
    nodeId,
    'cryptographic',
    'easy'
  );
  console.log(`Created cryptographic challenge: ${cryptoChallenge.id}`);

  // Simulate challenge responses
  const mockAnswer = { nonce: 'example-nonce-123', proof: 'example-proof' };
  const verificationResult = await securityManager.verifyChallengeResponse(
    powChallenge.id,
    mockAnswer,
    nodeId
  );

  if (verificationResult.success) {
    console.log(`✅ Challenge verified! Level: ${verificationResult.verificationLevel}`);
    console.log(`Security score: ${verificationResult.securityScore}`);
  }

  // Message encryption and decryption
  console.log('\n🔒 Message Encryption:');

  const message = {
    operation: 'store_data',
    data: 'sensitive information',
    timestamp: Date.now()
  };

  const encryptedMessage = await securityManager.encryptMessage(message, 'default', nodeId);
  console.log(`Message encrypted with key ID: ${encryptedMessage.keyId}`);

  const decryptedMessage = await securityManager.decryptMessage(encryptedMessage);
  console.log(`Message decrypted: ${JSON.stringify(decryptedMessage)}`);

  // JWT token management
  console.log('\n🎫 JWT Token Management:');

  const token = securityManager.generateSecurityToken(nodeId, 'trusted');
  console.log(`Generated security token for ${nodeId}`);

  const tokenVerification = securityManager.verifySecurityToken(token);
  console.log(`Token verification: ${tokenVerification.valid ? '✅ Valid' : '❌ Invalid'}`);
  if (tokenVerification.valid) {
    console.log(`Node ID: ${tokenVerification.nodeId}`);
    console.log(`Verification Level: ${tokenVerification.verificationLevel}`);
  }

  // Trust management
  console.log('\n🛡️ Trust Management:');

  await securityManager.addTrustedNode(nodeId, 'highly_trusted', Date.now() + 86400000); // 24 hours
  console.log(`Added ${nodeId} to trusted nodes`);

  // Monitor security status
  const securityStatus = await securityManager.getSecurityStatus();
  console.log(`Security health: ${securityStatus.health}`);
  console.log(`Blocked nodes: ${securityStatus.blockedNodes}`);
  console.log(`Trusted nodes: ${securityStatus.trustedNodes}`);

  if (securityStatus.recommendations.length > 0) {
    console.log('Recommendations:');
    securityStatus.recommendations.forEach(rec => console.log(`  - ${rec}`));
  }

  await securityManager.destroy();
  return { securityManager, securityStatus };
}

// Example 3: Performance Optimization
async function performanceOptimization() {
  console.log('=== Performance Optimization ===');

  // SDK with performance-focused configuration
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
    p2p: {
      network: {
        enabled: true,
        maxPeers: 100, // Increase peer limit for better load distribution
        discoveryInterval: 15000, // Faster discovery
        connectionTimeout: 5000, // Shorter timeout for faster failover
        heartbeatInterval: 30000 // More frequent health checks
      },
      performance: {
        bandwidthLimit: BigInt(2 * 1024 * 1024 * 1024), // 2GB
        maxMessageSize: 2 * 1024 * 1024, // 2MB
        compressionEnabled: true
      },
      discovery: {
        dhtEnabled: true,
        relayEnabled: true
      }
    },
    sdk: {
      enableP2P: true,
      enableReputation: true,
      cacheEnabled: true,
      logLevel: 'warn' // Reduce logging for performance
    }
  });

  await sdk.initialize();

  // Batch operations for efficiency
  console.log('📦 Batch Operations:');

  // Batch node discovery
  const nodeIds = ['node1', 'node2', 'node3', 'node4', 'node5'];
  const startTime = Date.now();

  const analytics = await sdk.getReputationAnalytics(nodeIds);
  const batchTime = Date.now() - startTime;

  console.log(`Batch reputation analysis completed in ${batchTime}ms`);
  console.log(`Analyzed ${analytics.totalNodes} nodes`);

  // Parallel fee calculations
  const feePromises = ['read', 'write', 'compute', 'storage'].map(operation =>
    sdk.calculateNetworkFee(operation)
  );

  const fees = await Promise.all(feePromises);
  console.log(`Parallel fee calculations completed:`);
  fees.forEach((fee, index) => {
    console.log(`  ${['read', 'write', 'compute', 'storage'][index]}: ${fee.estimatedFee} microAlgos`);
  });

  // Connection pooling simulation
  console.log('\n🔄 Connection Pool Management:');

  if (sdk.p2p) {
    // Connect to multiple nodes simultaneously
    const connectionPromises = Array.from({ length: 10 }, (_, i) =>
      sdk.p2p!.connect({
        maxPeers: 50,
        discoveryTimeout: 10000,
        trustLevel: 'known'
      }).catch(err => ({ error: err.message, index: i }))
    );

    const connections = await Promise.all(connectionPromises);
    const successful = connections.filter(conn => !conn.error).length;
    console.log(`Established ${successful}/10 connections`);

    // Monitor network performance
    const networkStats = await sdk.p2p.getNetworkStats();
    console.log(`Network performance metrics:`);
    console.log(`  Average latency: ${networkStats.averageLatency}ms`);
    console.log(`  Message rate: ${networkStats.messageRate}/sec`);
    console.log(`  Discovery rate: ${networkStats.discoveryRate}/sec`);
  }

  // Cache performance monitoring
  console.log('\n💾 Cache Performance:');

  // Simulate multiple cache hits and misses
  for (let i = 0; i < 100; i++) {
    const nodeId = `cache-test-node-${i % 10}`;
    await sdk.getReputationAnalytics([nodeId]); // Should benefit from caching
  }

  console.log('Cache stress test completed (100 operations)');

  await sdk.destroy();
}

// Example 4: Event-Driven Architecture
async function eventDrivenArchitecture() {
  console.log('=== Event-Driven Architecture ===');

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
    sdk: { enableP2P: true, enableReputation: true }
  });

  // Set up comprehensive event handling
  const eventStats = {
    nodeDiscovered: 0,
    nodeConnected: 0,
    reputationUpdated: 0,
    errors: 0
  };

  // Node lifecycle events
  sdk.on('node-discovered', (data) => {
    eventStats.nodeDiscovered++;
    console.log(`🔍 New node discovered: ${data.nodeId}`);

    // Trigger automatic reputation check
    setTimeout(() => {
      sdk.getReputationAnalytics([data.nodeId]);
    }, 1000);
  });

  sdk.on('node-connected', (data) => {
    eventStats.nodeConnected++;
    console.log(`🔗 Node connected: ${data.peerId}`);

    // Update connection metrics
    updateConnectionMetrics(data);
  });

  sdk.on('node-disconnected', (data) => {
    console.log(`❌ Node disconnected: ${data.peerId}`);

    // Trigger failover procedures
    handleNodeDisconnection(data);
  });

  // Reputation events
  sdk.on('reputation-updated', (data) => {
    eventStats.reputationUpdated++;
    const { nodeId, reputation, change } = data;

    console.log(`⭐ Reputation updated for ${nodeId}: ${reputation.overall} (${change > 0 ? '+' : ''}${change})`);

    // React to significant reputation changes
    if (Math.abs(change) > 10) {
      console.log(`🚨 Significant reputation change detected for ${nodeId}`);
      handleSignificantReputationChange(nodeId, change);
    }
  });

  // Economic events
  sdk.on('staked', (data) => {
    console.log(`💰 Staking event: ${data.nodeId} staked ${data.amount} microAlgos`);
    updateEconomicMetrics(data);
  });

  sdk.on('rewards-claimed', (data) => {
    console.log(`🎁 Rewards claimed: ${data.nodeId} received ${data.amount} microAlgos`);
  });

  // Security events
  sdk.on('node-verified', (data) => {
    console.log(`🛡️ Node verified: ${data.node.nodeId} at level ${data.verificationLevel}`);
  });

  // Error handling with automatic recovery
  sdk.on('error', (error) => {
    eventStats.errors++;
    console.error(`🚨 SDK Error: ${error.type} - ${error.message}`);

    // Automatic error recovery based on error type
    handleSdkError(error);
  });

  // Custom event aggregators
  let nodeCount = 0;
  sdk.on('node-discovered', () => {
    nodeCount++;
    if (nodeCount % 10 === 0) {
      console.log(`📈 Milestone: ${nodeCount} nodes discovered`);
    }
  });

  await sdk.initialize();

  // Simulate some activity to generate events
  console.log('🎯 Simulating network activity...');

  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    // These would normally be triggered by actual network events
    sdk.emit('node-discovered', { nodeId: `sim-node-${i}`, timestamp: Date.now() });
  }

  // Print event statistics
  setTimeout(() => {
    console.log('\n📊 Event Statistics:');
    console.log(`  Nodes discovered: ${eventStats.nodeDiscovered}`);
    console.log(`  Nodes connected: ${eventStats.nodeConnected}`);
    console.log(`  Reputation updates: ${eventStats.reputationUpdated}`);
    console.log(`  Errors: ${eventStats.errors}`);
  }, 2000);

  await sdk.destroy();

  return eventStats;
}

// Example 5: Advanced Configuration
async function advancedConfiguration() {
  console.log('=== Advanced Configuration ===');

  // Multi-network configuration
  const mainnetConfig = {
    algorand: {
      network: 'mainnet' as const,
      algodServer: 'https://mainnet-api.algonode.cloud',
      algodToken: '',
      algodPort: '443'
    },
    contracts: {
      subscriptionContractId: 123456789, // Mainnet contract ID
      nodeRegistryContractId: 987654321,
      reputationContractId: 555666777
    },
    sdk: {
      enableP2P: true,
      enableReputation: true,
      enableStaking: true,
      logLevel: 'error' // Minimal logging for production
    },
    security: {
      verifySignatures: true,
      requireMinimumStake: true,
      minReputationScore: 80, // Higher standards for mainnet
      enableEncryption: true
    }
  };

  const testnetConfig = {
    algorand: {
      network: 'testnet' as const,
      algodServer: 'https://testnet-api.algonode.cloud',
      algodToken: '',
      algodPort: '443'
    },
    contracts: {
      subscriptionContractId: 628375398, // Testnet contract ID
    },
    sdk: {
      enableP2P: true,
      enableReputation: true,
      enableStaking: false, // Staking disabled on testnet
      logLevel: 'debug' // Verbose logging for development
    },
    security: {
      verifySignatures: true,
      requireMinimumStake: false, // Lower requirements for testnet
      minReputationScore: 50,
      enableEncryption: true
    }
  };

  // Create SDK instances for different networks
  const mainnetSDK = new OrangeSDK(mainnetConfig);
  const testnetSDK = new OrangeSDK(testnetConfig);

  // Initialize both instances
  console.log('🔄 Initializing multi-network SDK instances...');
  await Promise.all([
    mainnetSDK.initialize(),
    testnetSDK.initialize()
  ]);

  // Compare network characteristics
  const [mainnetHealth, testnetHealth] = await Promise.all([
    mainnetSDK.getNetworkHealth(),
    testnetSDK.getNetworkHealth()
  ]);

  console.log('📊 Network Comparison:');
  console.log('Mainnet:');
  console.log(`  Status: ${mainnetHealth.status}`);
  console.log(`  Active nodes: ${mainnetHealth.metrics.activeNodes}`);
  console.log(`  Average reputation: ${mainnetHealth.metrics.averageReputation.toFixed(2)}`);

  console.log('Testnet:');
  console.log(`  Status: ${testnetHealth.status}`);
  console.log(`  Active nodes: ${testnetHealth.metrics.activeNodes}`);
  console.log(`  Average reputation: ${testnetHealth.metrics.averageReputation.toFixed(2)}`);

  // Dynamic configuration updates
  console.log('⚙️ Dynamic Configuration Updates:');

  // Update mainnet configuration for maintenance mode
  mainnetSDK.updateConfig({
    sdk: {
      ...mainnetConfig.sdk,
      logLevel: 'warn' // Increase logging during maintenance
    },
    security: {
      ...mainnetConfig.security,
      minReputationScore: 90 // Temporary higher requirements
    }
  });

  console.log('✅ Mainnet configuration updated for maintenance mode');

  // Cleanup
  await Promise.all([
    mainnetSDK.destroy(),
    testnetSDK.destroy()
  ]);

  return { mainnetHealth, testnetHealth };
}

// Helper functions for event-driven example
function updateConnectionMetrics(data: any) {
  // Update connection metrics
  console.log(`📊 Updating connection metrics for ${data.peerId}`);
}

function handleNodeDisconnection(data: any) {
  // Implement failover logic
  console.log(`🔄 Implementing failover for disconnected node ${data.peerId}`);
}

function handleSignificantReputationChange(nodeId: string, change: number) {
  if (change < -20) {
    console.log(`🚨 Major reputation degradation detected for ${nodeId}`);
    // Could trigger node removal, alerts, etc.
  } else if (change > 20) {
    console.log(`🎉 Major reputation improvement for ${nodeId}`);
    // Could trigger rewards, promotions, etc.
  }
}

function updateEconomicMetrics(data: any) {
  // Update economic metrics
  console.log(`💹 Updating economic metrics for ${data.nodeId}`);
}

function handleSdkError(error: any) {
  // Implement error recovery logic
  switch (error.type) {
    case 'connection_failed':
      console.log('🔄 Attempting automatic reconnection...');
      break;
    case 'node_discovery_failed':
      console.log('🔍 Switching to fallback node discovery...');
      break;
    default:
      console.log('❓ Using default error recovery strategy...');
  }
}

// Export all examples
export {
  customNodeSelection,
  securityManagement,
  performanceOptimization,
  eventDrivenArchitecture,
  advancedConfiguration
};

// Run examples if this file is executed directly
if (require.main === module) {
  console.log('🎯 Running Orange SDK Advanced Features Examples...\n');

  async function runAllExamples() {
    try {
      await customNodeSelection();
      console.log('\n---\n');

      await securityManagement();
      console.log('\n---\n');

      await performanceOptimization();
      console.log('\n---\n');

      await eventDrivenArchitecture();
      console.log('\n---\n');

      await advancedConfiguration();

      console.log('\n✅ All advanced examples completed successfully!');
    } catch (error) {
      console.error('\n❌ Advanced examples failed:', error);
      process.exit(1);
    }
  }

  runAllExamples();
}