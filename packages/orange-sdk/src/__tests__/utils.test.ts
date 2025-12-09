import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sleep,
  withRetry,
  Cache,
  RateLimiter,
  UrlBuilder,
  generateId,
  generateRequestId,
  deepClone,
  mergeOptions,
  isValidUrl,
  formatDuration,
  formatBytes,
} from '../utils';

describe('sleep', () => {
  it('should delay execution', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
  });
});

describe('withRetry', () => {
  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    
    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelay: 10,
      maxDelay: 100,
      backoffFactor: 2,
      jitter: false,
    });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure with custom retry logic', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');
    
    // Use custom shouldRetry to always retry
    const result = await withRetry(
      fn,
      {
        maxAttempts: 3,
        baseDelay: 10,
        maxDelay: 100,
        backoffFactor: 2,
        jitter: false,
      },
      () => true // Always retry
    );
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw immediately for non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    
    // Without custom retry logic, regular errors are not retried
    await expect(withRetry(fn, {
      maxAttempts: 3,
      baseDelay: 10,
      maxDelay: 100,
      backoffFactor: 2,
      jitter: false,
    })).rejects.toThrow('always fails');
    
    // Only called once because Error is not retryable by default
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('Cache', () => {
  let cache: Cache;

  beforeEach(() => {
    cache = new Cache(10, 1000);
  });

  it('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return null for missing keys', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('should delete values', () => {
    cache.set('key1', 'value1');
    cache.delete('key1');
    expect(cache.get('key1')).toBeNull();
  });

  it('should clear all values', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('should respect max size', () => {
    const smallCache = new Cache(3, 1000);
    smallCache.set('a', 1);
    smallCache.set('b', 2);
    smallCache.set('c', 3);
    smallCache.set('d', 4); // Should evict oldest
    
    expect(smallCache.size()).toBe(3);
    expect(smallCache.get('a')).toBeNull(); // Evicted
    expect(smallCache.get('d')).toBe(4);
  });

  it('should expire entries after TTL', async () => {
    const shortCache = new Cache(10, 50); // 50ms TTL
    shortCache.set('key', 'value');
    
    expect(shortCache.get('key')).toBe('value');
    
    await sleep(60);
    
    expect(shortCache.get('key')).toBeNull();
  });
});

describe('RateLimiter', () => {
  it('should allow requests within limit', () => {
    const limiter = new RateLimiter(5, 1000);
    
    for (let i = 0; i < 5; i++) {
      expect(limiter.isAllowed().allowed).toBe(true);
    }
  });

  it('should block requests over limit', () => {
    const limiter = new RateLimiter(3, 1000);
    
    limiter.isAllowed();
    limiter.isAllowed();
    limiter.isAllowed();
    
    const result = limiter.isAllowed();
    expect(result.allowed).toBe(false);
  });

  it('should reset after window expires', async () => {
    const limiter = new RateLimiter(2, 50);
    
    limiter.isAllowed();
    limiter.isAllowed();
    expect(limiter.isAllowed().allowed).toBe(false);
    
    await sleep(60);
    
    expect(limiter.isAllowed().allowed).toBe(true);
  });
});

describe('UrlBuilder', () => {
  it('should build simple URLs', () => {
    const builder = new UrlBuilder('https://api.example.com');
    const url = builder.path('/users').build();
    
    expect(url).toBe('https://api.example.com/users');
  });

  it('should add query parameters', () => {
    const builder = new UrlBuilder('https://api.example.com');
    const url = builder
      .path('/search')
      .query('q', 'test')
      .query('page', 1)
      .build();
    
    expect(url).toBe('https://api.example.com/search?q=test&page=1');
  });

  it('should handle path segments', () => {
    const builder = new UrlBuilder('https://api.example.com');
    const url = builder
      .path('/users')
      .path('/123')
      .path('/posts')
      .build();
    
    expect(url).toBe('https://api.example.com/users/123/posts');
  });
});

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('should generate IDs with correct prefix', () => {
    const id = generateId('test');
    expect(id.startsWith('test_')).toBe(true);
  });
});

describe('generateRequestId', () => {
  it('should generate request IDs with req prefix', () => {
    const id = generateRequestId();
    expect(id.startsWith('req_')).toBe(true);
  });
});

describe('deepClone', () => {
  it('should clone simple objects', () => {
    const obj = { a: 1, b: 'test' };
    const cloned = deepClone(obj);
    
    expect(cloned).toEqual(obj);
    expect(cloned).not.toBe(obj);
  });

  it('should clone nested objects', () => {
    const obj = { a: { b: { c: 1 } } };
    const cloned = deepClone(obj);
    
    expect(cloned).toEqual(obj);
    expect(cloned.a).not.toBe(obj.a);
    expect(cloned.a.b).not.toBe(obj.a.b);
  });

  it('should clone arrays', () => {
    const arr = [1, 2, { a: 3 }];
    const cloned = deepClone(arr);
    
    expect(cloned).toEqual(arr);
    expect(cloned).not.toBe(arr);
    expect(cloned[2]).not.toBe(arr[2]);
  });
});

describe('mergeOptions', () => {
  it('should merge options with defaults', () => {
    const defaults = { a: 1, b: 2, c: 3 };
    const options = { b: 20 };
    
    const result = mergeOptions(defaults, options);
    
    expect(result).toEqual({ a: 1, b: 20, c: 3 });
  });

  it('should not modify original objects', () => {
    const defaults = { a: 1 };
    const options = { b: 2 };
    
    mergeOptions(defaults, options as any);
    
    expect(defaults).toEqual({ a: 1 });
  });

  it('should ignore undefined values', () => {
    const defaults = { a: 1, b: 2 };
    const options = { a: undefined, b: 20 };
    
    const result = mergeOptions(defaults, options);
    
    expect(result).toEqual({ a: 1, b: 20 });
  });
});

describe('isValidUrl', () => {
  it('should validate correct URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://localhost:3000')).toBe(true);
    expect(isValidUrl('https://api.example.com/v1/users')).toBe(true);
  });

  it('should reject invalid URLs', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('')).toBe(false);
    // Note: ftp is actually valid URL format, just not http/https
  });
});

describe('formatDuration', () => {
  it('should format seconds', () => {
    expect(formatDuration(500)).toBe('0s');
    expect(formatDuration(5000)).toBe('5s');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(120000)).toBe('2m 0s');
    expect(formatDuration(125000)).toBe('2m 5s');
  });

  it('should format hours', () => {
    expect(formatDuration(3600000)).toBe('1h 0m');
  });
});

describe('formatBytes', () => {
  it('should format bytes', () => {
    expect(formatBytes(500)).toBe('500 Bytes');
    expect(formatBytes(0)).toBe('0 Bytes');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });
});
