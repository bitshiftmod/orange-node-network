# Orange Gateway

The **Orange Gateway** is a lightweight, high-performance API gateway and proxy server for the Orange Node Network. It serves as the entry point for clients to interact with the decentralized network of Orange Nodes.

## 📊 Test Status

| Category | Tests | Status |
|----------|-------|--------|
| Authentication | 28 | ✅ Passing |
| Middleware | 35 | ✅ Passing |
| Services | 48 | ✅ Passing |
| Utils | 20 | ✅ Passing |
| **Total** | **131** | ✅ **All Passing** |

## 🚀 Features

- **Smart Contract Registry**: Discovers available nodes directly from the Algorand blockchain
- **Load Balancing**: Distributes traffic across healthy nodes using smart contract data
- **Authentication**: JWT-based authentication with API key support
- **HTTP Proxy**: High-performance proxying of requests to backend nodes
- **Security**: Built-in rate limiting, CORS, and security headers
- **Observability**: Health checks and metrics endpoints

## 🏗️ Architecture

The gateway is designed to be minimal and stateless:

1. **Discovery**: Fetches list of active nodes from the Smart Contract Bridge
2. **Selection**: Selects the optimal node based on health, performance, and reputation
3. **Proxying**: Forwards the client request to the selected node

## 🛠️ Getting Started

### Prerequisites

- Node.js v18+
- Algorand Node (or access to an API like AlgoNode)

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file based on `.env.example`:

```env
PORT=3000
ALGOD_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
ALGOD_SERVER=http://localhost
ALGOD_PORT=4001
SMART_CONTRACT_APP_ID=123456
JWT_SECRET=your-secret-key
```

### Running

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## 🔌 API Endpoints

### Core
- `GET /health`: Service health status
- `GET /metrics`: Basic metrics (uptime, request stats)

### Bridge / Discovery
- `GET /bridge/status`: Status of the Smart Contract Bridge
- `GET /bridge/nodes/discover`: List of discovered nodes

### Authentication
- `POST /auth/login`: Login with wallet address
- `POST /auth/refresh`: Refresh JWT tokens

### Proxy
- `ALL /*`: All other requests are proxied to the optimal Orange Node

## 🧪 Testing

```bash
# Run all tests (131 tests)
npm test

# Run with watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

## 📝 Development

### Build
```bash
npm run build
```

## 🔧 Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.3+
- **Testing**: Jest 29
- **HTTP**: Express/Fastify
- **Blockchain**: algosdk v3, algokit-utils v9

## 🗺️ Roadmap

See [ROADMAP.md](./ROADMAP.md) for future features and plans.
