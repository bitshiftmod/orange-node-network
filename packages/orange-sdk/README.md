# Orange Node Network SDK

TypeScript/JavaScript SDK for the Orange Node Network - Gateway client and smart contract integration.

## Installation

```bash
npm install @orange-node-network/sdk
```

## Quick Start

```typescript
import { OrangeSDK } from '@orange-node-network/sdk';

// Create SDK with API key authentication
const sdk = OrangeSDK.createWithApiKey(
  'https://gateway.orange-network.io',
  'your-api-key',
  'mainnet'
);

// Check gateway health
const health = await sdk.checkHealth();
console.log('Gateway healthy:', health.isHealthy);

// Get available nodes
const nodes = await sdk.getNodes();
console.log('Available nodes:', nodes.length);
```

## Authentication Methods

### API Key
```typescript
const sdk = OrangeSDK.createWithApiKey(gatewayUrl, apiKey, network);
```

### JWT Token
```typescript
const sdk = OrangeSDK.createWithJWT(gatewayUrl, token, refreshToken, network);
```

### Environment Variables
```typescript
// Set ORANGE_GATEWAY_URL and ORANGE_API_KEY
import { createSDKFromEnv } from '@orange-node-network/sdk';
const sdk = createSDKFromEnv('mainnet');
```

## Features

- **Gateway Client**: HTTP client with retry, caching, and rate limiting
- **Authentication**: API key, JWT, and OAuth support
- **Smart Contracts**: Generated clients for Orange contracts
- **TypeScript**: Full type safety and IntelliSense
- **Browser + Node**: Works in both environments

## Smart Contract Clients

Access generated contract clients for direct blockchain interaction:

```typescript
import { 
  OrangeSubscriptionsContractClient,
  OrangeNodeRegistryClient 
} from '@orange-node-network/sdk/contracts';
```

## Development

```bash
# Install dependencies
npm install

# Copy generated contract clients
npm run copy-contracts

# Build
npm run build

# Run tests
npm test
```

## License

MIT
