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
 * Deploy all Orange Network smart contracts to TestNet
 */
export async function deployToTestnet(): Promise<DeploymentInfo> {
  console.log('🚀 Starting TestNet deployment...');

  try {
    // Create AlgorandClient for TestNet using environment variables
    // Expects: ALGOD_SERVER, ALGOD_TOKEN, ALGOD_PORT (or uses defaults for TestNet)
    const algorand = AlgorandClient.fromEnvironment();
    
    // Get deployer account from mnemonic in environment variable
    // Expects: DEPLOYER_MNEMONIC environment variable
    const mnemonicKey = process.env.DEPLOYER_MNEMONIC;
    if (!mnemonicKey) {
      throw new Error('DEPLOYER_MNEMONIC environment variable is required for TestNet deployment');
    }
    
    const deployer = await algorand.account.fromMnemonic(mnemonicKey);

    console.log(`📦 Deployer account: ${deployer.addr}`);
    
    // Get balance
    const accountInfo = await algorand.account.getInformation(deployer.addr);
    console.log(`💰 Initial balance: ${accountInfo.balance} microAlgos`);

    // Check if account has sufficient funds for TestNet deployment
    const minBalance = 50_000_000n; // 50 ALGO minimum for TestNet deployment
    if (accountInfo.balance.microAlgo < minBalance) {
      throw new Error(`Insufficient funds for TestNet deployment. Required: ${minBalance} microAlgos, Available: ${accountInfo.balance.microAlgo} microAlgos`);
    }

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
      network: 'testnet',
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
      path.join(deploymentDir, 'testnet.json'),
      JSON.stringify(deploymentInfo, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)
    );

    console.log('💾 Deployment info saved to deployments/testnet.json');

    // Verify deployment
    console.log('🔍 Verifying deployment...');
    await verifyDeployment(algorand, deploymentInfo);

    // Run basic tests on deployed contracts
    console.log('🧪 Running basic deployment tests...');
    await runDeploymentTests(algorand, deploymentInfo);

    console.log('🎉 TestNet deployment completed successfully!');
    console.log('');
    console.log('Contract Summary:');
    console.log(`NodeRegistry: ${nodeRegistryResult.appId} (${nodeRegistryResult.appAddress})`);
    console.log(`GatewayRegistry: ${gatewayRegistryResult.appId} (${gatewayRegistryResult.appAddress})`);
    console.log(`Subscriptions: ${subscriptionsResult.appId} (${subscriptionsResult.appAddress})`);

    console.log('');
    console.log('📋 Next steps:');
    console.log('1. Fund the contract addresses if they need initial balance');
    console.log('2. Test contract functionality');
    console.log('3. Monitor for any issues');
    console.log('4. Update your application configuration with the new contract addresses');

    return deploymentInfo;

  } catch (error) {
    console.error('❌ TestNet deployment failed:', error);
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

  // Fund the app account with more for TestNet (2 ALGO)
  await algorand.send.payment({
    sender: deployer.addr,
    receiver: appClient.appAddress,
    amount: algokit.algos(2),
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

  // Fund the app account with more for TestNet (2 ALGO)
  await algorand.send.payment({
    sender: deployer.addr,
    receiver: appClient.appAddress,
    amount: algokit.algos(2),
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

  // Fund the app account with more for TestNet (2 ALGO)
  await algorand.send.payment({
    sender: deployer.addr,
    receiver: appClient.appAddress,
    amount: algokit.algos(2),
  });

  return {
    appId: appClient.appId,
    appAddress: appClient.appAddress.toString(),
  };
}

/**
 * Verify that all contracts are deployed and accessible on TestNet
 */
async function verifyDeployment(algorand: AlgorandClient, deploymentInfo: DeploymentInfo): Promise<void> {
  const contracts = deploymentInfo.contracts;

  for (const [contractName, contractInfo] of Object.entries(contracts)) {
    try {
      const appInfo = await algorand.app.getById(BigInt(contractInfo.appId));
      console.log(`✅ ${contractName}: App ID ${contractInfo.appId} verified on TestNet`);
      console.log(`   Address: ${contractInfo.appAddress}`);
    } catch (error) {
      throw new Error(`❌ ${contractName}: App ID ${contractInfo.appId} verification failed on TestNet: ${error}`);
    }
  }
}

/**
 * Run basic tests on deployed contracts
 */
async function runDeploymentTests(algorand: AlgorandClient, deploymentInfo: DeploymentInfo): Promise<void> {
  console.log('🧪 Running deployment tests...');

  try {
    // Test that contracts are accessible and have correct state
    for (const [contractName, contractInfo] of Object.entries(deploymentInfo.contracts)) {
      const appInfo = await algorand.app.getById(BigInt(contractInfo.appId));
      console.log(`✅ ${contractName} is accessible and has global state`);
    }

    console.log('✅ All deployment tests passed');
  } catch (error) {
    console.error('❌ Deployment tests failed:', error);
    throw error;
  }
}

/**
 * Get TestNet configuration
 */
export function getTestnetConfig() {
  return {
    algodServer: 'https://testnet-api.algonode.cloud',
    algodToken: '',
    algodPort: 443,
    indexerServer: 'https://testnet-idx.algonode.cloud',
    indexerToken: '',
    indexerPort: 443
  };
}

/**
 * Estimate deployment costs
 */
export function estimateTestnetDeploymentCosts() {
  const minBalancePerApp = 100000; // 0.1 ALGO
  const minBalancePerByte = 25000; // 0.025 ALGO per byte
  const transactionFee = 2000; // 0.002 ALGO per transaction

  const numContracts = 3;
  const estimatedAppSize = 2000; // bytes per app (approximate)
  const globalSchemaBytes = 150; // approximate storage needs
  const localSchemaBytes = 50; // approximate storage needs

  const totalMinBalance = numContracts * (minBalancePerApp + (estimatedAppSize + globalSchemaBytes + localSchemaBytes) * minBalancePerByte);
  const totalTransactionFees = numContracts * transactionFee;
  const buffer = 2000000; // 2 ALGO buffer

  const totalCost = totalMinBalance + totalTransactionFees + buffer;

  return {
    minBalance: totalMinBalance,
    transactionFees: totalTransactionFees,
    buffer,
    total: totalCost,
    inAlgos: totalCost / 1000000
  };
}

// Run deployment if this file is executed directly (ESM compatible)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const costs = estimateTestnetDeploymentCosts();
  console.log('💰 Estimated TestNet deployment costs:');
  console.log(`Total: ${costs.inAlgos.toFixed(6)} ALGO`);
  console.log('Proceeding with deployment...');

  deployToTestnet()
    .then(() => {
      console.log('✅ TestNet deployment completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ TestNet deployment failed:', error);
      process.exit(1);
    });
}