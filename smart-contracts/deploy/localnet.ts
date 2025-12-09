import * as algokit from '@algorandfoundation/algokit-utils';
import { AlgorandClient } from '@algorandfoundation/algokit-utils';
import * as fs from 'fs/promises';
import * as path from 'path';
import { OrangeNodeRegistryFactory } from '../src/clients/OrangeNodeRegistryClient.js';
import { OrangeGatewayRegistryFactory } from '../src/clients/OrangeGatewayRegistryClient.js';
import { OrangeSubscriptionsContractFactory } from '../src/clients/OrangeSubscriptionsClient.js';
import type { Address } from 'algosdk';
import type { TransactionSignerAccount } from '@algorandfoundation/algokit-utils/types/account';

// Configure algokit for auto-population of app call resources
algokit.Config.configure({ populateAppCallResources: true });

interface DeploymentResult {
  appId: bigint;
  appAddress: string;
}

interface DeploymentInfo {
  network: string;
  timestamp: string;
  contracts: {
    nodeRegistry: DeploymentResult;
    gatewayRegistry: DeploymentResult;
    subscriptions: DeploymentResult;
  };
  deployer: {
    address: string;
  };
}

/**
 * Deploy all Orange Network smart contracts to LocalNet
 */
export async function deployToLocalnet(): Promise<DeploymentInfo> {
  console.log('🚀 Starting LocalNet deployment...');

  try {
    // Create AlgorandClient for LocalNet
    const algorand = AlgorandClient.fromEnvironment();
    
    // Get or create deployer account from KMD
    const deployer = await algorand.account.fromKmd('unencrypted-default-wallet', (accts) => accts[0]);

    console.log(`📦 Deployer account: ${deployer.addr}`);
    
    // Get balance
    const accountInfo = await algorand.account.getInformation(deployer.addr);
    console.log(`💰 Initial balance: ${accountInfo.balance} microAlgos`);

    // Deploy NodeRegistry
    console.log('📄 Deploying NodeRegistry contract...');
    const nodeRegistryResult = await deployNodeRegistry(algorand, deployer);
    console.log(`✅ NodeRegistry deployed with app ID: ${nodeRegistryResult.appId}`);

    // Deploy GatewayRegistry
    console.log('📄 Deploying GatewayRegistry contract...');
    const gatewayRegistryResult = await deployGatewayRegistry(algorand, deployer);
    console.log(`✅ GatewayRegistry deployed with app ID: ${gatewayRegistryResult.appId}`);

    // Deploy Subscriptions
    console.log('📄 Deploying Subscriptions contract...');
    const subscriptionsResult = await deploySubscriptions(algorand, deployer);
    console.log(`✅ Subscriptions deployed with app ID: ${subscriptionsResult.appId}`);

    // Save deployment info
    const deploymentInfo: DeploymentInfo = {
      network: 'localnet',
      timestamp: new Date().toISOString(),
      contracts: {
        nodeRegistry: nodeRegistryResult,
        gatewayRegistry: gatewayRegistryResult,
        subscriptions: subscriptionsResult,
      },
      deployer: {
        address: deployer.addr.toString(),
      },
    };

    // Save deployment info to file
    const deploymentDir = path.join(process.cwd(), 'deployments');

    try {
      await fs.mkdir(deploymentDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    await fs.writeFile(
      path.join(deploymentDir, 'localnet.json'),
      JSON.stringify(deploymentInfo, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)
    );

    console.log('💾 Deployment info saved to deployments/localnet.json');

    // Verify deployment
    console.log('🔍 Verifying deployment...');
    await verifyDeployment(algorand, deploymentInfo);

    console.log('🎉 LocalNet deployment completed successfully!');
    console.log('');
    console.log('Contract Summary:');
    console.log(`NodeRegistry: ${nodeRegistryResult.appId}`);
    console.log(`GatewayRegistry: ${gatewayRegistryResult.appId}`);
    console.log(`Subscriptions: ${subscriptionsResult.appId}`);

    return deploymentInfo;

  } catch (error) {
    console.error('❌ Deployment failed:', error);
    throw error;
  }
}

/**
 * Deploy NodeRegistry contract using v3 factory pattern
 */
async function deployNodeRegistry(
  algorand: AlgorandClient,
  deployer: Address & TransactionSignerAccount
): Promise<DeploymentResult> {
  const factory = new OrangeNodeRegistryFactory({
    algorand,
    defaultSender: deployer.addr,
  });

  const { appClient } = await factory.send.create.createApplication({
    args: {},
  });

  // Fund the app account
  await algorand.send.payment({
    sender: deployer.addr,
    receiver: appClient.appAddress,
    amount: algokit.algos(1),
  });

  return {
    appId: appClient.appId,
    appAddress: appClient.appAddress.toString(),
  };
}

/**
 * Deploy GatewayRegistry contract using v3 factory pattern
 */
async function deployGatewayRegistry(
  algorand: AlgorandClient,
  deployer: Address & TransactionSignerAccount
): Promise<DeploymentResult> {
  const factory = new OrangeGatewayRegistryFactory({
    algorand,
    defaultSender: deployer.addr,
  });

  const { appClient } = await factory.send.create.createApplication({
    args: {},
  });

  // Fund the app account
  await algorand.send.payment({
    sender: deployer.addr,
    receiver: appClient.appAddress,
    amount: algokit.algos(1),
  });

  return {
    appId: appClient.appId,
    appAddress: appClient.appAddress.toString(),
  };
}

/**
 * Deploy Subscriptions contract using v3 factory pattern
 */
async function deploySubscriptions(
  algorand: AlgorandClient,
  deployer: Address & TransactionSignerAccount
): Promise<DeploymentResult> {
  const factory = new OrangeSubscriptionsContractFactory({
    algorand,
    defaultSender: deployer.addr,
  });

  const { appClient } = await factory.send.create.createApplication({
    args: {},
  });

  // Fund the app account
  await algorand.send.payment({
    sender: deployer.addr,
    receiver: appClient.appAddress,
    amount: algokit.algos(1),
  });

  return {
    appId: appClient.appId,
    appAddress: appClient.appAddress.toString(),
  };
}

/**
 * Verify that all contracts are deployed and accessible
 */
async function verifyDeployment(algorand: AlgorandClient, deploymentInfo: DeploymentInfo): Promise<void> {
  const contracts = deploymentInfo.contracts;

  for (const [contractName, contractInfo] of Object.entries(contracts)) {
    try {
      await algorand.app.getById(BigInt(contractInfo.appId));
      console.log(`✅ ${contractName}: App ID ${contractInfo.appId} verified`);
    } catch (error) {
      throw new Error(`❌ ${contractName}: App ID ${contractInfo.appId} verification failed: ${error}`);
    }
  }
}

/**
 * Get LocalNet configuration
 */
export function getLocalnetConfig() {
  return {
    algodServer: 'http://localhost:4001',
    algodToken: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    indexerServer: 'http://localhost:8980',
    indexerToken: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  };
}

// Run deployment if this file is executed directly (ESM compatible)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  deployToLocalnet()
    .then(() => {
      console.log('✅ LocalNet deployment completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ LocalNet deployment failed:', error);
      process.exit(1);
    });
}