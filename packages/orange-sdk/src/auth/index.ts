import { AuthConfig, AuthMethod } from '../types';
import { InvalidTokenError, ExpiredTokenError, ValidationError } from '../errors';

/**
 * JWT Token information
 */
export interface TokenInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  tokenType: 'Bearer';
}

/**
 * JWT payload structure
 */
export interface JWTPayload {
  address: string;
  level: number;
  permissions: string[];
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
  jti?: string;
}

/**
 * Authentication manager for handling different auth methods
 */
export class AuthManager {
  private config: AuthConfig;
  private tokenRefreshCallbacks: Array<(tokens: TokenInfo) => void> = [];

  constructor(config: AuthConfig) {
    this.validateConfig(config);
    this.config = { ...config };
  }

  private validateConfig(config: AuthConfig): void {
    if (!config.method) {
      throw new ValidationError('Authentication method is required');
    }

    switch (config.method) {
      case 'api-key':
        if (!config.apiKey) {
          throw new ValidationError('API key is required for API key authentication');
        }
        break;
      case 'jwt':
        if (!config.jwt?.token) {
          throw new ValidationError('JWT token is required for JWT authentication');
        }
        break;
      case 'oauth':
        if (!config.oauth?.token) {
          throw new ValidationError('OAuth token is required for OAuth authentication');
        }
        break;
    }
  }

  /**
   * Get authentication headers for requests
   */
  public getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    switch (this.config.method) {
      case 'api-key':
        headers['X-API-Key'] = this.config.apiKey!;
        break;
      case 'jwt':
        headers['Authorization'] = `Bearer ${this.config.jwt!.token}`;
        break;
      case 'oauth':
        headers['Authorization'] = `${this.config.oauth!.tokenType} ${this.config.oauth!.token}`;
        break;
    }

    return headers;
  }

  /**
   * Check if current authentication is valid
   */
  public isValid(): boolean {
    try {
      switch (this.config.method) {
        case 'api-key':
          return !!this.config.apiKey;
        case 'jwt':
          return this.isJWTValid(this.config.jwt!.token);
        case 'oauth':
          return this.isOAuthValid(this.config.oauth!);
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  private isJWTValid(token: string): boolean {
    try {
      const payload = this.decodeJWT(token);
      const now = Math.floor(Date.now() / 1000);
      return payload.exp > now;
    } catch {
      return false;
    }
  }

  private isOAuthValid(oauth: NonNullable<AuthConfig['oauth']>): boolean {
    if (!oauth.token) return false;
    if (oauth.expiresAt) {
      const now = Date.now();
      return oauth.expiresAt > now;
    }
    return true;
  }

  /**
   * Decode JWT token without verification (for payload extraction)
   */
  public decodeJWT(token: string): JWTPayload {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new InvalidTokenError('Invalid JWT token format');
      }

      // Decode base64url payload
      const payload = parts[1];
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = typeof atob !== 'undefined' 
        ? atob(base64)
        : Buffer.from(base64, 'base64').toString('utf-8');
      
      const decoded = JSON.parse(jsonPayload);

      return {
        address: decoded.address,
        level: decoded.level || 1,
        permissions: decoded.permissions || [],
        iat: decoded.iat,
        exp: decoded.exp,
        iss: decoded.iss,
        aud: decoded.aud,
        jti: decoded.jti
      };
    } catch (error) {
      if (error instanceof InvalidTokenError) throw error;
      throw new InvalidTokenError('Failed to decode JWT token');
    }
  }

  /**
   * Update JWT tokens
   */
  public updateTokens(tokens: TokenInfo): void {
    if (this.config.method !== 'jwt') {
      throw new ValidationError('Cannot update tokens for non-JWT authentication');
    }

    this.config.jwt = {
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt
    };

    this.tokenRefreshCallbacks.forEach(callback => {
      try {
        callback(tokens);
      } catch (error) {
        console.error('Token refresh callback error:', error);
      }
    });
  }

  /**
   * Get current JWT tokens
   */
  public getTokens(): TokenInfo | null {
    if (this.config.method !== 'jwt' || !this.config.jwt) {
      return null;
    }

    return {
      accessToken: this.config.jwt.token,
      refreshToken: this.config.jwt.refreshToken,
      expiresAt: this.config.jwt.expiresAt || 0,
      tokenType: 'Bearer'
    };
  }

  /**
   * Check if token needs refresh
   */
  public needsRefresh(): boolean {
    if (this.config.method !== 'jwt' || !this.config.jwt?.expiresAt) {
      return false;
    }

    const now = Date.now();
    const refreshThreshold = 5 * 60 * 1000; // 5 minutes
    return this.config.jwt.expiresAt - now <= refreshThreshold;
  }

  /**
   * Get refresh token
   */
  public getRefreshToken(): string | null {
    if (this.config.method !== 'jwt') return null;
    return this.config.jwt?.refreshToken || null;
  }

  /**
   * Register callback for token refresh events
   */
  public onTokenRefresh(callback: (tokens: TokenInfo) => void): void {
    this.tokenRefreshCallbacks.push(callback);
  }

  /**
   * Remove token refresh callback
   */
  public removeTokenRefreshCallback(callback: (tokens: TokenInfo) => void): void {
    const index = this.tokenRefreshCallbacks.indexOf(callback);
    if (index > -1) {
      this.tokenRefreshCallbacks.splice(index, 1);
    }
  }

  /**
   * Get current authentication method
   */
  public getAuthMethod(): AuthMethod {
    return this.config.method;
  }

  /**
   * Get user information from JWT
   */
  public getUserInfo(): { address: string; level: number; permissions: string[] } | null {
    if (this.config.method === 'jwt' && this.config.jwt?.token) {
      try {
        const payload = this.decodeJWT(this.config.jwt.token);
        return {
          address: payload.address,
          level: payload.level,
          permissions: payload.permissions
        };
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Check if user has specific permission
   */
  public hasPermission(permission: string): boolean {
    const userInfo = this.getUserInfo();
    if (!userInfo) return false;

    return userInfo.permissions.includes(permission) ||
           userInfo.permissions.includes('*') ||
           userInfo.level >= 10;
  }

  /**
   * Check if user has minimum level
   */
  public hasMinimumLevel(minimumLevel: number): boolean {
    const userInfo = this.getUserInfo();
    if (!userInfo) return false;
    return userInfo.level >= minimumLevel;
  }

  /**
   * Update OAuth tokens
   */
  public updateOAuthTokens(
    accessToken: string,
    refreshToken?: string,
    expiresIn?: number
  ): void {
    if (this.config.method !== 'oauth') {
      throw new ValidationError('Cannot update OAuth tokens for non-OAuth authentication');
    }

    this.config.oauth = {
      token: accessToken,
      tokenType: 'Bearer',
      refreshToken: refreshToken,
      expiresAt: expiresIn ? Date.now() + (expiresIn * 1000) : undefined
    };
  }

  /**
   * Clone authentication manager
   */
  public clone(): AuthManager {
    return new AuthManager(JSON.parse(JSON.stringify(this.config)));
  }

  /**
   * Get configuration (without sensitive data)
   */
  public getConfig(): { method: AuthMethod; hasCredentials: boolean } {
    return {
      method: this.config.method,
      hasCredentials: this.isValid()
    };
  }
}

/**
 * Validate Algorand address format
 */
export function isValidAlgorandAddress(address: string): boolean {
  if (typeof address !== 'string') return false;
  const algorandAddressRegex = /^[A-Z2-7]{58}$/;
  return algorandAddressRegex.test(address);
}

/**
 * Create API key authentication manager
 */
export function createApiKeyAuth(apiKey: string): AuthManager {
  return new AuthManager({
    method: 'api-key',
    apiKey
  });
}

/**
 * Create JWT authentication manager
 */
export function createJWTAuth(tokens: TokenInfo): AuthManager {
  return new AuthManager({
    method: 'jwt',
    jwt: {
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt
    }
  });
}

/**
 * Create OAuth authentication manager
 */
export function createOAuthAuth(
  accessToken: string,
  refreshToken?: string,
  expiresIn?: number
): AuthManager {
  return new AuthManager({
    method: 'oauth',
    oauth: {
      token: accessToken,
      tokenType: 'Bearer',
      refreshToken,
      expiresAt: expiresIn ? Date.now() + (expiresIn * 1000) : undefined
    }
  });
}
