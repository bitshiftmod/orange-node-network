import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import argon2 from 'argon2';
import crypto from 'crypto';
import { Logger } from '../utils/Logger';

export interface User {
  id: string;
  address: string;
  email?: string;
  level: number;
  permissions: string[];
  isActive: boolean;
  isMfaEnabled: boolean;
  mfaSecret?: string;
  createdAt: number;
  lastLoginAt?: number;
  loginAttempts: number;
  lockedUntil?: number;
  reputation: number;
  stake: number;
}

export interface ApiKey {
  id: string;
  userId: string;
  keyHash: string;
  name: string;
  permissions: string[];
  rateLimitTier: 'basic' | 'premium' | 'enterprise';
  isActive: boolean;
  expiresAt?: number;
  lastUsedAt?: number;
  usageCount: number;
  allowedIps: string[];
  allowedOrigins: string[];
  createdAt: number;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  level: number;
  permissions: string[];
  isSystem: boolean;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  deviceInfo: string;
  ipAddress: string;
  userAgent: string;
  createdAt: number;
  expiresAt: number;
  lastAccessAt: number;
  isActive: boolean;
}

export interface AuthToken {
  userId: string;
  address: string;
  level: number;
  permissions: string[];
  sessionId: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

export class AuthenticationService {
  private jwtSecret: string;
  private jwtRefreshSecret: string;
  private tokenExpiry: { access: string; refresh: string };
  private maxLoginAttempts: number;
  private lockoutDuration: number;
  private logger: Logger;

  // In-memory storage (replace with database in production)
  private users = new Map<string, User>();
  private apiKeys = new Map<string, ApiKey>();
  private roles = new Map<string, Role>();
  private sessions = new Map<string, Session>();
  private revokedTokens = new Set<string>();

  constructor(config: {
    jwtSecret: string;
    jwtRefreshSecret: string;
    tokenExpiry?: { access: string; refresh: string };
    maxLoginAttempts?: number;
    lockoutDuration?: number;
  }, logger: Logger) {
    this.jwtSecret = config.jwtSecret;
    this.jwtRefreshSecret = config.jwtRefreshSecret;
    this.tokenExpiry = config.tokenExpiry || { access: '15m', refresh: '7d' };
    this.maxLoginAttempts = config.maxLoginAttempts || 5;
    this.lockoutDuration = config.lockoutDuration || 15 * 60 * 1000; // 15 minutes
    this.logger = logger;

    this.initializeSystemRoles();
  }

  /**
   * User Management
   */
  async createUser(userData: {
    address: string;
    email?: string;
    level: number;
    permissions: string[];
  }): Promise<User> {
    const user: User = {
      id: crypto.randomUUID(),
      address: userData.address.toLowerCase(),
      email: userData.email,
      level: userData.level,
      permissions: userData.permissions,
      isActive: true,
      isMfaEnabled: false,
      createdAt: Date.now(),
      loginAttempts: 0,
      reputation: 100,
      stake: 0
    };

    this.users.set(user.address, user);
    this.logger.info('User created', { userId: user.id, address: user.address });

    return user;
  }

  async getUser(address: string): Promise<User | null> {
    const user = this.users.get(address.toLowerCase());
    if (!user || !user.isActive) {
      return null;
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > Date.now()) {
      return null;
    }

    return user;
  }

  async getUserById(userId: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.id === userId) {
        if (!user.isActive) {
          return null;
        }
        // Check if account is locked
        if (user.lockedUntil && user.lockedUntil > Date.now()) {
          return null;
        }
        return user;
      }
    }
    return null;
  }

  async updateUserLevel(address: string, newLevel: number): Promise<boolean> {
    const user = await this.getUser(address);
    if (!user) {
      return false;
    }

    user.level = newLevel;
    this.users.set(address.toLowerCase(), user);

    this.logger.info('User level updated', { address, newLevel });
    return true;
  }

  async updateUserPermissions(address: string, permissions: string[]): Promise<boolean> {
    const user = await this.getUser(address);
    if (!user) {
      return false;
    }

    user.permissions = permissions;
    this.users.set(address.toLowerCase(), user);

    this.logger.info('User permissions updated', { address, permissions });
    return true;
  }

  /**
   * API Key Management
   */
  async createApiKey(userId: string, keyData: {
    name: string;
    permissions: string[];
    rateLimitTier: 'basic' | 'premium' | 'enterprise';
    allowedIps?: string[];
    allowedOrigins?: string[];
    expiresAt?: number;
  }): Promise<{ apiKey: string; keyRecord: ApiKey }> {
    const apiKey = crypto.randomBytes(32).toString('hex');
    const keyHash = await bcrypt.hash(apiKey, 12);

    const keyRecord: ApiKey = {
      id: crypto.randomUUID(),
      userId,
      keyHash,
      name: keyData.name,
      permissions: keyData.permissions,
      rateLimitTier: keyData.rateLimitTier,
      isActive: true,
      expiresAt: keyData.expiresAt,
      usageCount: 0,
      allowedIps: keyData.allowedIps || [],
      allowedOrigins: keyData.allowedOrigins || [],
      createdAt: Date.now()
    };

    this.apiKeys.set(apiKey, keyRecord);

    this.logger.info('API key created', {
      keyId: keyRecord.id,
      userId,
      permissions: keyData.permissions
    });

    return { apiKey, keyRecord };
  }

  async validateApiKey(apiKey: string, context: {
    ipAddress: string;
    origin?: string;
  }): Promise<{ user: User; key: ApiKey } | null> {
    const key = this.apiKeys.get(apiKey);
    if (!key || !key.isActive) {
      return null;
    }

    // Check expiration
    if (key.expiresAt && key.expiresAt < Date.now()) {
      return null;
    }

    // Validate IP restrictions
    if (key.allowedIps.length > 0 && !key.allowedIps.includes(context.ipAddress)) {
      this.logger.warn('API key used from unauthorized IP', {
        keyId: key.id,
        ipAddress: context.ipAddress
      });
      return null;
    }

    // Validate origin restrictions
    if (key.allowedOrigins.length > 0 && context.origin &&
        !key.allowedOrigins.includes(context.origin)) {
      this.logger.warn('API key used from unauthorized origin', {
        keyId: key.id,
        origin: context.origin
      });
      return null;
    }

    // Verify key hash
    const isValidKey = await bcrypt.compare(apiKey, key.keyHash);
    if (!isValidKey) {
      return null;
    }

    const user = await this.getUserById(key.userId);
    if (!user) {
      return null;
    }

    // Update usage statistics
    key.lastUsedAt = Date.now();
    key.usageCount++;
    this.apiKeys.set(apiKey, key);

    return { user, key };
  }

  async revokeApiKey(apiKeyId: string): Promise<boolean> {
    for (const [key, record] of this.apiKeys.entries()) {
      if (record.id === apiKeyId) {
        record.isActive = false;
        this.apiKeys.set(key, record);

        this.logger.info('API key revoked', { keyId: apiKeyId });
        return true;
      }
    }
    return false;
  }

  /**
   * JWT Token Management
   */
  async generateTokens(user: User, sessionContext: {
    ipAddress: string;
    userAgent: string;
    deviceInfo?: string;
  }): Promise<{ accessToken: string; refreshToken: string; session: Session }> {
    const sessionId = crypto.randomUUID();
    const now = Date.now();

    // Create session record
    const session: Session = {
      id: sessionId,
      userId: user.id,
      token: '',
      refreshToken: '',
      deviceInfo: sessionContext.deviceInfo || 'Unknown',
      ipAddress: sessionContext.ipAddress,
      userAgent: sessionContext.userAgent,
      createdAt: now,
      expiresAt: now + (7 * 24 * 60 * 60 * 1000), // 7 days
      lastAccessAt: now,
      isActive: true
    };

    // Access token payload
    const accessPayload: AuthToken = {
      userId: user.id,
      address: user.address,
      level: user.level,
      permissions: user.permissions,
      sessionId,
      type: 'access',
      iat: Math.floor(now / 1000),
      exp: Math.floor((now + (15 * 60 * 1000)) / 1000) // 15 minutes
    };

    // Refresh token payload
    const refreshPayload: AuthToken = {
      userId: user.id,
      address: user.address,
      level: user.level,
      permissions: user.permissions,
      sessionId,
      type: 'refresh',
      iat: Math.floor(now / 1000),
      exp: Math.floor((now + (7 * 24 * 60 * 60 * 1000)) / 1000) // 7 days
    };

    const accessToken = jwt.sign(accessPayload, this.jwtSecret);
    const refreshToken = jwt.sign(refreshPayload, this.jwtRefreshSecret);

    session.token = accessToken;
    session.refreshToken = refreshToken;
    this.sessions.set(sessionId, session);

    // Update user last login
    user.lastLoginAt = now;
    user.loginAttempts = 0;
    this.users.set(user.address, user);

    this.logger.info('Tokens generated', {
      userId: user.id,
      sessionId,
      ipAddress: sessionContext.ipAddress
    });

    return { accessToken, refreshToken, session };
  }

  async validateToken(token: string, tokenType: 'access' | 'refresh' = 'access'): Promise<AuthToken | null> {
    try {
      // Check if token is revoked
      if (this.revokedTokens.has(token)) {
        return null;
      }

      const secret = tokenType === 'access' ? this.jwtSecret : this.jwtRefreshSecret;
      const decoded = jwt.verify(token, secret) as AuthToken;

      // Validate token type matches
      if (decoded.type !== tokenType) {
        return null;
      }

      // Check if session is still active
      const session = this.sessions.get(decoded.sessionId);
      if (!session || !session.isActive || session.expiresAt < Date.now()) {
        return null;
      }

      // Update session last access
      session.lastAccessAt = Date.now();
      this.sessions.set(decoded.sessionId, session);

      return decoded;
    } catch (error) {
      this.logger.warn('Token validation failed', { error: (error as Error).message });
      return null;
    }
  }

  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
    const decoded = await this.validateToken(refreshToken, 'refresh');
    if (!decoded) {
      return null;
    }

    const user = await this.getUser(decoded.address);
    if (!user) {
      return null;
    }

    // Revoke old refresh token
    await this.revokeToken(refreshToken);

    // Generate new tokens
    const session = this.sessions.get(decoded.sessionId);
    if (!session) {
      return null;
    }

    const tokens = await this.generateTokens(user, {
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      deviceInfo: session.deviceInfo
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    };
  }

  async revokeToken(token: string): Promise<boolean> {
    try {
      const decoded = jwt.decode(token) as any;
      if (decoded && decoded.sessionId) {
        const session = this.sessions.get(decoded.sessionId);
        if (session) {
          session.isActive = false;
          this.sessions.set(decoded.sessionId, session);
        }
      }

      this.revokedTokens.add(token);
      return true;
    } catch (error) {
      return false;
    }
  }

  async revokeAllUserSessions(userId: string): Promise<number> {
    let revokedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId && session.isActive) {
        session.isActive = false;
        this.sessions.set(sessionId, session);

        this.revokedTokens.add(session.token);
        this.revokedTokens.add(session.refreshToken);
        revokedCount++;
      }
    }

    this.logger.info('All user sessions revoked', { userId, revokedCount });
    return revokedCount;
  }

  /**
   * Multi-Factor Authentication
   */
  async enableMfa(userId: string): Promise<{ secret: string; backupCodes: string[] }> {
    const secret = crypto.randomBytes(20).toString('hex'); // Changed from 'base32' to 'hex'
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    // Hash backup codes
    const hashedBackupCodes = await Promise.all(
      backupCodes.map(code => bcrypt.hash(code, 12))
    );

    // Store in user record (in production, store separately)
    const user = Array.from(this.users.values()).find(u => u.id === userId);
    if (user) {
      user.isMfaEnabled = true;
      user.mfaSecret = secret;
      // Note: Store backup codes securely in production
    }

    this.logger.info('MFA enabled', { userId });
    return { secret, backupCodes };
  }

  async verifyMfa(userId: string, token: string): Promise<boolean> {
    // Simplified TOTP verification - implement proper TOTP in production
    const user = Array.from(this.users.values()).find(u => u.id === userId);
    if (!user || !user.mfaSecret) {
      return false;
    }

    // This is a simplified version - use a proper TOTP library
    return token.length === 6 && /^\d+$/.test(token);
  }

  /**
   * Role-Based Access Control
   */
  private initializeSystemRoles(): void {
    const systemRoles: Role[] = [
      {
        id: 'admin',
        name: 'Administrator',
        description: 'Full system access',
        level: 100,
        permissions: ['*'],
        isSystem: true
      },
      {
        id: 'gateway-operator',
        name: 'Gateway Operator',
        description: 'Gateway management access',
        level: 80,
        permissions: [
          'gateway:read',
          'gateway:write',
          'gateway:manage',
          'nodes:read',
          'health:read'
        ],
        isSystem: true
      },
      {
        id: 'node-operator',
        name: 'Node Operator',
        description: 'Node operation access',
        level: 60,
        permissions: [
          'node:read',
          'node:write',
          'node:health',
          'consensus:read'
        ],
        isSystem: true
      },
      {
        id: 'user',
        name: 'User',
        description: 'Basic user access',
        level: 20,
        permissions: [
          'api:read',
          'api:write'
        ],
        isSystem: true
      },
      {
        id: 'readonly',
        name: 'Read Only',
        description: 'Read-only access',
        level: 10,
        permissions: [
          'api:read'
        ],
        isSystem: true
      }
    ];

    systemRoles.forEach(role => {
      this.roles.set(role.id, role);
    });
  }

  async assignRole(userId: string, roleId: string): Promise<boolean> {
    const user = Array.from(this.users.values()).find(u => u.id === userId);
    const role = this.roles.get(roleId);

    if (!user || !role) {
      return false;
    }

    user.level = role.level;
    user.permissions = role.permissions;

    this.logger.info('Role assigned', { userId, roleId, role: role.name });
    return true;
  }

  hasPermission(user: User, permission: string): boolean {
    // Wildcard permission
    if (user.permissions.includes('*')) {
      return true;
    }

    // Exact match
    if (user.permissions.includes(permission)) {
      return true;
    }

    // Wildcard sub-permissions (e.g., 'gateway:*' matches 'gateway:read')
    const [category] = permission.split(':');
    const wildcardPermission = `${category}:*`;

    return user.permissions.includes(wildcardPermission);
  }

  /**
   * Account Security
   */
  async recordFailedLogin(address: string): Promise<void> {
    const user = this.users.get(address.toLowerCase());
    if (!user) {
      return;
    }

    user.loginAttempts++;

    // Lock account if max attempts reached
    if (user.loginAttempts >= this.maxLoginAttempts) {
      user.lockedUntil = Date.now() + this.lockoutDuration;

      this.logger.warn('Account locked due to failed attempts', {
        address,
        attempts: user.loginAttempts
      });
    }

    this.users.set(address.toLowerCase(), user);
  }

  async isAccountLocked(address: string): Promise<boolean> {
    const user = this.users.get(address.toLowerCase());
    if (!user) {
      return false;
    }

    return user.lockedUntil ? user.lockedUntil > Date.now() : false;
  }

  /**
   * Cleanup and Maintenance
   */
  async cleanupExpiredSessions(): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        session.isActive = false;
        this.sessions.set(sessionId, session);
        cleanedCount++;

        // Add tokens to revoked list
        this.revokedTokens.add(session.token);
        this.revokedTokens.add(session.refreshToken);
      }
    }

    this.logger.info('Expired sessions cleaned up', { cleanedCount });
    return cleanedCount;
  }

  async cleanupRevokedTokens(): Promise<number> {
    // Remove tokens older than 24 hours from revoked list
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    let removedCount = 0;

    for (const token of this.revokedTokens) {
      try {
        const decoded = jwt.decode(token) as any;
        if (decoded && decoded.exp * 1000 < cutoff) {
          this.revokedTokens.delete(token);
          removedCount++;
        }
      } catch (error) {
        // Remove invalid tokens
        this.revokedTokens.delete(token);
        removedCount++;
      }
    }

    return removedCount;
  }

  /**
   * Statistics and Monitoring
   */
  getAuthenticationStats(): {
    totalUsers: number;
    activeUsers: number;
    totalApiKeys: number;
    activeApiKeys: number;
    activeSessions: number;
    lockedAccounts: number;
  } {
    const now = Date.now();
    const activeUsers = Array.from(this.users.values()).filter(
      user => user.isActive && (!user.lockedUntil || user.lockedUntil < now)
    ).length;

    const activeApiKeys = Array.from(this.apiKeys.values()).filter(
      key => key.isActive && (!key.expiresAt || key.expiresAt > now)
    ).length;

    const activeSessions = Array.from(this.sessions.values()).filter(
      session => session.isActive && session.expiresAt > now
    ).length;

    const lockedAccounts = Array.from(this.users.values()).filter(
      user => user.lockedUntil && user.lockedUntil > now
    ).length;

    return {
      totalUsers: this.users.size,
      activeUsers,
      totalApiKeys: this.apiKeys.size,
      activeApiKeys,
      activeSessions,
      lockedAccounts
    };
  }
}