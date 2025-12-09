# Smart Contract Tests

This directory contains comprehensive unit tests for the Orange Network smart contracts.

## Overview

The test suite covers three main contracts:
- **OrangeNodeRegistry** - Node registration and management
- **OrangeGatewayRegistry** - Gateway registration and management  
- **OrangeSubscriptions** - Subscription management with NFT gifts

## Test Framework

Tests use:
- **Jest** - Test runner
- **AlgoKit Utils** - Algorand testing utilities
- **algorand-typescript-testing** (planned) - v1.0 contract testing

## Setup

### Prerequisites
- Node.js 18+
- AlgoKit CLI installed
- Docker (for LocalNet)

### Installation
```bash
npm install
```

### Generate Typed Clients

Before running tests, generate typed clients from the compiled contracts:

```bash
# Compile contracts first
npm run build:contracts

# Generate typed clients (TODO: add client generation script)
# algokit generate client artifacts/OrangeNodeRegistry.arc32.json --output src/clients
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- OrangeNodeRegistry.test.ts

# Run in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Test Structure

Each test file follows this structure:

```typescript
describe('ContractName', () => {
  describe('Feature Category', () => {
    test('should behavior description', async () => {
      // Test implementation
    });
  });
});
```

### Test Categories

1. **Initialization** - Contract creation and setup
2. **Registration** - User/node/gateway registration
3. **Stake Management** - Adding/withdrawing funds
4. **Heartbeat System** - Activity tracking
5. **Admin Functions** - Administrative operations
6. **Query Functions** - Read-only methods
7. **Edge Cases** - Boundary conditions and limits

## Current Status

🚧 **Tests are currently scaffolded** with comprehensive test cases defined but need:

1. **Typed Client Generation** - Run AlgoKit client generator on artifacts
2. **Client Import** - Import generated clients in test files
3. **Implementation** - Fill in test implementations using typed clients
4. **LocalNet** - Start LocalNet for integration testing

## Next Steps

### 1. Generate Clients

```bash
# After successful compilation, generate clients
algokit generate client artifacts/OrangeNodeRegistry.arc32.json \
  --output src/clients/OrangeNodeRegistryClient.ts

algokit generate client artifacts/OrangeGatewayRegistry.arc32.json \
  --output src/clients/OrangeGatewayRegistryClient.ts

algokit generate client artifacts/OrangeSubscriptionsContract.arc32.json \
  --output src/clients/OrangeSubscriptionsClient.ts
```

### 2. Update Test Imports

Replace the TODO comments in test files with actual imports:

```typescript
import { OrangeNodeRegistryClient } from '../src/clients/OrangeNodeRegistryClient';
```

### 3. Implement Tests

Each test currently has comments showing what should be tested. Fill in implementations like:

```typescript
test('should register node with valid stake', async () => {
  const { algod, testAccount } = fixture.context;
  
  const client = new OrangeNodeRegistryClient({
    sender: testAccount,
    resolveBy: 'id',
    id: 0
  }, algod);

  const createResult = await client.create.createApplication({});
  
  // Create payment transaction
  const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from: testAccount.addr,
    to: createResult.appAddress,
    amount: 4000_000000, // 4000 ORA
    suggestedParams: await algod.getTransactionParams().do()
  });

  // Register node
  const p2pId = Buffer.from('test-node-p2p-id');
  const proof = new Uint8Array(32);
  
  const result = await client.registerNode({
    payment: paymentTxn,
    algorandNodeP2PId: p2pId,
    signedProof: proof
  });

  // Verify
  expect(result.transactions.length).toBe(2);
  const localState = await client.appClient.getLocalState(testAccount.addr);
  expect(localState.p2pId.asString()).toBe('test-node-p2p-id');
});
```

### 4. Run Tests

```bash
npm test
```

## Test Coverage Goals

Target coverage:
- **Statements**: > 90%
- **Branches**: > 85%
- **Functions**: > 90%
- **Lines**: > 90%

## Debugging Tests

### View Test Output
```bash
npm test -- --verbose
```

### Debug Specific Test
```bash
npm test -- -t "should register node with valid stake"
```

### Inspect Failed Transactions
The tests use AlgoKit transaction logging. Check console output for transaction IDs and use:
```bash
algokit goal clerk inspect <txid>
```

## Best Practices

1. **Isolation** - Each test should be independent
2. **Cleanup** - Use `beforeEach` for fresh state
3. **Descriptive Names** - Test names should describe behavior
4. **Assertions** - Test one thing per test
5. **Edge Cases** - Test boundaries and error conditions

## Common Issues

### "App not found"
- Ensure contract is deployed before testing
- Check that client is initialized correctly

### "Insufficient funds"
- Verify test accounts are funded (default: 100 ALGO)
- Check minimum balances for opt-ins

### "Logic eval error"
- Review transaction parameters
- Check assertion messages in contract code
- Verify correct transaction ordering in groups

## Resources

- [AlgoKit Utils Testing](https://github.com/algorandfoundation/algokit-utils-ts/blob/main/docs/capabilities/testing.md)
- [Algorand TypeScript Testing](https://github.com/algorandfoundation/algorand-typescript-testing)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [AlgoKit Client Generator](https://github.com/algorandfoundation/algokit-client-generator-ts)
