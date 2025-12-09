import { SmartContractBridgeConfig } from '../services/SmartContractBridge';

/**
 * Smart Contract Bridge Configuration
 */
export function getSmartContractBridgeConfig(): SmartContractBridgeConfig {
  const network = process.env.ALGORAND_NETWORK || 'testnet';

  // Algod configuration
  const algodToken = process.env.ALGOD_TOKEN || '';
  const algodServer = process.env.ALGOD_SERVER || 'http://localhost';
  const algodPort = parseInt(process.env.ALGOD_PORT || '4001');

  // Indexer configuration (optional)
  const indexerToken = process.env.INDEXER_TOKEN || '';
  const indexerServer = process.env.INDEXER_SERVER || 'http://localhost';
  const indexerPort = parseInt(process.env.INDEXER_PORT || '8980');

  // Smart contract application IDs
  const nodeRegistryAppId = parseInt(process.env.NODE_REGISTRY_APP_ID || '0');
  const orangeSubscriptionsAppId = parseInt(process.env.ORANGE_SUBSCRIPTIONS_APP_ID || '0');

  // Load balancing weights
  const reputationWeight = parseFloat(process.env.LOAD_BALANCING_REPUTATION_WEIGHT || '0.4');
  const healthWeight = parseFloat(process.env.LOAD_BALANCING_HEALTH_WEIGHT || '0.3');
  const stakeWeight = parseFloat(process.env.LOAD_BALANCER_STAKE_WEIGHT || '0.3');

  // Validate weights
  if (reputationWeight < 0 || reputationWeight > 1 ||
      healthWeight < 0 || healthWeight > 1 ||
      stakeWeight < 0 || stakeWeight > 1) {
    throw new Error('Load balancing weights must be between 0 and 1');
  }

  const totalWeight = reputationWeight + healthWeight + stakeWeight;
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    throw new Error('Load balancing weights must sum to 1.0');
  }

  return {
    algod: {
      token: algodToken,
      server: algodServer,
      port: algodPort
    },
    indexer: indexerServer && indexerToken ? {
      token: indexerToken,
      server: indexerServer,
      port: indexerPort
    } : undefined,
    contracts: {
      nodeRegistryAppId,
      orangeSubscriptionsAppId
    },
    network: network as 'mainnet' | 'testnet' | 'betanet',
    cache: {
      ttl: parseInt(process.env.BRIDGE_CACHE_TTL || '300'), // 5 minutes
      maxSize: parseInt(process.env.BRIDGE_CACHE_MAX_SIZE || '100')
    },
    loadBalancing: {
      reputationWeight,
      healthWeight,
      stakeWeight
    }
  };
}