# Orange Node Network Smart Contracts

Algorand smart contracts for the Orange Node Network, built with AlgoKit TypeScript.

## 🚀 Overview

This package contains the core smart contracts for the Orange Node Network:

- **OrangeNodeRegistry**: Node registration, staking, and management
- **OrangeGatewayRegistry**: Gateway registration and staking
- **OrangeSubscriptions**: User subscription management with ORA token

## 📊 Test Status

| Contract | Tests | Status |
|----------|-------|--------|
| OrangeNodeRegistry | 40 | ✅ Passing |
| OrangeGatewayRegistry | 39 | ✅ Passing |
| OrangeSubscriptions | 40 | ✅ Passing |
| **Total** | **119** | ✅ **All Passing** |

## 📋 Prerequisites

- Node.js 18+
- npm or yarn
- AlgoKit CLI (`pipx install algokit`)
- Docker (for LocalNet)

## 🛠️ Installation

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
```

## 🏗️ Build & Compilation

```bash
# Build everything (compile contracts, generate clients, build deploy scripts)
npm run build

# Compile contracts only
npm run build:contracts

# Generate TypeScript clients
npm run generate:clients

# Type check
npm run typecheck
```

## 🧪 Testing

```bash
# Run all tests (119 tests)
npm test

# Run with watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

## 🚀 Deployment

### Local Development (LocalNet)

```bash
# Start LocalNet
algokit localnet start

# Deploy to LocalNet
npm run deploy:local
```

### TestNet Deployment

```bash
# Set required environment variables
export DEPLOYER_MNEMONIC="your 25-word mnemonic"

# Deploy to TestNet
npm run deploy:test
```

### MainNet Deployment

```bash
# Deploy to MainNet (requires DEPLOYER_MNEMONIC)
npm run deploy:mainnet
```

## 📁 Project Structure

```
smart-contracts/
├── src/
│   ├── OrangeNodeRegistry.algo.ts      # Node registration contract
│   ├── OrangeGatewayRegistry.algo.ts   # Gateway registration contract
│   ├── OrangeSubscriptions.algo.ts     # Subscription management contract
│   ├── clients/                         # Generated TypeScript clients
│   └── artifacts/                       # Compiled contract artifacts
├── deploy/
│   ├── localnet.ts                      # LocalNet deployment (v3 API)
│   └── testnet.ts                       # TestNet deployment (v3 API)
├── tests/
│   ├── OrangeNodeRegistry.test.ts       # Node registry tests
│   ├── OrangeGatewayRegistry.test.ts    # Gateway registry tests
│   └── OrangeSubscriptions.test.ts      # Subscriptions tests
└── artifacts/                           # ARC-32 application specs
```

## 🔧 Technology Stack

- **AlgoKit Utils**: v9.1.2 (v3 API with AlgorandClient)
- **Algorand SDK**: v3.5.2
- **TypeScript**: v5.3.3
- **Jest**: v29.7.0
- **AlgoKit TypeScript**: v1.0.1

## 🏛️ Contracts

### 1. OrangeNodeRegistry

**Purpose**: Register orange-nodes with unique Algorand P2P IDs to prevent reuse.

**Features**:
- Unique P2P ID enforcement (one orange-node per Algorand node)
- Configurable stake requirements (admin-controlled)
- Stake management (add stake, withdraw to minimum or full)
- Heartbeat system for uptime tracking
- Status management (active/suspended/banned)
- BoxMap storage for discoverability

**Key Methods**:
- `registerNode(p2pId, pay)` - Register a node with P2P ID and stake payment
- `unregisterNode()` - Unregister and return stake
- `heartbeat()` - Submit heartbeat for uptime tracking
- `addStake(pay)` - Add additional stake
- `withdrawStake(amount)` - Withdraw stake to minimum
- `getNodeInfo(account)` - Get node information
- `updateMinStakeNodes(minStake)` - Admin: update minimum stake

### 2. OrangeGatewayRegistry

**Purpose**: Register gateways for decentralized discovery.

**Features**:
- Gateway registration with endpoint and public key
- Configurable stake requirements (admin-controlled)
- Stake management (add stake, withdraw to minimum or full)
- Heartbeat system for availability tracking
- Status management (active/suspended/banned)
- BoxMap storage for discoverability

**Key Methods**:
- `registerGateway(endpoint, publicKey, pay)` - Register a gateway
- `unregisterGateway()` - Unregister and return stake
- `heartbeat()` - Submit heartbeat for uptime tracking
- `addStake(pay)` - Add additional stake
- `withdrawStake(amount)` - Withdraw stake to minimum
- `getGatewayInfo(account)` - Get gateway information
- `updateMinStakeGateways(minStake)` - Admin: update minimum stake

### 3. OrangeSubscriptions

**Purpose**: Manage user subscriptions with ORA token payments.

**Features**:
- Direct subscription payments (30-day and 1-year tiers)
- Gift subscription NFTs (ARC-19)
- Subscription expiration tracking
- Admin-controlled pricing
- ORA ASA token integration

**Key Methods**:
- `bootstrap(oraAsaId)` - Initialize with ORA token
- `subscribe(subscriptionType, pay)` - Subscribe with ORA payment
- `giftSubscription(recipient, subscriptionType, pay)` - Gift a subscription
- `redeemGiftSubscription(giftAsaId)` - Redeem a gift NFT
- `getSubscription(account)` - Get subscription expiration
- `updatePrice30day(price)` - Admin: update 30-day price
- `updatePriceYear(price)` - Admin: update yearly price

## 🔧 Configuration

### Environment Variables

```bash
# Algorand Configuration (v3 API uses environment auto-detection)
ALGOD_SERVER=https://testnet-api.algonode.cloud
ALGOD_PORT=443
ALGOD_TOKEN=your-algod-token

# Deployment
DEPLOYER_MNEMONIC="your 25-word mnemonic"
```

## 🔌 Integration Examples

### Using Generated Clients (v3 API)

```typescript
import { AlgorandClient } from '@algorandfoundation/algokit-utils';
import { OrangeNodeRegistryFactory } from './src/clients/OrangeNodeRegistryClient';

// Create AlgorandClient
const algorand = AlgorandClient.fromEnvironment();

// Create factory
const factory = new OrangeNodeRegistryFactory({
  algorand,
  defaultSender: deployer.addr,
});

// Deploy contract
const { appClient } = await factory.send.create.createApplication({ args: {} });

// Register a node
await algorand.newGroup()
  .addPayment({
    sender: nodeAccount.addr,
    receiver: appClient.appAddress,
    amount: algokit.algos(5), // 5 ALGO stake
  })
  .addAppCallMethodCall(
    await appClient.params.registerNode({
      args: { p2pId: 'unique-p2p-id' },
      sender: nodeAccount.addr,
    })
  )
  .send();

// Get node info
const info = await appClient.getNodeInfo({ args: { account: nodeAccount.addr } });
console.log('Node stake:', info.returnValue);
```

## 📄 License

MIT License - see LICENSE file for details.

---

Built with ❤️ for the Algorand ecosystem using AlgoKit TypeScript.