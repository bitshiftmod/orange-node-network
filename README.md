# Orange Node Network

Decentralized Algorand Node Network with Gateway API, Real-time WebSocket, and Zero-Trust Security.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start all services in development
npm run dev

# Build for production
npm run build

# Run all tests
npm test
```

## 📊 Project Status

| Component | Tests | Status |
|-----------|-------|--------|
| smart-contracts | 119 | ✅ Passing |
| orange-gateway | 131 | ✅ Passing |
| orange-node | 76 | ✅ Passing |

## 📁 Project Structure

```
orange-node-network/
├── apps/                   # Application services
│   ├── orange-gateway/     # API Gateway (REST + WebSocket) - 131 tests
│   ├── orange-node/        # Algorand node service - 76 tests
│   ├── orange-site/        # Marketing website
│   └── orange-tracker/     # Network tracker service
├── packages/              # Shared libraries
│   ├── orange-sdk/        # TypeScript SDK
│   └── orange-react/      # React components
├── smart-contracts/       # Algorand smart contracts - 119 tests
│   ├── src/               # Contract source (TypeScript)
│   ├── deploy/            # Deployment scripts (v3 API)
│   └── tests/             # Contract tests
├── legacy-contracts/      # Legacy contract implementations
└── github-workflow-sandbox/  # CI/CD workflows
```

## 📚 Documentation

- **[Developer Docs](./docs/)** - Architecture, design, and operational guides
- **[Public Documentation](./site/)** - User-facing documentation website (Docusaurus)
- **[API Reference](./site/docs/api.md)** - REST API documentation
- **[SDK Guide](./site/docs/sdks/typescript.md)** - TypeScript SDK documentation

### Key Documentation Files

- [Architecture Design](./docs/architecture-design.md) - System architecture overview
- [Component Diagrams](./docs/component-diagrams.md) - Visual architecture diagrams
- [Production Infrastructure](./docs/PRODUCTION_INFRASTRUCTURE.md) - Production deployment guide
- [Dependency Migration](./docs/DEPENDENCY_MIGRATION_GUIDE.md) - Dependency management

## 🛠️ Development

### Prerequisites

- Node.js 18+
- Docker
- Kubernetes (for production)
- Algorand node access

### Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Configure your credentials
# ALGORAND_ADDRESS=your-address
# ALGORAND_PRIVATE_KEY=your-key
# ORANGE_GATEWAY_URL=https://api.orange-node.network
```

### Running Services

```bash
# Start documentation site
cd site
npm run start

# Start gateway in dev mode
cd apps/orange-gateway
npm run dev

# Start orange node service
cd apps/orange-node
npm run dev
```

## 🚢 Deployment

### Docker

```bash
# Build all containers
docker-compose build

# Start services
docker-compose up -d
```

### Kubernetes (Helm)

```bash
# Install Orange Network
helm install orange-network ./helm/orange-network -f ./helm/environments/prod-values.yaml

# Install monitoring
helm install orange-monitoring ./helm/orange-monitoring
```

### Terraform

```bash
cd terraform/environments/prod
terraform init
terraform plan
terraform apply
```

## 🧪 Testing

```bash
# Run all tests across the monorepo
npm run test

# Run specific package tests
cd smart-contracts && npm test    # 119 tests
cd apps/orange-gateway && npm test # 131 tests
cd apps/orange-node && npm test    # 76 tests
```

## 📦 Monorepo

This project uses Turborepo for monorepo management:

- **Fast builds** - Intelligent caching and parallel execution
- **Shared packages** - Code reuse across applications
- **Consistent tooling** - Unified ESLint, TypeScript, and Prettier configs

## 🛠️ Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.3+
- **Blockchain**: Algorand (algosdk v3, algokit-utils v9)
- **Testing**: Jest 29
- **Build**: Turborepo
- **Smart Contracts**: AlgoKit TypeScript

## 🤝 Contributing

See [Contributing Guidelines](./site/docs/contributing/guidelines.md) for details on:

- Code standards
- Pull request process
- Development workflow
- Testing requirements

## 📝 License

MIT License - see LICENSE file for details

## 🔗 Links

- [Documentation Website](https://orange-node-network.bitshift.dev)
- [API Endpoint](https://api.orange-node.network)
- [GitHub Repository](https://github.com/bitshiftmod/orange-node-network)

## 🆘 Support

- [FAQ](./site/docs/troubleshooting/faq.md)
- [Common Issues](./site/docs/troubleshooting/common-issues.md)
- Discord Community (coming soon)

---

**Built with ❤️ for the Algorand ecosystem**
