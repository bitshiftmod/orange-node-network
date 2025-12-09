"""Retry utilities with exponential backoff and jitter"""

import asyncio
import random
import time
from typing import Any, Callable, Optional, Type, Union
from ..types import RetryConfig
from ..errors import OrangeNetworkError, is_retryable_error


async def with_retry(
    func: Callable,
    *args,
    retry_config: Optional[RetryConfig] = None,
    **kwargs
) -> Any:
    """Execute function with retry logic

    Args:
        func: Function to execute
        *args: Function arguments
        retry_config: Retry configuration
        **kwargs: Function keyword arguments

    Returns:
        Function result

    Raises:
        Last exception if all retries are exhausted
    """
    if retry_config is None:
        retry_config = RetryConfig()

    last_exception = None

    for attempt in range(retry_config.max_attempts):
        try:
            # For async functions, await them
            if asyncio.iscoroutinefunction(func):
                return await func(*args, **kwargs)
            else:
                return func(*args, **kwargs)
        except Exception as e:
            last_exception = e

            # Check if we should retry
            if attempt == retry_config.max_attempts - 1:
                # Last attempt, no more retries
                break

            if isinstance(e, OrangeNetworkError) and not e.retryable:
                # Error is not retryable
                break

            if not is_retryable_error(e):
                # Error is not retryable
                break

            # Calculate delay with exponential backoff and jitter
            delay = calculate_retry_delay(
                attempt=attempt,
                base_delay=retry_config.base_delay,
                max_delay=retry_config.max_delay,
                backoff_factor=retry_config.backoff_factor,
                jitter=retry_config.jitter,
            )

            # Wait before retry
            await asyncio.sleep(delay / 1000)  # Convert to seconds

    # All retries exhausted, re-raise last exception
    if last_exception:
        raise last_exception
    else:
        raise RuntimeError("Function execution failed but no exception was captured")


def calculate_retry_delay(
    attempt: int,
    base_delay: int,
    max_delay: int,
    backoff_factor: float = 2.0,
    jitter: bool = True,
) -> int:
    """Calculate retry delay with exponential backoff and optional jitter

    Args:
        attempt: Current attempt number (0-based)
        base_delay: Base delay in milliseconds
        max_delay: Maximum delay in milliseconds
        backoff_factor: Multiplier for exponential backoff
        jitter: Whether to add random jitter

    Returns:
        Delay in milliseconds
    """
    # Calculate exponential backoff delay
    delay = base_delay * (backoff_factor ** attempt)

    # Clamp to maximum delay
    delay = min(delay, max_delay)

    # Add jitter if enabled
    if jitter:
        # Add ±25% random jitter
        jitter_range = delay * 0.25
        delay += random.uniform(-jitter_range, jitter_range)

    # Ensure delay is not negative
    return max(0, int(delay))


class RetryManager:
    """Manager for retry operations with customizable strategies"""

    def __init__(self, config: Optional[RetryConfig] = None):
        """Initialize retry manager

        Args:
            config: Retry configuration
        """
        self.config = config or RetryConfig()
        self._attempts: dict = {}

    async def execute(
        self,
        func: Callable,
        operation_id: Optional[str] = None,
        *args,
        **kwargs
    ) -> Any:
        """Execute function with retry tracking

        Args:
            func: Function to execute
            operation_id: Unique identifier for operation
            *args: Function arguments
            **kwargs: Function keyword arguments

        Returns:
            Function result
        """
        if operation_id:
            self._attempts[operation_id] = 0

        try:
            result = await with_retry(func, *args, retry_config=self.config, **kwargs)

            if operation_id:
                # Record successful attempt count
                self._attempts[operation_id] = self.config.max_attempts

            return result
        except Exception as e:
            if operation_id:
                # Record failed attempt count
                self._attempts[operation_id] = self.config.max_attempts
            raise

    def get_attempts(self, operation_id: str) -> int:
        """Get number of attempts for an operation

        Args:
            operation_id: Operation identifier

        Returns:
            Number of attempts made
        """
        return self._attempts.get(operation_id, 0)

    def clear_attempts(self, operation_id: str) -> None:
        """Clear attempts record for an operation

        Args:
            operation_id: Operation identifier
        """
        self._attempts.pop(operation_id, None)

    def clear_all_attempts(self) -> None:
        """Clear all attempts records"""
        self._attempts.clear()


def retryable(
    max_attempts: int = 3,
    base_delay: int = 1000,
    max_delay: int = 30000,
    backoff_factor: float = 2.0,
    jitter: bool = True,
    retry_on: Optional[Union[Type[Exception], tuple]] = None,
):
    """Decorator for retrying functions

    Args:
        max_attempts: Maximum number of attempts
        base_delay: Base delay in milliseconds
        max_delay: Maximum delay in milliseconds
        backoff_factor: Exponential backoff factor
        jitter: Whether to add jitter
        retry_on: Exception types to retry on (None for auto-detect)
    """
    def decorator(func: Callable):
        async def async_wrapper(*args, **kwargs):
            retry_config = RetryConfig(
                max_attempts=max_attempts,
                base_delay=base_delay,
                max_delay=max_delay,
                backoff_factor=backoff_factor,
                jitter=jitter,
            )

            return await with_retry(func, *args, retry_config=retry_config, **kwargs)

        def sync_wrapper(*args, **kwargs):
            # For sync functions, run in event loop
            async def async_call():
                retry_config = RetryConfig(
                    max_attempts=max_attempts,
                    base_delay=base_delay,
                    max_delay=max_delay,
                    backoff_factor=backoff_factor,
                    jitter=jitter,
                )

                return await with_retry(func, *args, retry_config=retry_config, **kwargs)

            # Run async function in new event loop
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                return loop.run_until_complete(async_call())
            finally:
                loop.close()

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper

    return decorator