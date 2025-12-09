import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createSecurityMiddleware } from "./middleware/security";
import { Logger } from "./utils/Logger";
import { getConfig } from "./config";
import servers from "./nodes.json";
import { AuthenticationService } from "./services/AuthenticationService";
import { createServer } from "http";

// Smart Contract Bridge imports
import { SmartContractBridge } from "./services/SmartContractBridge";
import { getSmartContractBridgeConfig } from "./config/SmartContractBridge";

// Validate required environment variables
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}
if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
  throw new Error("JWT_REFRESH_SECRET must be at least 32 characters long");
}

// Initialize configuration and services
const config = getConfig();
const logger = new Logger();

// Default security configuration
const securityConfig = {
  enableCORS: true,
  allowedOrigins: ['*'],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  enableRateLimit: true,
  rateLimit: {
    windowMs: 60000, // 1 minute
    maxRequests: 100,
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  },
  enableAuthentication: false, // Disabled by default, enable when needed
  authenticationMethods: ['jwt' as const]
};

const authService = new AuthenticationService({
  jwtSecret: process.env.JWT_SECRET!,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET!
}, logger);

const app = express();

// Initialize Smart Contract Bridge services
let smartContractBridge: SmartContractBridge | null = null;

const securityMiddleware = createSecurityMiddleware(securityConfig, logger);

// Apply security middleware to all requests
app.use(securityMiddleware.cors.bind(securityMiddleware));
app.use(securityMiddleware.securityHeaders.bind(securityMiddleware));
app.use(securityMiddleware.requestLogger.bind(securityMiddleware));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* CORE ENDPOINTS */

// Health endpoint
app.get("/health", (req, res) => {
  try {
    res.status(200).json({
      success: true,
      status: "healthy",
      uptime: process.uptime(),
      timestamp: Date.now(),
      version: process.env.npm_package_version || '1.0.0',
      services: {
        smartContractBridge: smartContractBridge !== null
      }
    });
  } catch (error) {
    logger.error("Health check failed", {}, error as Error);
    res.status(500).json({
      success: false,
      error: "Health check failed"
    });
  }
});

// Metrics endpoint
app.get("/metrics", (req, res) => {
  try {
    const stats = logger.getStats();
    // Load balancer metrics not available in minimal build
    
    res.status(200).json({
      success: true,
      uptime: process.uptime(),
      logs: stats,
      bridge: smartContractBridge?.getMetrics(),
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error("Metrics fetch failed", {}, error as Error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch metrics"
    });
  }
});

// Bridge status endpoint
app.get("/bridge/status", (req, res) => {
  try {
    if (!smartContractBridge) {
      return res.status(503).json({
        error: "Service Unavailable",
        message: "Smart contract bridge not initialized"
      });
    }

    res.status(200).json({
      success: true,
      status: "active",
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error("Bridge status check failed", {}, error as Error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Status check failed"
    });
  }
});

// Node discovery endpoint
app.get("/bridge/nodes/discover", async (req, res) => {
  try {
    if (!smartContractBridge) {
      return res.status(503).json({
        error: "Service Unavailable",
        message: "Smart contract bridge not initialized"
      });
    }

    const result = await smartContractBridge.discoverOptimalNodes({
      limit: 50,
      useCache: true
    });
    
    res.status(200).json({
      success: true,
      nodes: result.nodes,
      count: result.nodes.length,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error("Node discovery failed", {}, error as Error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Node discovery failed"
    });
  }
});

// Authentication login endpoint
app.post("/auth/login", async (req, res) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Address is required"
      });
    }

    // For now, create/get user and generate tokens directly
    // In production, this would verify a signature
    let user = await authService.getUser(address);
    
    if (!user) {
      user = await authService.createUser({
        address,
        level: 1,
        permissions: ['api:read', 'api:write']
      });
    }

    const tokens = await authService.generateTokens(user, {
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'Unknown'
    });

    res.status(200).json({
      success: true,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 900 // 15 minutes
    });
  } catch (error) {
    logger.error("Authentication failed", {}, error as Error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Authentication failed"
    });
  }
});

// Authentication refresh endpoint
app.post("/auth/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Refresh token is required"
      });
    }

    const result = await authService.refreshTokens(refreshToken);

    if (!result) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid refresh token"
      });
    }

    res.status(200).json({
      success: true,
      token: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: 900 // 15 minutes
    });
  } catch (error) {
    logger.error("Token refresh failed", {}, error as Error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Token refresh failed"
    });
  }
});

/* PROXY ROUTES */
app.use("/", async (req, res, next) => {
  try {
    // Select node for proxying
    let selectedNode = null;
    
    if (smartContractBridge) {
      // Try smart contract discovery first
      const result = await smartContractBridge.discoverOptimalNodes({
        limit: 10,
        useCache: true
      });
      
      if (result.nodes.length > 0) {
        selectedNode = result.nodes[0]; // Use first optimal node
      }
    }
    
    // Fallback to static nodes if no smart contract selection
    if (!selectedNode && servers.length > 0) {
      selectedNode = servers[0];
    }

    if (!selectedNode) {
      return res.status(503).json({
        error: "Service Unavailable",
        message: "No nodes available"
      });
    }

    // Build target URL - handle both NodeInfo and basic node structure
    const targetUrl = ('fqdn' in selectedNode && 'port' in selectedNode && selectedNode.fqdn && selectedNode.port)
      ? `http://${selectedNode.fqdn}:${selectedNode.port}`
      : ('url' in selectedNode && selectedNode.url)
        ? selectedNode.url
        : `http://localhost:8080`;

    // Create proxy middleware for selected node
    const proxy = createProxyMiddleware({
      target: targetUrl,
      changeOrigin: true,
      onProxyReq: (proxyReq) => {
        logger.info(`Proxying request`, {
          method: req.method,
          path: req.path,
          target: targetUrl
        });
      },
      onProxyRes: (proxyRes) => {
        logger.info(`Proxy response received`, {
          statusCode: proxyRes.statusCode || 200
        });
      },
      onError: (err) => {
        logger.error("Proxy error", { error: (err as Error).message }, err as Error);
        (res as express.Response).status(502).json({
          error: "Bad Gateway",
          message: "Failed to proxy request"
        });
      }
    });

    proxy(req, res, next);
  } catch (error) {
    logger.error("Request routing failed", {}, error as Error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Request routing failed"
    });
  }
});

/* SERVER STARTUP */
async function initializeServices() {
  try {
    logger.info("Initializing Smart Contract Bridge...");
    
    const bridgeConfig = getSmartContractBridgeConfig();
    smartContractBridge = new SmartContractBridge(bridgeConfig, logger);
    await smartContractBridge.initialize();

    // Smart Contract Load Balancer excluded from minimal build

    logger.info("All services initialized successfully");
  } catch (error) {
    logger.error("Service initialization failed", {}, error as Error);
    throw error;
  }
}

async function start() {
  try {
    await initializeServices();

    const httpServer = createServer(app);
    const PORT = config.port || 3000;
    const HOST = config.host || '0.0.0.0';

    httpServer.listen(PORT, HOST, () => {
      logger.info(`Orange Gateway started`, {
        port: PORT,
        host: HOST,
        env: process.env.NODE_ENV || 'development'
      });
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);
      
      httpServer.close(async () => {
        logger.info("HTTP server closed");

        // Services don't have explicit cleanup methods yet
        logger.info("Shutdown complete");
        process.exit(0);
      });

      // Force exit after 30 seconds
      setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error("Failed to start server", {}, error as Error);
    process.exit(1);
  }
}

// Start the server
start();

export { app, smartContractBridge };
