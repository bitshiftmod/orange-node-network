import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Logger } from '../utils/Logger';

export interface ValidationResult {
  success: boolean;
  user?: {
    address: string;
    level: number;
    permissions: string[];
  };
  apiKey?: string;
  message?: string;
}

export interface ApiKeyRecord {
  id: string;
  keyHash: string;
  address: string;
  level: number;
  permissions: string[];
  isActive: boolean;
  expiresAt?: number;
  allowedIps: string[];
  allowedOrigins: string[];
  createdAt: number;
}

export class SecurityValidationService {
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly logger: Logger;
  private readonly apiKeys: Map<string, ApiKeyRecord> = new Map();
  private readonly revokedTokens: Set<string> = new Set();

  constructor(logger: Logger) {
    this.logger = logger;

    // Get JWT secrets from environment
    const jwtSecret = process.env.JWT_SECRET;
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long');
    }
    if (!jwtRefreshSecret || jwtRefreshSecret.length < 32) {
      throw new Error('JWT_REFRESH_SECRET must be at least 32 characters long');
    }

    this.jwtSecret = jwtSecret;
    this.jwtRefreshSecret = jwtRefreshSecret;

    // Load API keys from environment
    this.loadApiKeysFromEnvironment();
  }

  /**
   * Load API keys from environment variable
   * Format: [{"key": "api-key-value", "address": "0x...", "level": 2, "permissions": ["read", "write"]}]
   */
  private loadApiKeysFromEnvironment(): void {
    const apiKeysEnv = process.env.API_KEYS;
    if (!apiKeysEnv) {
      this.logger.warn('No API keys configured in environment. API key authentication will be disabled.');
      return;
    }

    try {
      const keys = JSON.parse(apiKeysEnv);
      let loadedCount = 0;

      for (const keyData of keys) {
        if (!keyData.key || !keyData.address) {
          this.logger.warn('Invalid API key configuration', { keyData });
          continue;
        }

        const keyRecord: ApiKeyRecord = {
          id: keyData.id || crypto.randomUUID(),
          keyHash: bcrypt.hashSync(keyData.key, 12),
          address: keyData.address.toLowerCase(),
          level: keyData.level || 1,
          permissions: keyData.permissions || ['read'],
          isActive: keyData.isActive !== false,
          expiresAt: keyData.expiresAt,
          allowedIps: keyData.allowedIps || [],
          allowedOrigins: keyData.allowedOrigins || [],
          createdAt: keyData.createdAt || Date.now(),
        };

        // Store both raw key (for lookup) and hash (for validation)
        this.apiKeys.set(keyData.key, keyRecord);
        loadedCount++;
      }

      this.logger.info(`Loaded ${loadedCount} API keys from environment`);
    } catch (error) {
      this.logger.error('Failed to load API keys from environment', error as Record<string, any>);
      throw new Error('Invalid API keys configuration');
    }
  }

  /**
   * Validate API key against context
   */
  async validateApiKey(apiKey: string, context: {
    ipAddress: string;
    origin?: string;
  }): Promise<ValidationResult> {
    if (!apiKey || apiKey.length < 8) {
      return {
        success: false,
        message: 'Invalid API key format',
      };
    }

    const keyRecord = this.apiKeys.get(apiKey);
    if (!keyRecord) {
      this.logger.warn('API key not found', { keyPrefix: apiKey.substring(0, 8) });
      return {
        success: false,
        message: 'API key not found',
      };
    }

    if (!keyRecord.isActive) {
      return {
        success: false,
        message: 'API key is deactivated',
      };
    }

    // Check expiration
    if (keyRecord.expiresAt && Date.now() > keyRecord.expiresAt) {
      keyRecord.isActive = false;
      return {
        success: false,
        message: 'API key has expired',
      };
    }

    // Validate IP restrictions
    if (keyRecord.allowedIps.length > 0 && !keyRecord.allowedIps.includes(context.ipAddress)) {
      this.logger.warn('API key used from unauthorized IP', {
        keyId: keyRecord.id,
        ipAddress: context.ipAddress,
        allowedIps: keyRecord.allowedIps,
      });
      return {
        success: false,
        message: 'API key not authorized for this IP address',
      };
    }

    // Validate origin restrictions
    if (keyRecord.allowedOrigins.length > 0 && context.origin &&
        !keyRecord.allowedOrigins.includes(context.origin)) {
      this.logger.warn('API key used from unauthorized origin', {
        keyId: keyRecord.id,
        origin: context.origin,
        allowedOrigins: keyRecord.allowedOrigins,
      });
      return {
        success: false,
        message: 'API key not authorized for this origin',
      };
    }

    this.logger.debug('API key validated successfully', {
      keyId: keyRecord.id,
      address: keyRecord.address,
      level: keyRecord.level,
    });

    return {
      success: true,
      user: {
        address: keyRecord.address,
        level: keyRecord.level,
        permissions: keyRecord.permissions,
      },
      apiKey: apiKey,
    };
  }

  /**
   * Validate JWT token
   */
  async validateJwtToken(token: string): Promise<ValidationResult> {
    if (!token || token.length < 10) {
      return {
        success: false,
        message: 'Invalid token format',
      };
    }

    try {
      // Check if token is revoked
      if (this.revokedTokens.has(token)) {
        return {
          success: false,
          message: 'Token has been revoked',
        };
      }

      const decoded = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
        issuer: 'orange-gateway',
        audience: 'orange-clients',
      }) as any;

      // Ensure it's an access token
      if (decoded.type !== 'access') {
        return {
          success: false,
          message: 'Invalid token type',
        };
      }

      this.logger.debug('JWT token validated successfully', {
        address: decoded.address,
        jti: decoded.jti,
        level: decoded.level,
      });

      return {
        success: true,
        user: {
          address: decoded.address,
          level: decoded.level,
          permissions: decoded.permissions,
        },
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return {
          success: false,
          message: 'Token has expired',
        };
      } else if (error instanceof jwt.JsonWebTokenError) {
        return {
          success: false,
          message: 'Invalid token signature',
        };
      } else {
        return {
          success: false,
          message: 'Token validation failed',
        };
      }
    }
  }

  /**
   * Revoke a token
   */
  revokeToken(token: string): void {
    this.revokedTokens.add(token);
    this.logger.info('Token revoked', { tokenPrefix: token.substring(0, 10) });
  }

  /**
   * Create a new API key
   */
  createApiKey(keyData: {
    address: string;
    level: number;
    permissions: string[];
    allowedIps?: string[];
    allowedOrigins?: string[];
    expiresAt?: number;
  }): { apiKey: string; keyRecord: ApiKeyRecord } {
    const apiKey = crypto.randomBytes(32).toString('hex');
    const keyHash = bcrypt.hashSync(apiKey, 12);

    const keyRecord: ApiKeyRecord = {
      id: crypto.randomUUID(),
      keyHash,
      address: keyData.address.toLowerCase(),
      level: keyData.level,
      permissions: keyData.permissions,
      isActive: true,
      expiresAt: keyData.expiresAt,
      allowedIps: keyData.allowedIps || [],
      allowedOrigins: keyData.allowedOrigins || [],
      createdAt: Date.now(),
    };

    this.apiKeys.set(apiKey, keyRecord);

    this.logger.info('Created new API key', {
      keyId: keyRecord.id,
      address: keyRecord.address,
      level: keyRecord.level,
      permissions: keyData.permissions,
    });

    return { apiKey, keyRecord };
  }

  /**
   * Revoke an API key
   */
  revokeApiKey(apiKey: string): boolean {
    const keyRecord = this.apiKeys.get(apiKey);
    if (!keyRecord) {
      return false;
    }

    keyRecord.isActive = false;
    this.apiKeys.set(apiKey, keyRecord);

    this.logger.info('API key revoked', {
      keyId: keyRecord.id,
      address: keyRecord.address,
    });

    return true;
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics(): {
    totalApiKeys: number;
    activeApiKeys: number;
    revokedTokens: number;
  } {
    const activeApiKeys = Array.from(this.apiKeys.values())
      .filter(key => key.isActive && (!key.expiresAt || key.expiresAt > Date.now()))
      .length;

    return {
      totalApiKeys: this.apiKeys.size,
      activeApiKeys,
      revokedTokens: this.revokedTokens.size,
    };
  }

  /**
   * Clean up expired tokens and API keys
   */
  cleanup(): { cleanedApiKeys: number; cleanedTokens: number } {
    const now = Date.now();
    let cleanedApiKeys = 0;
    let cleanedTokens = 0;

    // Clean up expired API keys
    for (const [apiKey, keyRecord] of this.apiKeys.entries()) {
      if (keyRecord.expiresAt && now > keyRecord.expiresAt) {
        keyRecord.isActive = false;
        this.apiKeys.set(apiKey, keyRecord);
        cleanedApiKeys++;
      }
    }

    // Clean up old revoked tokens (older than 24 hours)
    const cutoff = now - (24 * 60 * 60 * 1000);
    for (const token of this.revokedTokens) {
      try {
        const decoded = jwt.decode(token) as any;
        if (decoded && decoded.exp * 1000 < cutoff) {
          this.revokedTokens.delete(token);
          cleanedTokens++;
        }
      } catch (error) {
        // Remove invalid tokens
        this.revokedTokens.delete(token);
        cleanedTokens++;
      }
    }

    if (cleanedApiKeys > 0 || cleanedTokens > 0) {
      this.logger.info('Security cleanup completed', {
        cleanedApiKeys,
        cleanedTokens,
      });
    }

    return { cleanedApiKeys, cleanedTokens };
  }
}