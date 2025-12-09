import { createClient, RedisClientType } from 'redis';
import { CacheConfig, CachedResponse } from '../types';
import { Logger } from '../utils/logger';

export class RedisCache {
  private client: RedisClientType;
  private config: CacheConfig;
  private logger: Logger;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;

  constructor(config: CacheConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.client = createClient({
      socket: {
        host: config.host,
        port: config.port,
        connectTimeout: 5000
      },
      ...(config.password ? { password: config.password } : {}),
      database: config.db
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      this.logger.info('Redis connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.client.on('error', (error) => {
      this.logger.error('Redis error', error);
      this.isConnected = false;
    });

    this.client.on('end', () => {
      this.logger.warn('Redis connection ended');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      this.reconnectAttempts++;
      this.logger.info(`Redis reconnecting (attempt ${this.reconnectAttempts})`);

      if (this.reconnectAttempts > this.maxReconnectAttempts) {
        this.logger.error('Max reconnection attempts reached');
      }
    });
  }

  async connect(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info('Redis cache is disabled');
      return;
    }

    try {
      await this.client.connect();
      this.isConnected = true;
      this.logger.info('Redis cache connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error as Error);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
      this.logger.info('Redis cache disconnected');
    }
  }

  isHealthy(): boolean {
    return this.isConnected;
  }

  private generateKey(url: string, params?: Record<string, any>): string {
    const key = params ? `${url}:${JSON.stringify(params)}` : url;
    return `${this.config.keyPrefix}${Buffer.from(key).toString('base64')}`;
  }

  private getTTL(url: string): number {
    // Check for exact match first
    const ttlValue = this.config.ttl[url];
    if (ttlValue !== undefined) {
      return ttlValue;
    }

    // Check for prefix match
    for (const [prefix, ttl] of Object.entries(this.config.ttl)) {
      if (prefix !== 'default' && url.startsWith(prefix)) {
        return ttl;
      }
    }

    // Return default TTL
    return this.config.ttl['default'] || 5000;
  }

  async get(url: string, params?: Record<string, any>): Promise<CachedResponse | null> {
    if (!this.isConnected || !this.config.enabled) {
      return null;
    }

    try {
      const key = this.generateKey(url, params);
      const cached = await this.client.get(key);

      if (cached) {
        const parsed = JSON.parse(cached) as CachedResponse;

        // Check if cache entry has expired
        const now = Date.now();
        const createdAt = new Date(parsed.timestamp).getTime();

        if (now - createdAt > parsed.ttl) {
          // Expired, delete and return null
          await this.delete(url, params);
          this.logger.logCacheEvent('miss', key, { reason: 'expired' });
          return null;
        }

        this.logger.logCacheEvent('hit', key);
        return parsed;
      }

      this.logger.logCacheEvent('miss', key);
      return null;
    } catch (error) {
      this.logger.error('Cache get error', error as Error, { url, params });
      return null;
    }
  }

  async set(
    url: string,
    response: any,
    headers: Record<string, string>,
    statusCode: number,
    params?: Record<string, any>
  ): Promise<void> {
    if (!this.isConnected || !this.config.enabled) {
      return;
    }

    try {
      const key = this.generateKey(url, params);
      const ttl = this.getTTL(url);

      const cachedResponse: CachedResponse = {
        data: response,
        headers,
        statusCode,
        timestamp: new Date(),
        ttl,
        ...(headers['etag'] ? { etag: headers['etag'] } : {}),
        ...(headers['last-modified'] ? { lastModified: new Date(headers['last-modified']) } : {})
      };

      await this.client.setEx(key, Math.ceil(ttl / 1000), JSON.stringify(cachedResponse));
      this.logger.logCacheEvent('set', key, { ttl });
    } catch (error) {
      this.logger.error('Cache set error', error as Error, { url, params });
    }
  }

  async delete(url: string, params?: Record<string, any>): Promise<void> {
    if (!this.isConnected || !this.config.enabled) {
      return;
    }

    try {
      const key = this.generateKey(url, params);
      await this.client.del(key);
      this.logger.logCacheEvent('delete', key);
    } catch (error) {
      this.logger.error('Cache delete error', error as Error, { url, params });
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.isConnected || !this.config.enabled) {
      return;
    }

    try {
      const fullPattern = `${this.config.keyPrefix}${pattern}`;
      const keys = await this.client.keys(fullPattern);

      if (keys.length > 0) {
        await this.client.del(keys);
        this.logger.logCacheEvent('delete', fullPattern, { keysCount: keys.length });
      }
    } catch (error) {
      this.logger.error('Cache invalidate pattern error', error as Error, { pattern });
    }
  }

  async clear(): Promise<void> {
    if (!this.isConnected || !this.config.enabled) {
      return;
    }

    try {
      const pattern = `${this.config.keyPrefix}*`;
      const keys = await this.client.keys(pattern);

      if (keys.length > 0) {
        await this.client.del(keys);
        this.logger.logCacheEvent('delete', pattern, { keysCount: keys.length });
      }
    } catch (error) {
      this.logger.error('Cache clear error', error as Error);
    }
  }

  async getStats(): Promise<any> {
    if (!this.isConnected || !this.config.enabled) {
      return {
        connected: false,
        memoryUsage: 0,
        connectedClients: 0,
        totalCommands: 0,
        keyspaceHits: 0,
        keyspaceMisses: 0
      };
    }

    try {
      const info = await this.client.info('memory');
      const clients = await this.client.info('clients');
      const stats = await this.client.info('stats');

      const parseInfo = (infoStr: string) => {
        const lines = infoStr.split('\r\n');
        const result: Record<string, any> = {};

        for (const line of lines) {
          if (line && !line.startsWith('#')) {
            const [key, value] = line.split(':');
            if (key && value) {
              result[key] = isNaN(Number(value)) ? value : Number(value);
            }
          }
        }

        return result;
      };

      const memoryInfo = parseInfo(info);
      const clientInfo = parseInfo(clients);
      const statsInfo = parseInfo(stats);

      const totalOperations = (statsInfo['keyspace_hits'] || 0) + (statsInfo['keyspace_misses'] || 0);
      const hitRate = totalOperations > 0 ? (statsInfo['keyspace_hits'] || 0) / totalOperations : 0;

      return {
        connected: this.isConnected,
        memoryUsage: memoryInfo['used_memory'] || 0,
        connectedClients: clientInfo['connected_clients'] || 0,
        totalCommands: statsInfo['total_commands_processed'] || 0,
        keyspaceHits: statsInfo['keyspace_hits'] || 0,
        keyspaceMisses: statsInfo['keyspace_misses'] || 0,
        hitRate
      };
    } catch (error) {
      this.logger.error('Failed to get Redis stats', error as Error);
      return {
        connected: false,
        error: (error as Error).message
      };
    }
  }

  async getCacheSize(): Promise<number> {
    if (!this.isConnected || !this.config.enabled) {
      return 0;
    }

    try {
      const pattern = `${this.config.keyPrefix}*`;
      const keys = await this.client.keys(pattern);
      return keys.length;
    } catch (error) {
      this.logger.error('Failed to get cache size', error as Error);
      return 0;
    }
  }

  // Cache warming for common endpoints
  async warmCache(endpoints: Array<{ url: string; data: any; headers?: Record<string, string> }>): Promise<void> {
    if (!this.isConnected || !this.config.enabled) {
      return;
    }

    for (const endpoint of endpoints) {
      try {
        await this.set(endpoint.url, endpoint.data, endpoint.headers || {}, 200);
        this.logger.logCacheEvent('set', endpoint.url);
      } catch (error) {
        this.logger.error('Cache warming error', error as Error, { url: endpoint.url });
      }
    }
  }

  // Health check method
  async healthCheck(): Promise<{ status: 'pass' | 'fail' | 'warn'; responseTime: number }> {
    const startTime = Date.now();

    try {
      if (!this.isConnected) {
        return { status: 'fail', responseTime: Date.now() - startTime };
      }

      // Perform a simple PING command
      await this.client.ping();
      return { status: 'pass', responseTime: Date.now() - startTime };
    } catch (error) {
      this.logger.error('Redis health check failed', error as Error);
      return { status: 'fail', responseTime: Date.now() - startTime };
    }
  }
}