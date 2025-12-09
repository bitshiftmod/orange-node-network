# Orange Gateway - Future Enhancements Roadmap

## Overview

This document tracks features that have been intentionally deferred to focus on core gateway functionality. These can be added incrementally as the system matures and requirements evolve.

---

## Phase 1: Advanced Observability

### Prometheus + Grafana Integration

**Status**: Deferred  
**Priority**: High  
**Estimated Effort**: 1-2 weeks

**Features**:
- Prometheus metrics endpoint (`/metrics/prometheus`)
- Time-series metrics collection
- Historical data retention (30-90 days)
- Grafana dashboards for visualization
- Alert rules for automated notifications

**Use Cases**:
- Track request rates, latency, error rates over time
- Identify performance trends and degradation
- Capacity planning and scaling decisions
- SLA monitoring (99.9% uptime tracking)
- Multi-gateway metrics aggregation

**Implementation Notes**:
```typescript
// Add prom-client dependency
npm install prom-client

// Instrument key metrics:
- http_requests_total (counter)
- http_request_duration_seconds (histogram)
- gateway_nodes_available (gauge)
- smart_contract_queries_total (counter)
- authentication_failures_total (counter)
```

**Dependencies**:
- Prometheus server deployment
- Grafana instance for visualization
- Alert manager for notifications

---

## Phase 2: GraphQL API Layer

**Status**: Deferred  
**Priority**: Medium  
**Estimated Effort**: 2-3 weeks

**Features**:
- GraphQL endpoint for flexible queries
- DataLoader pattern for batching/caching
- GraphQL subscriptions for real-time updates
- Rate limiting and complexity analysis
- Federation support for distributed queries

**Use Cases**:
- Complex blockchain data queries
- Flexible client-driven data fetching
- Reduce over-fetching/under-fetching
- Real-time data subscriptions
- API composition from multiple sources

**Implementation Notes**:
```graphql
# Example schema
type Query {
  nodes(status: NodeStatus): [Node!]!
  node(address: String!): Node
  transactions(filter: TxFilter): [Transaction!]!
}

type Subscription {
  transactionStatus(id: String!): TransactionUpdate!
  nodeHealth: NodeHealthUpdate!
}
```

**Dependencies**:
- Apollo Server v4
- GraphQL schema design
- Resolver implementations
- Subscription infrastructure

---

## Phase 3: WebSocket Real-Time Updates

**Status**: Deferred  
**Priority**: Medium  
**Estimated Effort**: 1-2 weeks

**Features**:
- WebSocket server for bidirectional communication
- Real-time transaction status updates
- Live node health monitoring
- Event-driven notifications
- Connection management and heartbeats

**Use Cases**:
- Push transaction confirmations to clients
- Real-time node status updates
- Live system health monitoring
- Event broadcasting (network alerts)

**Implementation Notes**:
```typescript
// WebSocket channels:
- transaction:{txId} - Transaction status updates
- node-health - Node availability changes
- system-events - Network-wide notifications

// Features:
- JWT authentication for WebSocket connections
- Subscription management
- Rate limiting per connection
- Automatic reconnection handling
```

**Dependencies**:
- ws package
- Authentication integration
- Event emitter infrastructure

---

## Phase 4: P2P Networking (Optional)

**Status**: Deferred  
**Priority**: Low  
**Estimated Effort**: 3-4 weeks

**Features**:
- Peer-to-peer node discovery
- DHT-based service registry
- Gossip protocol for network updates
- NAT traversal
- P2P load balancing

**Use Cases**:
- Decentralized node discovery (beyond smart contracts)
- Redundant service discovery mechanism
- Mesh networking for gateways
- Off-chain coordination

**Implementation Notes**:
- Requires libp2p v1.x+ (modern API)
- Complex networking configuration
- May not be necessary given on-chain registry

**Decision Point**: Evaluate whether on-chain registry is sufficient before implementing

---

## Current Architecture (Minimal Gateway)

```
┌──────────────────────────────────────────┐
│         Orange Gateway (v1.0)            │
├──────────────────────────────────────────┤
│                                          │
│  Core Features:                          │
│  ✅ Smart Contract Node Registry        │
│  ✅ JWT Authentication                   │
│  ✅ HTTP Proxy to Nodes                  │
│  ✅ Load Balancing                       │
│  ✅ Basic Logging (Logger)               │
│  ✅ Health Endpoints                     │
│  ✅ Metrics Endpoints (JSON)             │
│                                          │
│  Deferred Features:                      │
│  ⏸️  Prometheus/Grafana                  │
│  ⏸️  GraphQL API                         │
│  ⏸️  WebSocket Updates                   │
│  ⏸️  P2P Networking                      │
│                                          │
└──────────────────────────────────────────┘
```

---

## Migration Path

### Adding Prometheus (When Ready)

1. **Install dependencies**:
   ```bash
   npm install prom-client
   ```

2. **Add metrics endpoint**:
   ```typescript
   import promClient from 'prom-client';
   
   const register = new promClient.Registry();
   // Register metrics...
   
   app.get('/metrics/prometheus', async (req, res) => {
     res.set('Content-Type', register.contentType);
     res.end(await register.metrics());
   });
   ```

3. **Deploy Prometheus server** with scrape config:
   ```yaml
   scrape_configs:
     - job_name: 'orange-gateway'
       static_configs:
         - targets: ['gateway:3000']
   ```

4. **Configure Grafana** dashboards

### Adding GraphQL (When Ready)

1. Restore GraphQL server files
2. Update dependencies
3. Define schema
4. Implement resolvers
5. Mount at `/graphql`

### Adding WebSocket (When Ready)

1. Restore WebSocket service files
2. Integrate with HTTP server
3. Implement subscription channels
4. Add authentication

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-11-25 | Defer Prometheus/Grafana | Focus on core functionality; can add later when scale requires |
| 2025-11-25 | Defer GraphQL | REST API sufficient for initial use cases |
| 2025-11-25 | Defer WebSocket | Polling acceptable initially; add when real-time critical |
| 2025-11-25 | Defer P2P | On-chain registry provides node discovery; P2P may be unnecessary |

---

## Success Criteria for Each Phase

### Phase 1 (Prometheus) - Ready When:
- [ ] Multiple gateways deployed
- [ ] Need historical trend analysis
- [ ] Automated alerting required
- [ ] SLA monitoring needed

### Phase 2 (GraphQL) - Ready When:
- [ ] Client applications need flexible queries
- [ ] Over-fetching becomes a performance issue
- [ ] Real-time subscriptions required

### Phase 3 (WebSocket) - Ready When:
- [ ] Real-time updates are critical UX requirement
- [ ] Polling creates too much overhead

### Phase 4 (P2P) - Ready When:
- [ ] On-chain registry proves insufficient
- [ ] Fully decentralized discovery needed
- [ ] Mesh networking required

---

## Maintenance Notes

This roadmap should be reviewed quarterly and updated based on:
- User feedback and feature requests
- System scale and performance requirements
- Operational complexity vs. value tradeoffs
- Technology ecosystem changes
