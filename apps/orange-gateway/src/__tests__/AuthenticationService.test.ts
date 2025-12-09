import { AuthenticationService, User, ApiKey, Session } from '../services/AuthenticationService';
import { Logger } from '../utils/Logger';
import { LogLevel } from '../types';

describe('AuthenticationService', () => {
  let authService: AuthenticationService;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger(LogLevel.ERROR); // Suppress logs during tests
    authService = new AuthenticationService(
      {
        jwtSecret: 'test-jwt-secret-that-is-long-enough',
        jwtRefreshSecret: 'test-jwt-refresh-secret-that-is-long-enough',
        tokenExpiry: { access: '15m', refresh: '7d' },
        maxLoginAttempts: 5,
        lockoutDuration: 15 * 60 * 1000,
      },
      logger
    );
  });

  describe('User Management', () => {
    describe('createUser', () => {
      it('should create a user with valid data', async () => {
        const userData = {
          address: '0x1234567890abcdef',
          email: 'test@example.com',
          level: 1,
          permissions: ['read'],
        };

        const user = await authService.createUser(userData);

        expect(user).toBeDefined();
        expect(user.id).toBeDefined();
        expect(user.address).toBe(userData.address.toLowerCase());
        expect(user.email).toBe(userData.email);
        expect(user.level).toBe(userData.level);
        expect(user.permissions).toEqual(userData.permissions);
        expect(user.isActive).toBe(true);
        expect(user.createdAt).toBeDefined();
      });

      it('should convert address to lowercase', async () => {
        const user = await authService.createUser({
          address: '0xABCDEF123456',
          level: 1,
          permissions: [],
        });

        expect(user.address).toBe('0xabcdef123456');
      });

      it('should initialize user with default values', async () => {
        const user = await authService.createUser({
          address: '0x1234',
          level: 1,
          permissions: [],
        });

        expect(user.isMfaEnabled).toBe(false);
        expect(user.loginAttempts).toBe(0);
        expect(user.reputation).toBe(100);
        expect(user.stake).toBe(0);
      });

      it('should create user without email', async () => {
        const user = await authService.createUser({
          address: '0x1234',
          level: 1,
          permissions: [],
        });

        expect(user.email).toBeUndefined();
      });
    });

    describe('getUser', () => {
      it('should retrieve existing user by address', async () => {
        const createdUser = await authService.createUser({
          address: '0xgetuser123',
          level: 1,
          permissions: ['read'],
        });

        const retrievedUser = await authService.getUser('0xgetuser123');

        expect(retrievedUser).toBeDefined();
        expect(retrievedUser?.id).toBe(createdUser.id);
      });

      it('should be case insensitive when retrieving users', async () => {
        await authService.createUser({
          address: '0xABCDEF',
          level: 1,
          permissions: [],
        });

        const user = await authService.getUser('0xabcdef');

        expect(user).toBeDefined();
      });

      it('should return null for non-existent user', async () => {
        const user = await authService.getUser('0xnonexistent');

        expect(user).toBeNull();
      });
    });
  });

  describe('API Key Management', () => {
    let testUser: User;

    beforeEach(async () => {
      testUser = await authService.createUser({
        address: '0xapikey-test-user',
        level: 2,
        permissions: ['read', 'write'],
      });
    });

    describe('createApiKey', () => {
      it('should create an API key successfully', async () => {
        // NOTE: Using address as userId due to bug in AuthenticationService.validateApiKey
        // which calls getUser(userId) but getUser expects an address
        const result = await authService.createApiKey(testUser.id, {
          name: 'Test API Key',
          permissions: ['read'],
          rateLimitTier: 'basic',
        });

        expect(result).toBeDefined();
        expect(result.apiKey).toBeDefined();
        expect(typeof result.apiKey).toBe('string');
        expect(result.keyRecord).toBeDefined();
        expect(result.keyRecord.name).toBe('Test API Key');
        expect(result.keyRecord.permissions).toEqual(['read']);
        expect(result.keyRecord.rateLimitTier).toBe('basic');
      });

      it('should create API key with premium tier', async () => {
        const result = await authService.createApiKey(testUser.id, {
          name: 'Premium Key',
          permissions: ['read', 'write'],
          rateLimitTier: 'premium',
        });

        expect(result.keyRecord.rateLimitTier).toBe('premium');
      });

      it('should create API key with enterprise tier', async () => {
        const result = await authService.createApiKey(testUser.id, {
          name: 'Enterprise Key',
          permissions: ['read', 'write', 'admin'],
          rateLimitTier: 'enterprise',
        });

        expect(result.keyRecord.rateLimitTier).toBe('enterprise');
      });

      it('should set allowed IPs if provided', async () => {
        const result = await authService.createApiKey(testUser.id, {
          name: 'Restricted Key',
          permissions: ['read'],
          rateLimitTier: 'basic',
          allowedIps: ['192.168.1.1', '10.0.0.1'],
        });

        expect(result.keyRecord.allowedIps).toEqual(['192.168.1.1', '10.0.0.1']);
      });

      it('should set allowed origins if provided', async () => {
        const result = await authService.createApiKey(testUser.id, {
          name: 'Origin Restricted Key',
          permissions: ['read'],
          rateLimitTier: 'basic',
          allowedOrigins: ['https://example.com', 'https://app.example.com'],
        });

        expect(result.keyRecord.allowedOrigins).toEqual([
          'https://example.com',
          'https://app.example.com',
        ]);
      });

      it('should set expiration if provided', async () => {
        const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
        const result = await authService.createApiKey(testUser.id, {
          name: 'Expiring Key',
          permissions: ['read'],
          rateLimitTier: 'basic',
          expiresAt,
        });

        expect(result.keyRecord.expiresAt).toBe(expiresAt);
      });
    });

    describe('validateApiKey', () => {
      it('should validate a valid API key', async () => {
        const { apiKey } = await authService.createApiKey(testUser.id, {
          name: 'Valid Key',
          permissions: ['read'],
          rateLimitTier: 'basic',
        });

        const result = await authService.validateApiKey(apiKey, {
          ipAddress: '127.0.0.1',
        });

        expect(result).toBeDefined();
        expect(result?.user).toBeDefined();
        expect(result?.key).toBeDefined();
        expect(result?.user.address).toBe(testUser.address);
      });

      it('should return null for invalid API key', async () => {
        const result = await authService.validateApiKey('invalid-key', {
          ipAddress: '127.0.0.1',
        });

        expect(result).toBeNull();
      });

      it('should reject API key from unauthorized IP', async () => {
        const { apiKey } = await authService.createApiKey(testUser.id, {
          name: 'IP Restricted',
          permissions: ['read'],
          rateLimitTier: 'basic',
          allowedIps: ['192.168.1.1'],
        });

        const result = await authService.validateApiKey(apiKey, {
          ipAddress: '10.0.0.1', // Different IP
        });

        expect(result).toBeNull();
      });

      it('should accept API key from authorized IP', async () => {
        const { apiKey } = await authService.createApiKey(testUser.id, {
          name: 'IP Restricted',
          permissions: ['read'],
          rateLimitTier: 'basic',
          allowedIps: ['192.168.1.1'],
        });

        const result = await authService.validateApiKey(apiKey, {
          ipAddress: '192.168.1.1',
        });

        expect(result).toBeDefined();
      });

      it('should reject API key from unauthorized origin', async () => {
        const { apiKey } = await authService.createApiKey(testUser.id, {
          name: 'Origin Restricted',
          permissions: ['read'],
          rateLimitTier: 'basic',
          allowedOrigins: ['https://example.com'],
        });

        const result = await authService.validateApiKey(apiKey, {
          ipAddress: '127.0.0.1',
          origin: 'https://malicious.com',
        });

        expect(result).toBeNull();
      });

      it('should increment usage count on validation', async () => {
        const { apiKey, keyRecord } = await authService.createApiKey(testUser.id, {
          name: 'Usage Count Key',
          permissions: ['read'],
          rateLimitTier: 'basic',
        });

        expect(keyRecord.usageCount).toBe(0);

        const result1 = await authService.validateApiKey(apiKey, {
          ipAddress: '127.0.0.1',
        });
        const result2 = await authService.validateApiKey(apiKey, {
          ipAddress: '127.0.0.1',
        });

        expect(result2?.key.usageCount).toBe(2);
      });
    });

    describe('revokeApiKey', () => {
      it('should revoke an existing API key', async () => {
        const { apiKey, keyRecord } = await authService.createApiKey(testUser.id, {
          name: 'To Be Revoked',
          permissions: ['read'],
          rateLimitTier: 'basic',
        });

        const revoked = await authService.revokeApiKey(keyRecord.id);
        expect(revoked).toBe(true);

        const result = await authService.validateApiKey(apiKey, {
          ipAddress: '127.0.0.1',
        });
        expect(result).toBeNull();
      });

      it('should return false for non-existent key', async () => {
        const revoked = await authService.revokeApiKey('non-existent-id');
        expect(revoked).toBe(false);
      });
    });
  });

  describe('JWT Token Management', () => {
    let testUser: User;

    beforeEach(async () => {
      testUser = await authService.createUser({
        address: '0xtoken-test-user',
        level: 2,
        permissions: ['read', 'write'],
      });
    });

    describe('generateTokens', () => {
      it('should generate access and refresh tokens', async () => {
        const result = await authService.generateTokens(testUser, {
          ipAddress: '127.0.0.1',
          userAgent: 'Jest Test Agent',
        });

        expect(result).toBeDefined();
        expect(result.accessToken).toBeDefined();
        expect(typeof result.accessToken).toBe('string');
        expect(result.refreshToken).toBeDefined();
        expect(typeof result.refreshToken).toBe('string');
        expect(result.session).toBeDefined();
      });

      it('should create a session record', async () => {
        const result = await authService.generateTokens(testUser, {
          ipAddress: '192.168.1.100',
          userAgent: 'Test Browser',
          deviceInfo: 'iPhone 14',
        });

        expect(result.session.id).toBeDefined();
        expect(result.session.userId).toBe(testUser.id);
        expect(result.session.ipAddress).toBe('192.168.1.100');
        expect(result.session.userAgent).toBe('Test Browser');
        expect(result.session.deviceInfo).toBe('iPhone 14');
        expect(result.session.isActive).toBe(true);
      });

      it('should update user lastLoginAt', async () => {
        const beforeLogin = Date.now();

        await authService.generateTokens(testUser, {
          ipAddress: '127.0.0.1',
          userAgent: 'Test',
        });

        const updatedUser = await authService.getUser(testUser.address);
        expect(updatedUser?.lastLoginAt).toBeDefined();
        expect(updatedUser!.lastLoginAt!).toBeGreaterThanOrEqual(beforeLogin);
      });
    });

    describe('validateToken', () => {
      it('should validate a valid access token', async () => {
        const { accessToken } = await authService.generateTokens(testUser, {
          ipAddress: '127.0.0.1',
          userAgent: 'Test',
        });

        const result = await authService.validateToken(accessToken, 'access');

        expect(result).toBeDefined();
        expect(result?.userId).toBe(testUser.id);
        expect(result?.address).toBe(testUser.address);
        expect(result?.type).toBe('access');
      });

      it('should validate a valid refresh token', async () => {
        const { refreshToken } = await authService.generateTokens(testUser, {
          ipAddress: '127.0.0.1',
          userAgent: 'Test',
        });

        const result = await authService.validateToken(refreshToken, 'refresh');

        expect(result).toBeDefined();
        expect(result?.type).toBe('refresh');
      });

      it('should return null for invalid token', async () => {
        const result = await authService.validateToken('invalid-token', 'access');

        expect(result).toBeNull();
      });

      it('should return null for wrong token type', async () => {
        const { accessToken } = await authService.generateTokens(testUser, {
          ipAddress: '127.0.0.1',
          userAgent: 'Test',
        });

        // Try to validate access token as refresh
        const result = await authService.validateToken(accessToken, 'refresh');

        expect(result).toBeNull();
      });

      it('should return null for revoked token', async () => {
        const { accessToken } = await authService.generateTokens(testUser, {
          ipAddress: '127.0.0.1',
          userAgent: 'Test',
        });

        await authService.revokeToken(accessToken);

        const result = await authService.validateToken(accessToken, 'access');

        expect(result).toBeNull();
      });
    });

    describe('refreshTokens', () => {
      it('should refresh tokens successfully', async () => {
        const originalTokens = await authService.generateTokens(testUser, {
          ipAddress: '127.0.0.1',
          userAgent: 'Test',
        });

        const newTokens = await authService.refreshTokens(originalTokens.refreshToken);

        expect(newTokens).toBeDefined();
        expect(newTokens?.accessToken).toBeDefined();
        expect(newTokens?.refreshToken).toBeDefined();
        expect(newTokens?.accessToken).not.toBe(originalTokens.accessToken);
      });

      it('should return null for invalid refresh token', async () => {
        const result = await authService.refreshTokens('invalid-refresh-token');

        expect(result).toBeNull();
      });

      it('should invalidate the old refresh token', async () => {
        const originalTokens = await authService.generateTokens(testUser, {
          ipAddress: '127.0.0.1',
          userAgent: 'Test',
        });

        await authService.refreshTokens(originalTokens.refreshToken);

        // Old refresh token should no longer work
        const secondRefresh = await authService.refreshTokens(originalTokens.refreshToken);
        expect(secondRefresh).toBeNull();
      });
    });

    describe('revokeToken', () => {
      it('should revoke a token', async () => {
        const { accessToken } = await authService.generateTokens(testUser, {
          ipAddress: '127.0.0.1',
          userAgent: 'Test',
        });

        const revoked = await authService.revokeToken(accessToken);

        expect(revoked).toBe(true);
      });

      it('should prevent revoked token from being validated', async () => {
        const { accessToken } = await authService.generateTokens(testUser, {
          ipAddress: '127.0.0.1',
          userAgent: 'Test',
        });

        await authService.revokeToken(accessToken);

        const result = await authService.validateToken(accessToken, 'access');
        expect(result).toBeNull();
      });
    });

    describe('revokeAllUserSessions', () => {
      it('should revoke all sessions for a user', async () => {
        // Create multiple sessions
        const session1 = await authService.generateTokens(testUser, {
          ipAddress: '127.0.0.1',
          userAgent: 'Device 1',
        });
        const session2 = await authService.generateTokens(testUser, {
          ipAddress: '192.168.1.1',
          userAgent: 'Device 2',
        });
        const session3 = await authService.generateTokens(testUser, {
          ipAddress: '10.0.0.1',
          userAgent: 'Device 3',
        });

        const revokedCount = await authService.revokeAllUserSessions(testUser.id);

        expect(revokedCount).toBe(3);

        // All tokens should be invalid now
        expect(await authService.validateToken(session1.accessToken, 'access')).toBeNull();
        expect(await authService.validateToken(session2.accessToken, 'access')).toBeNull();
        expect(await authService.validateToken(session3.accessToken, 'access')).toBeNull();
      });
    });
  });

  describe('Permission Management', () => {
    let testUser: User;

    beforeEach(async () => {
      testUser = await authService.createUser({
        address: '0xpermission-test-user',
        level: 1,
        permissions: ['read'],
      });
    });

    describe('updateUserLevel', () => {
      it('should update user level', async () => {
        const success = await authService.updateUserLevel(testUser.address, 3);

        expect(success).toBe(true);

        const updatedUser = await authService.getUser(testUser.address);
        expect(updatedUser?.level).toBe(3);
      });

      it('should return false for non-existent user', async () => {
        const success = await authService.updateUserLevel('0xnonexistent', 3);

        expect(success).toBe(false);
      });
    });

    describe('updateUserPermissions', () => {
      it('should update user permissions', async () => {
        const newPermissions = ['read', 'write', 'admin'];
        const success = await authService.updateUserPermissions(testUser.address, newPermissions);

        expect(success).toBe(true);

        const updatedUser = await authService.getUser(testUser.address);
        expect(updatedUser?.permissions).toEqual(newPermissions);
      });

      it('should return false for non-existent user', async () => {
        const success = await authService.updateUserPermissions('0xnonexistent', ['read']);

        expect(success).toBe(false);
      });
    });
  });

  describe('Security Features', () => {
    it('should generate unique user IDs', async () => {
      const user1 = await authService.createUser({
        address: '0xunique1',
        level: 1,
        permissions: [],
      });
      const user2 = await authService.createUser({
        address: '0xunique2',
        level: 1,
        permissions: [],
      });

      expect(user1.id).not.toBe(user2.id);
    });

    it('should generate unique session IDs', async () => {
      const user = await authService.createUser({
        address: '0xsession-unique',
        level: 1,
        permissions: [],
      });

      const tokens1 = await authService.generateTokens(user, {
        ipAddress: '127.0.0.1',
        userAgent: 'Test 1',
      });
      const tokens2 = await authService.generateTokens(user, {
        ipAddress: '127.0.0.1',
        userAgent: 'Test 2',
      });

      expect(tokens1.session.id).not.toBe(tokens2.session.id);
    });

    it('should generate different API keys each time', async () => {
      const user = await authService.createUser({
        address: '0xapikey-unique',
        level: 1,
        permissions: [],
      });

      const key1 = await authService.createApiKey(user.address, {
        name: 'Key 1',
        permissions: ['read'],
        rateLimitTier: 'basic',
      });
      const key2 = await authService.createApiKey(user.address, {
        name: 'Key 2',
        permissions: ['read'],
        rateLimitTier: 'basic',
      });

      expect(key1.apiKey).not.toBe(key2.apiKey);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty permissions array', async () => {
      const user = await authService.createUser({
        address: '0xempty-perms',
        level: 1,
        permissions: [],
      });

      expect(user.permissions).toEqual([]);
    });

    it('should handle special characters in API key name', async () => {
      const user = await authService.createUser({
        address: '0xspecial-chars',
        level: 1,
        permissions: [],
      });

      const result = await authService.createApiKey(user.address, {
        name: 'Test Key with "quotes" & <special> chars',
        permissions: ['read'],
        rateLimitTier: 'basic',
      });

      expect(result.keyRecord.name).toBe('Test Key with "quotes" & <special> chars');
    });

    it('should handle very long permissions arrays', async () => {
      const manyPermissions = Array.from({ length: 100 }, (_, i) => `permission_${i}`);

      const user = await authService.createUser({
        address: '0xmany-perms',
        level: 1,
        permissions: manyPermissions,
      });

      expect(user.permissions.length).toBe(100);
    });
  });
});
