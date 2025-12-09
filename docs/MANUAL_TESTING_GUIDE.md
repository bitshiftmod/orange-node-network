# Orange Node Network - Manual Testing Guide

This guide walks through testing `orange-node` and `orange-gateway` locally.

## Prerequisites

### 1. Algorand Node Access

Choose one option:

**Option A: AlgoKit LocalNet (Recommended for testing)**
```bash
# Install AlgoKit if not already installed
pipx install algokit

# Start LocalNet
algokit localnet start

# Verify it's running
curl http://localhost:4001/v2/status
```

**Option B: Use Algonode TestNet (No local node needed)**
- Algod: `https://testnet-api.algonode.cloud`
- No token required for Algonode

**Option C: Your own Algorand node**
- Use `ALGORAND_DATA` env var to point to your node's data directory
- Or set `ALGOD_URL` and `ALGOD_TOKEN` manually

### 2. Redis (Optional)

Redis is used for caching in `orange-node`. You can skip it for basic testing.

```bash
# Option 1: Docker
docker run -d --name redis -p 6379:6379 redis

# Option 2: Skip Redis (set REDIS_OPTIONAL=true)
```

### 3. Install Dependencies

```bash
cd /path/to/orange-node-network

# Install all workspace dependencies
yarn install
```

---

## Phase 1: Testing orange-node (Algod Proxy)

`orange-node` is a proxy server that sits in front of an Algorand node, adding caching, rate limiting, metrics, and authentication.

### Step 1.1: Configure Environment

```bash
cd apps/orange-node
cp .env.example .env
```

Edit `.env` with minimal configuration:

```env
# === MINIMAL CONFIG FOR LOCALNET ===
ALGOD_URL=http://localhost:4001
ALGOD_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Security
ORANGE_API_KEY=test-api-key-12345

# Disable Redis for simple testing
REDIS_OPTIONAL=true
ENABLE_CACHE=false

# Logging
LOG_LEVEL=debug
LOG_FORMAT=pretty
```

**For Algonode TestNet instead:**
```env
ALGOD_URL=https://testnet-api.algonode.cloud
ALGOD_TOKEN=
```

### Step 1.2: Start orange-node

```bash
# From apps/orange-node directory
npm run dev
```

Expected output:
```
Orange Node starting...
Orange Node Server initialized successfully
Orange Node Server started successfully { port: 3000, host: '0.0.0.0' }
```

### Step 1.3: Test Endpoints

Open a new terminal and run these tests:

#### Health Check (No auth required)
```bash
curl http://localhost:3000/health
```
Expected: `{"status":"healthy",...}`

#### Metrics (No auth required)
```bash
curl http://localhost:3000/metrics
```
Expected: Prometheus-format metrics

#### Version
```bash
curl http://localhost:3000/version
```
Expected: `{"message":"Orange Node API","status":"operational",...}`

#### Generate Nonce
```bash
curl http://localhost:3000/orange/generate_nonce
```
Expected: `{"success":true,"nonce":"...","userId":"..."}`

#### Proxy to Algod (Requires API Key)
```bash
# Get node status
curl -H "X-API-Key: test-api-key-12345" http://localhost:3000/v2/status

# Get genesis
curl -H "X-API-Key: test-api-key-12345" http://localhost:3000/genesis

# Get a specific block (block 0 always exists)
curl -H "X-API-Key: test-api-key-12345" http://localhost:3000/v2/blocks/0
```

#### Test Rate Limiting
```bash
# Send many requests quickly
for i in {1..20}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "X-API-Key: test-api-key-12345" \
    http://localhost:3000/v2/status
done
```
Expected: Eventually returns `429` (Too Many Requests)

#### Test Without API Key
```bash
curl http://localhost:3000/v2/status
```
Expected: `401 Unauthorized` or similar auth error

### Step 1.4: Verify Logging

Check the terminal running `orange-node` - you should see request logs for each curl command.

---

## Phase 2: Testing orange-gateway (API Gateway)

`orange-gateway` is the main entry point that routes requests to orange-nodes, handles authentication, and integrates with smart contracts.

### Step 2.1: Configure Environment

```bash
cd apps/orange-gateway
cp .env.example .env
```

Edit `.env` with minimal configuration:

```env
# === MINIMAL CONFIG ===
PORT=4000
HOST=0.0.0.0
NODE_ENV=development
GATEWAY_ID=test-gateway

# JWT Secrets (must be 32+ chars)
JWT_SECRET=test-jwt-secret-must-be-at-least-32-characters-long
JWT_REFRESH_SECRET=test-refresh-secret-must-be-at-least-32-characters

# Algorand (for smart contract bridge)
ALGORAND_NETWORK=localnet
ALGOD_SERVER=http://localhost
ALGOD_PORT=4001
ALGOD_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

# Disable smart contract bridge for initial testing
SMART_CONTRACT_BRIDGE_ENABLED=false

# Logging
LOG_LEVEL=info
```

### Step 2.2: Configure Static Nodes

The gateway needs to know about orange-nodes. Edit `src/nodes.json`:

```json
[
  { "name": "local-node", "url": "http://localhost:3000" }
]
```

This tells the gateway to proxy requests to your local orange-node.

### Step 2.3: Build and Start orange-gateway

```bash
# Build first
npm run build

# Start
npm start

# Or for development with auto-reload:
npx ts-node src/index.ts
```

Expected output:
```
Initializing Smart Contract Bridge...
All services initialized successfully
Orange Gateway started { port: 4000, host: '0.0.0.0' }
```

### Step 2.4: Test Gateway Endpoints

#### Health Check
```bash
curl http://localhost:4000/health
```
Expected: `{"success":true,"status":"healthy",...}`

#### Metrics
```bash
curl http://localhost:4000/metrics
```
Expected: JSON with uptime, logs, etc.

#### Bridge Status
```bash
curl http://localhost:4000/bridge/status
```
Expected: `{"error":"Service Unavailable"}` (bridge disabled) or status if enabled

### Step 2.5: Test Authentication Flow

#### Login (Get JWT Token)
```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"address": "TESTADDRESS123456789012345678901234567890123456789012345678"}'
```
Expected:
```json
{
  "success": true,
  "token": "eyJhbG...",
  "refreshToken": "eyJhbG...",
  "expiresIn": 900
}
```

Save the token for subsequent requests.

#### Refresh Token
```bash
curl -X POST http://localhost:4000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "YOUR_REFRESH_TOKEN_HERE"}'
```

---

## Phase 3: Integration Testing (Gateway → Node → Algod)

With both services running, test the full flow.

### Step 3.1: Ensure Both Services Running

| Service | Port | Status Check |
|---------|------|--------------|
| orange-node | 3000 | `curl http://localhost:3000/health` |
| orange-gateway | 4000 | `curl http://localhost:4000/health` |
| Algod (LocalNet) | 4001 | `curl http://localhost:4001/v2/status` |

### Step 3.2: Test Proxy Chain

Request flows: Client → Gateway (4000) → Node (3000) → Algod (4001)

```bash
# This should proxy through gateway → node → algod
curl http://localhost:4000/v2/status
```

Check logs in both terminals to see the request flow.

### Step 3.3: Test with Authentication

```bash
# Get a token first
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"address": "TESTADDR"}' | jq -r '.token')

# Use token for authenticated request
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/v2/status
```

---

## Phase 4: Smart Contract Bridge Testing

This requires deployed smart contracts on LocalNet or TestNet.

### Step 4.1: Deploy Contracts (if not already deployed)

```bash
cd smart-contracts
algokit project deploy localnet
```

Note the deployed App IDs.

### Step 4.2: Configure Bridge

Update `apps/orange-gateway/.env`:

```env
SMART_CONTRACT_BRIDGE_ENABLED=true
NODE_REGISTRY_APP_ID=<your-node-registry-app-id>
ORANGE_SUBSCRIPTIONS_APP_ID=<your-subscriptions-app-id>
```

### Step 4.3: Test Bridge Endpoints

```bash
# Discover nodes from smart contract
curl http://localhost:4000/bridge/nodes/discover
```

---

## Troubleshooting

### orange-node won't start

| Error | Solution |
|-------|----------|
| `Invalid Algod configuration` | Check `ALGOD_URL` and `ALGOD_TOKEN` |
| `Port 3000 is already in use` | Kill existing process or change `PORT` |
| `Redis connection failed` | Set `REDIS_OPTIONAL=true` or start Redis |

### orange-gateway won't start

| Error | Solution |
|-------|----------|
| `JWT_SECRET must be at least 32 characters` | Use longer secret |
| `Service initialization failed` | Check Algod connection settings |

### Proxy errors

| Error | Solution |
|-------|----------|
| `502 Bad Gateway` | Check that orange-node is running on configured port |
| `503 No nodes available` | Check `nodes.json` configuration |
| `ECONNREFUSED` | Target service not running |

### View detailed logs

```bash
# orange-node with debug logging
LOG_LEVEL=debug npm run dev

# Check for specific errors
npm run dev 2>&1 | grep -i error
```

---

## Quick Reference

### Ports
- **Algod (LocalNet)**: 4001
- **orange-node**: 3000
- **orange-gateway**: 4000
- **Redis**: 6379

### Key Endpoints

| Endpoint | Service | Auth Required |
|----------|---------|---------------|
| `/health` | Both | No |
| `/metrics` | Both | No |
| `/v2/status` | Proxy | API Key (node) |
| `/auth/login` | Gateway | No |
| `/bridge/status` | Gateway | No |

### Test Commands Cheat Sheet

```bash
# Start LocalNet
algokit localnet start

# Start orange-node
cd apps/orange-node && npm run dev

# Start orange-gateway  
cd apps/orange-gateway && npm run build && npm start

# Quick health checks
curl localhost:3000/health  # node
curl localhost:4000/health  # gateway
curl localhost:4001/v2/status  # algod
```
