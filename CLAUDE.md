# Orange Node Network - AI Assistant Context

## Project Overview

**Orange Node Network** is a decentralized Algorand node network with a gateway API, real-time WebSocket support, and zero-trust security architecture. The system provides developers with reliable, scalable access to the Algorand blockchain through a distributed network of nodes.

### Test Status (December 2025)

| Component | Tests | Status |
|-----------|-------|--------|
| smart-contracts | 119 | ✅ All Passing |
| orange-gateway | 131 | ✅ All Passing |
| orange-node | 76 | ✅ All Passing |
| **Total** | **326** | ✅ **All Passing** |

### Core Features
- **Decentralized Gateway**: Load-balanced API gateway with JWT authentication
- **Real-time WebSocket**: Live blockchain event streaming
- **TypeScript SDK**: Type-safe client library for node and browser
- **Zero-Trust Security**: Mutual TLS, rate limiting, and audit logging
- **Smart Contracts**: AlgoKit TypeScript contracts (v3 API)
- **Kubernetes-Native**: Helm charts for production deployment

---

## Project Structure

```
orange-node-network/
├── apps/                          # Application services
│   ├── orange-gateway/            # API Gateway (TypeScript) - 131 tests
│   ├── orange-node/               # Orange Node proxy - 76 tests
│   ├── orange-site/               # Marketing website (Vite + React)
│   ├── orange-subscription-test-app/  # Subscription testing app
│   └── orange-tracker/            # Blockchain transaction tracker
│
├── packages/                      # Shared libraries
│   ├── orange-sdk/               # TypeScript SDK
│   ├── orange-react/             # React hooks and components
│   └── sdk/                      # SDK variants (Python, TypeScript)
│
├── smart-contracts/               # Algorand smart contracts - 119 tests
│   ├── src/                      # Contract source (AlgoKit TypeScript)
│   │   ├── OrangeNodeRegistry.algo.ts
│   │   ├── OrangeGatewayRegistry.algo.ts
│   │   ├── OrangeSubscriptions.algo.ts
│   │   └── clients/              # Generated TypeScript clients
│   ├── deploy/                   # Deployment scripts (v3 API)
│   │   ├── localnet.ts
│   │   └── testnet.ts
│   └── tests/                    # Contract tests
│
├── legacy-contracts/              # Legacy contract implementations
│
├── github-workflow-sandbox/       # CI/CD workflow testing
│
├── .env.example                   # Environment template
├── package.json                   # Turborepo workspace config
├── turbo.json                     # Turborepo configuration
└── jest.config.js                 # Jest configuration
```

---

## Technology Stack

### Backend (TypeScript - Production Implementation)
- **Language**: TypeScript 5.3+ (Node.js 18+)
- **Framework**: Express.js 4.x
- **WebSocket**: ws library
- **Authentication**: JWT (jsonwebtoken)
- **Database**: PostgreSQL
- **Cache**: Redis
- **Testing**: Jest 29

### Smart Contracts
- **AlgoKit Utils**: v9.1.2 (v3 API with AlgorandClient)
- **Algorand SDK**: v3.5.2
- **AlgoKit TypeScript**: v1.0.1
- **Deployment**: localnet.ts, testnet.ts (v3 factory pattern)

### Frontend
- **SDK**: TypeScript
- **React Library**: @orange-node-network/react
- **Documentation**: Docusaurus
- **Marketing Site**: Vite + React

### Infrastructure
- **Containers**: Docker
- **Orchestration**: Kubernetes (Helm)
- **IaC**: Terraform
- **Cloud**: AWS / Azure / GCP (multi-cloud)
- **Monitoring**: Prometheus + Grafana
- **Logging**: CloudWatch / Stackdriver

---

## Key Concepts

### Architecture

The system follows a **microservices architecture** with:

1.  **Gateway Layer**: API gateway handles authentication, rate limiting, and request routing
2.  **Node Layer**: Distributed Algorand nodes provide blockchain access
3.  **Storage Layer**: PostgreSQL for metadata, Redis for caching
4.  **WebSocket Layer**: Real-time event streaming to clients

### Authentication Flow

```typescript
Client → Gateway (JWT Auth) → Orange Node → Algorand Network
         ↓
    Refresh Token
```

1.  Client authenticates with Algorand address/private key
2.  Gateway issues JWT access token (15min) and refresh token (7d)
3.  Client uses access token for API calls
4.  Client refreshes access token using refresh token

### Deployment Model

```
Load Balancer (Nginx)
    ↓
Gateway Pods (3-10 replicas, autoscaling)
    ↓
Orange Node Pods (2-6 replicas, autoscaling)
    ↓
PostgreSQL (HA with read replicas)
Redis (Master + 2 replicas)
```

---

## Development Workflow

### Setup

```bash
# Clone repository
git clone https://github.com/bitshiftmod/orange-node-network
cd orange-node-network

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your credentials

# Start development
npm run dev
```

### Testing

```bash
# Run all tests across monorepo
npm test

# Run specific component tests
cd smart-contracts && npm test  # 119 tests
cd apps/orange-gateway && npm test  # 131 tests
cd apps/orange-node && npm test  # 76 tests

# Run with coverage
npm run test:coverage
```

### Building

```bash
# Build all apps
npm run build

# Build specific app
cd apps/orange-gateway && npm run build
```

### Documentation Site

```bash
# Start Docusaurus site locally
cd site
npm run start
# Opens at http://localhost:3000

# Build static site
npm run build
```

---

## Key Files & Configuration

### Environment Variables

Located in `.env.example`:
- `ALGORAND_ADDRESS` - Your Algorand address
- `ALGORAND_PRIVATE_KEY` - Your private key (keep secret!)
- `ALGOD_SERVER` - Algod server URL
- `ALGOD_TOKEN` - Algod API token
- `ALGOD_PORT` - Algod port
- `DEPLOYER_MNEMONIC` - 25-word mnemonic for deployments

### Package Configuration

- **Root `package.json`**: Turborepo workspace configuration
- **`turbo.json`**: Turborepo pipeline configuration
- **App `package.json`**: Individual app dependencies and scripts

### Smart Contract Configuration

- **Contracts**: `smart-contracts/src/*.algo.ts`
- **Clients**: `smart-contracts/src/clients/` (auto-generated)
- **Deploy Scripts**: `smart-contracts/deploy/` (v3 API)

---

## Common Tasks

### Adding a New API Endpoint (Gateway)

1. **Define route** in `apps/orange-gateway/src/routes/`
2. **Add controller** in `apps/orange-gateway/src/controllers/`
3. **Implement service logic** in `apps/orange-gateway/src/services/`
4. **Write tests** in `apps/orange-gateway/src/tests/`
5. **Update documentation**

### Smart Contract Development

1. **Edit contract** in `smart-contracts/src/*.algo.ts`
2. **Compile**: `npm run build:contracts`
3. **Generate clients**: `npm run generate:clients`
4. **Write tests** in `smart-contracts/tests/`
5. **Deploy**: `npm run deploy:local` or `npm run deploy:test`

### Deploying Smart Contracts

```bash
cd smart-contracts

# LocalNet (start localnet first: algokit localnet start)
npm run deploy:local

# TestNet (requires DEPLOYER_MNEMONIC env var)
npm run deploy:test
```

---

## Code Standards

### TypeScript

- **Strict mode** enabled
- **No `any` types** without good reason
- **Explicit return types** for public functions
- **Async/await** preferred over promises
- **Error handling** with try/catch blocks

### Naming Conventions

- **Files**: `kebab-case.ts`
- **Classes**: `PascalCase`
- **Functions**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Types/Interfaces**: `PascalCase`

### File Organization

```typescript
// 1. Imports (grouped)
import { external } from 'external-lib';
import { internal } from '@/internal';
import type { TypeDef } from './types';

// 2. Constants
const DEFAULT_TIMEOUT = 5000;

// 3. Types
interface Config {
  // ...
}

// 4. Implementation
export class Service {
  // ...
}

// 5. Exports
export { Config };
```

---

## Testing Strategy

### Unit Tests
- Test individual functions/methods
- Mock external dependencies
- Located in `*.test.ts` files

### Integration Tests
- Test API endpoints end-to-end
- Use test database
- Located in `tests/integration/`

### E2E Tests
- Test full user workflows
- Use real services (in test mode)
- Located in `tests/e2e/`

---

## Troubleshooting

### Common Issues

1. **Build failures**: Run `npm clean-install` to reset dependencies
2. **Test failures**: Check `.env` configuration and ensure LocalNet is running
3. **Smart contract errors**: Check `algokit localnet status` and restart if needed
4. **Type errors**: Run `npm run typecheck` to see all TypeScript issues

### Debugging

```bash
# View gateway logs
cd apps/orange-gateway
npm run dev

# View node logs  
cd apps/orange-node
npm run dev

# Check LocalNet status
algokit localnet status

# Reset LocalNet
algokit localnet reset
```

---

## Important Notes for AI Assistants

### Do's ✅
- **Read** existing code before suggesting changes
- **Follow** TypeScript strict mode and existing patterns
- **Test** changes with Jest
- **Update** documentation when adding features
- **Use** the existing SDK for Algorand interactions
- **Keep** file sizes under 500 lines when possible
- **Preserve** existing error handling patterns

### Don'ts ❌
- **Don't** hardcode secrets or credentials
- **Don't** use `any` type unless absolutely necessary
- **Don't** create files in root directory (use appropriate subdirectories)
- **Don't** bypass authentication in production code
- **Don't** modify Helm/Terraform without understanding impact
- **Don't** change API contracts without versioning
- **Don't** remove error handling or logging

---

## Current Status (December 2025)

### Completed ✅
- Smart contracts (OrangeNodeRegistry, OrangeGatewayRegistry, OrangeSubscriptions) - 119 tests
- Orange Gateway API with authentication - 131 tests
- Orange Node proxy service - 76 tests
- Deploy scripts updated to algokit-utils v3 API
- TypeScript SDK (orange-sdk)
- React components (orange-react)

### Smart Contracts
- **OrangeNodeRegistry**: Node registration with P2P ID binding, staking, heartbeat
- **OrangeGatewayRegistry**: Gateway registration with endpoint/publicKey, staking
- **OrangeSubscriptions**: User subscriptions with ORA token, gift NFTs

### Technology Versions
- algokit-utils: v9.1.2 (v3 API with AlgorandClient)
- algosdk: v3.5.2
- TypeScript: v5.3+
- Jest: v29.7.0
- Node.js: v18+

---

## Resources

- **Repository**: https://github.com/bitshiftmod/orange-node-network
- **Algorand Docs**: https://developer.algorand.org/
- **AlgoKit Docs**: https://developer.algorand.org/docs/get-started/algokit/

---

**Remember**: This is a production system handling real blockchain transactions. Always prioritize security, reliability, and data integrity.
