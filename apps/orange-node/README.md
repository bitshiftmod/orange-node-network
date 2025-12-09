# Orange Node Service

A production-ready Algorand node proxy service with advanced health monitoring, metrics collection, graceful failover, caching, and comprehensive security features.

## 📊 Test Status

| Category | Tests | Status |
|----------|-------|--------|
| Routes | 24 | ✅ Passing |
| Middleware | 18 | ✅ Passing |
| Health | 12 | ✅ Passing |
| Utils | 22 | ✅ Passing |
| **Total** | **76** | ✅ **All Passing** |

## 🚀 Features

### Core Functionality
- **Algorand Node Proxy**: Secure proxy to Algorand algod API
- **Transaction Verification**: Enhanced nonce-based verification system
- **Write Operation Tracking**: Automatic tracking of write operations for point earning

### Performance & Reliability
- **Advanced Health Monitoring**: Comprehensive health checks for all system components
- **Metrics Collection**: Prometheus-compatible metrics for monitoring and alerting
- **Graceful Failover**: Circuit breaker pattern with exponential backoff retry logic
- **Connection Pooling**: Optimized connection management for high throughput
- **Redis Caching**: Intelligent caching for read-only endpoints

### Security
- **Rate Limiting**: Configurable rate limiting per IP or user
- **Request Validation**: Input sanitization and validation against common attacks
- **Audit Logging**: Comprehensive audit trail with security event logging
- **CORS Protection**: Configurable Cross-Origin Resource Sharing
- **Security Headers**: Built-in security headers via Helmet

### Monitoring & Observability
- **Health Endpoints**: `/health`, `/ready`, `/live` for container orchestration
- **Metrics Endpoint**: `/metrics` for Prometheus scraping
- **System Information**: `/system` endpoint for debugging
- **Performance Metrics**: Detailed response time and throughput metrics
- **Error Tracking**: Comprehensive error monitoring and alerting

## 📋 Prerequisites

- Node.js 18 or higher
- Algorand node (algod) running
- Redis server (optional, for caching)
- TypeScript 5.3.3 or higher

## 🛠️ Installation

```bash
# Install dependencies
npm install

# Build the application
npm run build

# Run in development mode
npm run dev
```

## 🧪 Testing

```bash
# Run all tests (76 tests)
npm test

# Run with watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

## ⚙️ Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

### Required Configuration

```env
# Algod Configuration
ALGOD_URL=http://localhost:4160
ALGOD_TOKEN=your-algod-token-here

# Server Configuration
PORT=3000
HOST=0.0.0.0
```

### Optional Configuration

See `.env.example` for all available configuration options.

## 🚀 Getting Started

### 1. Start Algorand Node

Ensure your Algorand node is running and accessible:

```bash
# Check algod status
algod -v
curl http://localhost:4160/v2/status -H "X-Algo-API-Token: your-token"
```

### 2. Start Redis (Optional)

For caching functionality:

```bash
# Using Docker
docker run -d -p 6379:6379 redis:latest

# Or locally
redis-server
```

### 3. Start the Orange Node Service

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## 📊 Monitoring

### Health Endpoints

- **`GET /health`**: Comprehensive health status with all component checks
- **`GET /health/simple`**: Simple health check for load balancers
- **`GET /ready`**: Readiness probe for Kubernetes
- **`GET /live`**: Liveness probe for Kubernetes

### Metrics

- **`GET /metrics`**: Prometheus-compatible metrics
- **`GET /metrics/json`**: Metrics in JSON format

### System Information

- **`GET /system`**: System information and resource usage
- **`GET /config`**: Current configuration (non-sensitive)
- **`GET /audit/logs`**: Audit log entries with pagination

## 🔧 Configuration Options

### Caching

Configure Redis caching for read-only endpoints:

```env
ENABLE_CACHE=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0
REDIS_KEY_PREFIX=orange-node:
```

**Cache TTL Configuration:**
- `/v2/accounts`: 30 seconds
- `/v2/blocks`: 60 seconds
- `/v2/transactions`: 30 seconds
- `/v2/assets`: 10 minutes
- `/v2/applications`: 10 minutes

### Rate Limiting

```env
RATE_LIMIT_WINDOW=60000        # 1 minute window
RATE_LIMIT_MAX=1000           # Max requests per window
RATE_LIMIT_KEY_GENERATOR=ip   # Rate limit by IP
TRUST_PROXY=true              # Trust X-Forwarded-For headers
```

### Circuit Breaker

```env
CIRCUIT_BREAKER_FAILURES=5    # Failure threshold
CIRCUIT_BREAKER_TIMEOUT=60000 # Reset timeout (ms)
EXPECTED_RESPONSE_TIME=5000  # Expected response time (ms)
```

### Security

```env
ORANGE_API_KEY=your-api-key   # API key for authentication
MAX_REQUEST_SIZE=10485760     # Max request size (10MB)
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
REQUEST_VALIDATION=true      # Enable request validation
SANITIZE_INPUT=true          # Enable input sanitization
```

## 📈 Metrics

The service exposes the following Prometheus metrics:

### HTTP Metrics
- `orange_node_http_requests_total`: Total HTTP requests by method, route, and status
- `orange_node_http_request_duration_seconds`: Request duration histogram
- `orange_node_http_request_size_bytes`: Request size histogram
- `orange_node_http_response_size_bytes`: Response size histogram
- `orange_node_http_errors_total`: Total errors by type and endpoint
- `orange_node_error_rate`: Current error rate

### Connection Metrics
- `orange_node_active_connections`: Current active connections
- `orange_node_connection_pool_size`: Connection pool size
- `orange_node_connection_errors_total`: Total connection errors

### Cache Metrics
- `orange_node_cache_hits_total`: Total cache hits
- `orange_node_cache_misses_total`: Total cache misses
- `orange_node_cache_size`: Current cache size

### Algod Metrics
- `orange_node_algod_requests_total`: Total requests to Algod
- `orange_node_algod_request_duration_seconds`: Algod request duration
- `orange_node_algod_errors_total`: Total Algod errors
- `orange_node_algod_last_block`: Last block number from Algod
- `orange_node_algod_connections`: Active Algod connections

### System Metrics
- `orange_node_memory_usage_bytes`: Memory usage by type
- `orange_node_cpu_usage_percent`: CPU usage percentage
- `orange_node_uptime_seconds`: Service uptime

## 🔒 Security Features

### Input Validation
- Request size validation
- SQL injection prevention
- XSS attack prevention
- Directory traversal protection

### Rate Limiting
- Per-IP rate limiting
- Configurable windows and limits
- Automatic blocking of abusive IPs

### Audit Logging
- Request/response logging
- Security event tracking
- Sensitive data redaction
- Configurable log retention

### Security Headers
- Content Security Policy
- HSTS (HTTP Strict Transport Security)
- X-Frame-Options
- X-Content-Type-Options

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- enhanced-proxy.test.ts
```

## 📝 API Endpoints

### Orange API Endpoints

- **`GET /orange`**: Service status
- **`GET /orange/generate_nonce`**: Generate nonce for user verification

### Algorand Proxy Endpoints

All standard Algorand algod endpoints are proxied:

- **`GET /v2/status`**: Node status
- **`GET /v2/blocks/{round}`**: Block information
- **`GET /v2/accounts/{address}`**: Account information
- **`GET /v2/assets/{asset-id}`**: Asset information
- **`POST /v2/transactions`**: Submit transaction
- **`POST /v2/transactions/sign`**: Sign transaction

### Monitoring Endpoints

- **`GET /metrics`**: Prometheus metrics
- **`GET /health`**: Health status
- **`GET /system`**: System information
- **`GET /audit/logs`**: Audit logs

## 🐳 Docker Support

### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist
EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  orange-node:
    build: .
    ports:
      - "3000:3000"
    environment:
      - ALGOD_URL=http://algod:4160
      - ALGOD_TOKEN=${ALGOD_TOKEN}
      - REDIS_HOST=redis
    depends_on:
      - algod
      - redis

  algod:
    image: algorand/algod
    volumes:
      - ./algod-data:/algod/data
    ports:
      - "4160:4160"

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
```

## 🔧 Development

### Project Structure

```
src/
├── cache/           # Redis caching layer
├── health/          # Health monitoring system
├── middleware/      # Express middleware
├── routes/          # API routes
├── tests/           # Test suites
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
├── config.ts        # Configuration management
├── index.ts         # Main application entry point
└── verify.ts        # Transaction verification
```

### Code Style

- TypeScript strict mode enabled
- ESLint for code quality
- Jest for testing
- Comprehensive error handling
- Detailed logging and metrics

## 🚨 Production Considerations

### Resource Requirements

- **Memory**: 512MB minimum, 2GB recommended
- **CPU**: 1 core minimum, 2 cores recommended
- **Network**: Low latency connection to Algorand node
- **Storage**: Minimal, logs are the primary storage requirement

### Scaling

- Use Redis clustering for high availability
- Deploy multiple instances behind a load balancer
- Configure appropriate rate limits based on traffic
- Monitor memory usage and restart containers as needed

### Security

- Use HTTPS in production
- Configure appropriate CORS origins
- Rotate API keys regularly
- Monitor audit logs for suspicious activity
- Keep dependencies updated

## 🐛 Troubleshooting

### Common Issues

1. **Algod Connection Failed**
   - Check ALGOD_URL and ALGOD_TOKEN
   - Verify algod is running and accessible
   - Check network connectivity

2. **Redis Connection Failed**
   - Verify Redis server is running
   - Check REDIS_HOST and REDIS_PORT
   - Set REDIS_OPTIONAL=true if Redis is not required

3. **High Memory Usage**
   - Check cache configuration
   - Monitor request patterns
   - Adjust connection pool size

4. **Rate Limiting Issues**
   - Adjust RATE_LIMIT_MAX and RATE_LIMIT_WINDOW
   - Check for abusive IP addresses
   - Review audit logs

### Health Check Debugging

```bash
# Check overall health
curl http://localhost:3000/health

# Check specific components
curl http://localhost:3000/health | jq '.checks'

# View metrics
curl http://localhost:3000/metrics

# View system information
curl http://localhost:3000/system
```

## 📚 Additional Resources

- [Algorand Developer Documentation](https://developer.algorand.org/)
- [Prometheus Metrics](https://prometheus.io/docs/practices/instrumentation/)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)
- [Node.js Security Best Practices](https://github.com/goldbergyoni/nodebestpractices#-security)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.