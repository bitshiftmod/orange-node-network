"""Cache utilities with multiple strategies"""

import time
from typing import Any, Dict, Optional, Tuple
from abc import ABC, abstractmethod
from ..types import CacheOptions


class CacheStrategy(ABC):
    """Abstract cache strategy"""

    @abstractmethod
    def on_get(self, key: str) -> None:
        """Called when an item is retrieved"""
        pass

    @abstractmethod
    def on_put(self, key: str) -> None:
        """Called when an item is added"""
        pass

    @abstractmethod
    def on_remove(self, key: str) -> None:
        """Called when an item is removed"""
        pass


class LRUStrategy(CacheStrategy):
    """Least Recently Used (LRU) cache strategy"""

    def __init__(self):
        self._access_order = []

    def on_get(self, key: str) -> None:
        """Move key to end (most recently used)"""
        if key in self._access_order:
            self._access_order.remove(key)
        self._access_order.append(key)

    def on_put(self, key: str) -> None:
        """Add key to end (most recently used)"""
        if key in self._access_order:
            self._access_order.remove(key)
        self._access_order.append(key)

    def on_remove(self, key: str) -> None:
        """Remove key from access order"""
        if key in self._access_order:
            self._access_order.remove(key)

    def get_eviction_key(self, cache_data: Dict[str, Any]) -> Optional[str]:
        """Get key to evict based on LRU policy"""
        if self._access_order:
            return self._access_order[0]  # Least recently used
        return None


class FIFOStrategy(CacheStrategy):
    """First In, First Out (FIFO) cache strategy"""

    def __init__(self):
        self._insertion_order = []

    def on_get(self, key: str) -> None:
        """FIFO doesn't track access"""
        pass

    def on_put(self, key: str) -> None:
        """Add key to end"""
        if key not in self._insertion_order:
            self._insertion_order.append(key)

    def on_remove(self, key: str) -> None:
        """Remove key from insertion order"""
        if key in self._insertion_order:
            self._insertion_order.remove(key)

    def get_eviction_key(self, cache_data: Dict[str, Any]) -> Optional[str]:
        """Get key to evict based on FIFO policy"""
        if self._insertion_order:
            return self._insertion_order[0]  # First inserted
        return None


class LFUStrategy(CacheStrategy):
    """Least Frequently Used (LFU) cache strategy"""

    def __init__(self):
        self._access_count = {}

    def on_get(self, key: str) -> None:
        """Increment access count"""
        self._access_count[key] = self._access_count.get(key, 0) + 1

    def on_put(self, key: str) -> None:
        """Initialize access count"""
        if key not in self._access_count:
            self._access_count[key] = 1

    def on_remove(self, key: str) -> None:
        """Remove access count"""
        self._access_count.pop(key, None)

    def get_eviction_key(self, cache_data: Dict[str, Any]) -> Optional[str]:
        """Get key to evict based on LFU policy"""
        if not self._access_count:
            return None

        # Find key with minimum access count
        min_count = min(self._access_count.values())
        min_keys = [k for k, v in self._access_count.items() if v == min_count]

        # Return first key with minimum count
        return min_keys[0] if min_keys else None


class CacheEntry:
    """Cache entry with TTL"""

    def __init__(self, value: Any, ttl: Optional[int] = None):
        self.value = value
        self.created_at = time.time() * 1000  # milliseconds
        self.ttl = ttl  # milliseconds

    def is_expired(self) -> bool:
        """Check if entry is expired"""
        if self.ttl is None:
            return False

        return (time.time() * 1000 - self.created_at) > self.ttl

    def get_age(self) -> int:
        """Get entry age in milliseconds"""
        return int(time.time() * 1000 - self.created_at)


class Cache:
    """Thread-safe cache with configurable strategy"""

    def __init__(self, max_size: int = 100, ttl: int = 300000, strategy: str = "lru"):
        """Initialize cache

        Args:
            max_size: Maximum number of entries
            ttl: Default TTL in milliseconds
            strategy: Cache strategy (lru, fifo, lfu)
        """
        self.max_size = max_size
        self.default_ttl = ttl

        # Initialize strategy
        if strategy == "lru":
            self.strategy = LRUStrategy()
        elif strategy == "fifo":
            self.strategy = FIFOStrategy()
        elif strategy == "lfu":
            self.strategy = LFUStrategy()
        else:
            raise ValueError(f"Unknown cache strategy: {strategy}")

        self._cache: Dict[str, CacheEntry] = {}
        self._stats = {
            "hits": 0,
            "misses": 0,
            "sets": 0,
            "evictions": 0,
            "expirations": 0,
        }

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found/expired
        """
        # Clean up expired entries first
        self._cleanup_expired()

        entry = self._cache.get(key)
        if entry is None:
            self._stats["misses"] += 1
            return None

        if entry.is_expired():
            # Remove expired entry
            del self._cache[key]
            self.strategy.on_remove(key)
            self._stats["expirations"] += 1
            self._stats["misses"] += 1
            return None

        # Update strategy
        self.strategy.on_get(key)
        self._stats["hits"] += 1

        return entry.value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache

        Args:
            key: Cache key
            value: Value to cache
            ttl: TTL in milliseconds (uses default if None)
        """
        # Clean up expired entries first
        self._cleanup_expired()

        # Check if we need to evict entries
        if key not in self._cache and len(self._cache) >= self.max_size:
            self._evict_one()

        # Create cache entry
        entry_ttl = ttl if ttl is not None else self.default_ttl
        entry = CacheEntry(value, entry_ttl)

        # If key already exists, remove from strategy first
        if key in self._cache:
            self.strategy.on_remove(key)

        # Add to cache
        self._cache[key] = entry
        self.strategy.on_put(key)
        self._stats["sets"] += 1

    def delete(self, key: str) -> bool:
        """Delete key from cache

        Args:
            key: Cache key

        Returns:
            True if key was deleted, False if not found
        """
        if key in self._cache:
            del self._cache[key]
            self.strategy.on_remove(key)
            return True
        return False

    def clear(self) -> None:
        """Clear all entries from cache"""
        self._cache.clear()
        if hasattr(self.strategy, '_access_order'):
            self.strategy._access_order.clear()
        elif hasattr(self.strategy, '_insertion_order'):
            self.strategy._insertion_order.clear()
        elif hasattr(self.strategy, '_access_count'):
            self.strategy._access_count.clear()

    def size(self) -> int:
        """Get current cache size"""
        return len(self._cache)

    def _cleanup_expired(self) -> None:
        """Remove expired entries"""
        expired_keys = []

        for key, entry in self._cache.items():
            if entry.is_expired():
                expired_keys.append(key)

        for key in expired_keys:
            del self._cache[key]
            self.strategy.on_remove(key)
            self._stats["expirations"] += 1

    def _evict_one(self) -> None:
        """Evict one entry based on strategy"""
        if not self._cache:
            return

        eviction_key = self.strategy.get_eviction_key(self._cache)
        if eviction_key and eviction_key in self._cache:
            del self._cache[eviction_key]
            self.strategy.on_remove(eviction_key)
            self._stats["evictions"] += 1

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics

        Returns:
            Dictionary with cache statistics
        """
        total_requests = self._stats["hits"] + self._stats["misses"]
        hit_rate = (self._stats["hits"] / total_requests) if total_requests > 0 else 0

        return {
            **self._stats,
            "size": len(self._cache),
            "max_size": self.max_size,
            "hit_rate": hit_rate,
            "total_requests": total_requests,
        }

    def get_keys(self) -> list:
        """Get all cache keys

        Returns:
            List of cache keys
        """
        return list(self._cache.keys())


class LRUCache(Cache):
    """Convenience LRU cache implementation"""

    def __init__(self, max_size: int = 100, ttl: int = 300000):
        super().__init__(max_size, ttl, "lru")


class MemoryCache:
    """Simple in-memory cache without strategy"""

    def __init__(self, ttl: int = 300000):
        """Initialize memory cache

        Args:
            ttl: Default TTL in milliseconds
        """
        self.ttl = ttl
        self._cache: Dict[str, Tuple[Any, int]] = {}  # (value, timestamp)

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        if key not in self._cache:
            return None

        value, timestamp = self._cache[key]
        current_time = time.time() * 1000

        if (current_time - timestamp) > self.ttl:
            del self._cache[key]
            return None

        return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache"""
        cache_ttl = ttl if ttl is not None else self.ttl
        timestamp = time.time() * 1000 - cache_ttl  # Store creation time
        self._cache[key] = (value, timestamp)

    def delete(self, key: str) -> bool:
        """Delete key from cache"""
        return self._cache.pop(key, None) is not None

    def clear(self) -> None:
        """Clear all entries"""
        self._cache.clear()

    def size(self) -> int:
        """Get cache size"""
        return len(self._cache)