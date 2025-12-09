"""Rate limiting utilities"""

import time
import asyncio
from collections import deque
from typing import Optional


class RateLimiter:
    """Token bucket rate limiter"""

    def __init__(self, requests_per_second: int, window_size_ms: int = 1000):
        """Initialize rate limiter

        Args:
            requests_per_second: Maximum requests per second
            window_size_ms: Time window size in milliseconds
        """
        self.requests_per_second = requests_per_second
        self.window_size_ms = window_size_ms
        self.window_size_s = window_size_ms / 1000

        # Use deque for efficient sliding window
        self.request_times = deque()

        # Statistics
        self.total_requests = 0
        self.rejected_requests = 0
        self.start_time = time.time() * 1000

    def is_allowed(self) -> "RateLimitResult":
        """Check if request is allowed

        Returns:
            RateLimitResult with permission status and timing info
        """
        current_time = time.time() * 1000
        window_start = current_time - self.window_size_ms

        # Remove old requests outside the window
        while self.request_times and self.request_times[0] < window_start:
            self.request_times.popleft()

        # Check if we're under the limit
        if len(self.request_times) < self.requests_per_second:
            # Allow the request
            self.request_times.append(current_time)
            self.total_requests += 1

            return RateLimitResult(
                allowed=True,
                current=len(self.request_times),
                limit=self.requests_per_second,
                remaining=self.requests_per_second - len(self.request_times),
                reset_time=window_start + self.window_size_ms,
                window_duration=self.window_size_ms,
            )
        else:
            # Reject the request
            self.rejected_requests += 1

            # Calculate when the next slot will be available
            oldest_request = self.request_times[0]
            reset_time = oldest_request + self.window_size_ms

            return RateLimitResult(
                allowed=False,
                current=len(self.request_times),
                limit=self.requests_per_second,
                remaining=0,
                reset_time=reset_time,
                window_duration=self.window_size_ms,
            )

    async def wait_if_needed(self) -> None:
        """Wait if rate limit would be exceeded

        This method blocks until a request can be made.
        """
        result = self.is_allowed()

        if not result.allowed:
            # Calculate wait time
            wait_time_ms = result.reset_time - (time.time() * 1000)
            if wait_time_ms > 0:
                wait_time_s = wait_time_ms / 1000
                await asyncio.sleep(wait_time_s)

    def get_stats(self) -> dict:
        """Get rate limiter statistics

        Returns:
            Dictionary with statistics
        """
        current_time = time.time() * 1000
        uptime_ms = current_time - self.start_time

        return {
            "requests_per_second": self.requests_per_second,
            "current_window_requests": len(self.request_times),
            "total_requests": self.total_requests,
            "rejected_requests": self.rejected_requests,
            "rejection_rate": self.rejected_requests / max(1, self.total_requests),
            "uptime_ms": uptime_ms,
            "window_size_ms": self.window_size_ms,
        }

    def reset(self) -> None:
        """Reset rate limiter state"""
        self.request_times.clear()
        self.total_requests = 0
        self.rejected_requests = 0
        self.start_time = time.time() * 1000


class RateLimitResult:
    """Result of a rate limit check"""

    def __init__(
        self,
        allowed: bool,
        current: int,
        limit: int,
        remaining: int,
        reset_time: int,
        window_duration: int,
    ):
        """Initialize rate limit result

        Args:
            allowed: Whether request is allowed
            current: Current request count in window
            limit: Maximum requests allowed
            remaining: Remaining requests in window
            reset_time: When the window resets (timestamp in ms)
            window_duration: Window duration in milliseconds
        """
        self.allowed = allowed
        self.current = current
        self.limit = limit
        self.remaining = remaining
        self.reset_time = reset_time
        self.window_duration = window_duration

    def time_until_reset(self) -> int:
        """Get time until window reset in milliseconds"""
        current_time = time.time() * 1000
        return max(0, int(self.reset_time - current_time))

    def __str__(self) -> str:
        return f"RateLimitResult(allowed={self.allowed}, current={self.current}, limit={self.limit})"


class SlidingWindowRateLimiter:
    """Sliding window rate limiter for more precise control"""

    def __init__(self, requests_per_second: int, window_size_ms: int = 1000):
        """Initialize sliding window rate limiter

        Args:
            requests_per_second: Maximum requests per second
            window_size_ms: Window size in milliseconds
        """
        self.requests_per_second = requests_per_second
        self.window_size_ms = window_size_ms

        # Store request timestamps with their weights
        self.requests = []  # List of (timestamp, weight) tuples
        self.total_weight = 0

        # Lock for thread safety (not needed for asyncio, but kept for compatibility)
        self._lock = asyncio.Lock()

    async def is_allowed(self, weight: float = 1.0) -> RateLimitResult:
        """Check if request is allowed with given weight

        Args:
            weight: Request weight (default 1.0)

        Returns:
            RateLimitResult with permission status
        """
        async with self._lock:
            current_time = time.time() * 1000
            window_start = current_time - self.window_size_ms

            # Remove old requests outside the window
            i = 0
            while i < len(self.requests) and self.requests[i][0] < window_start:
                self.total_weight -= self.requests[i][1]
                i += 1

            if i > 0:
                self.requests = self.requests[i:]

            # Check if we're under the limit
            if self.total_weight + weight <= self.requests_per_second:
                # Allow the request
                self.requests.append((current_time, weight))
                self.total_weight += weight

                return RateLimitResult(
                    allowed=True,
                    current=self.total_weight,
                    limit=self.requests_per_second,
                    remaining=self.requests_per_second - self.total_weight,
                    reset_time=window_start + self.window_size_ms,
                    window_duration=self.window_size_ms,
                )
            else:
                # Reject the request
                oldest_request = self.requests[0][0]
                reset_time = oldest_request + self.window_size_ms

                return RateLimitResult(
                    allowed=False,
                    current=self.total_weight,
                    limit=self.requests_per_second,
                    remaining=max(0, self.requests_per_second - self.total_weight),
                    reset_time=reset_time,
                    window_duration=self.window_size_ms,
                )


class ConcurrentRateLimiter:
    """Rate limiter that also controls concurrent requests"""

    def __init__(self, max_concurrent: int, requests_per_second: int):
        """Initialize concurrent rate limiter

        Args:
            max_concurrent: Maximum concurrent requests
            requests_per_second: Maximum requests per second
        """
        self.max_concurrent = max_concurrent
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.rate_limiter = RateLimiter(requests_per_second)
        self.current_concurrent = 0

    async def acquire(self) -> None:
        """Acquire permission to make a request"""
        await self.semaphore.acquire()
        await self.rate_limiter.wait_if_needed()
        self.current_concurrent += 1

    def release(self) -> None:
        """Release permission after request completes"""
        self.semaphore.release()
        self.current_concurrent = max(0, self.current_concurrent - 1)

    async def __aenter__(self):
        """Async context manager entry"""
        await self.acquire()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        self.release()

    def get_stats(self) -> dict:
        """Get limiter statistics"""
        stats = self.rate_limiter.get_stats()
        stats["max_concurrent"] = self.max_concurrent
        stats["current_concurrent"] = self.current_concurrent
        stats["available_concurrent"] = self.max_concurrent - self.current_concurrent
        return stats