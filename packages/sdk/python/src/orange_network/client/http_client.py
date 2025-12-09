"""Async HTTP client for the Orange Network SDK"""

import asyncio
import time
from typing import Any, Dict, List, Optional, Callable, Union
from urllib.parse import urljoin

import aiohttp
from aiohttp import ClientTimeout, ClientResponse

from ..types import (
    NetworkConfig,
    ApiResponse,
    RequestOptions,
    HttpMethod,
    RateLimitInfo,
)
from ..errors import (
    OrangeNetworkError,
    NetworkError,
    TimeoutError,
    ConnectionError,
    RateLimitError,
    create_error_from_response,
)
from ..auth import AuthManager
from ..utils import (
    Cache,
    RateLimiter,
    UrlBuilder,
    generate_request_id,
    with_retry,
    RetryConfig,
)
from ..utils.logger import Logger
from .config import HttpClientConfig


class HttpClient:
    """Async HTTP client with retry logic, caching, and rate limiting"""

    def __init__(self, config: HttpClientConfig):
        """Initialize HTTP client

        Args:
            config: HTTP client configuration
        """
        self.config = config
        self.auth = config.auth

        # Initialize cache
        self.cache = Cache(
            max_size=config.cache_max_size,
            ttl=config.cache_ttl,
            strategy="lru"
        )

        # Initialize rate limiter
        if config.rate_limit:
            self.rate_limiter = RateLimiter(
                requests_per_second=config.rate_limit.requests_per_second
            )
        else:
            self.rate_limiter = RateLimiter(10)  # Default: 10 requests per second

        # Middleware
        self.request_middleware: List[Callable] = []
        self.response_middleware: List[Callable] = []
        self.error_middleware: List[Callable] = []

        # Statistics
        self.stats = {
            "requests": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "rate_limited": 0,
            "errors": 0,
        }

        # Pending requests for deduplication
        self._pending_requests: Dict[str, asyncio.Future] = {}

    async def request(
        self,
        method: HttpMethod,
        path: str,
        options: Optional[RequestOptions] = None,
        **kwargs
    ) -> Any:
        """Make HTTP request with retry logic and caching

        Args:
            method: HTTP method
            path: Request path
            options: Request options
            **kwargs: Additional request arguments

        Returns:
            Response data

        Raises:
            OrangeNetworkError: On request failure
        """
        if options is None:
            options = RequestOptions()

        # Build full URL
        url = urljoin(self.config.gateway_url.rstrip('/') + '/', path.lstrip('/'))

        # Create retry config
        retry_config = RetryConfig(
            max_attempts=options.retry_attempts or self.config.retry_attempts,
            base_delay=self.config.retry_delay,
        )

        # Execute with retry logic
        return await with_retry(
            self._execute_request,
            method=method,
            url=url,
            options=options,
            retry_config=retry_config,
            **kwargs
        )

    async def _execute_request(
        self,
        method: HttpMethod,
        url: str,
        options: RequestOptions,
        retry_config: RetryConfig,
        **kwargs
    ) -> Any:
        """Execute single HTTP request

        Args:
            method: HTTP method
            url: Full request URL
            options: Request options
            retry_config: Retry configuration
            **kwargs: Additional request arguments

        Returns:
            Response data

        Raises:
            OrangeNetworkError: On request failure
        """
        # Check rate limiting
        rate_limit_result = self.rate_limiter.is_allowed()
        if not rate_limit_result.allowed:
            self.stats["rate_limited"] += 1
            raise RateLimitError(
                "Rate limit exceeded",
                reset_time=rate_limit_result.reset_time,
                limit=rate_limit_result.limit
            )

        # Generate cache key for GET requests
        cache_key = None
        is_get_request = method == HttpMethod.GET

        if is_get_request and self.config.cache:
            cache_key = self._get_cache_key(url, options.params)

            # Check cache
            cached_response = self.cache.get(cache_key)
            if cached_response is not None:
                self.stats["cache_hits"] += 1
                return cached_response
            else:
                self.stats["cache_misses"] += 1

        # Prevent duplicate requests
        if cache_key and cache_key in self._pending_requests:
            return await self._pending_requests[cache_key]

        # Create request future
        request_future = asyncio.create_task(
            self._make_request(method, url, options, **kwargs)
        )

        if cache_key:
            self._pending_requests[cache_key] = request_future

        try:
            response_data = await request_future

            # Cache successful GET requests
            if is_get_request and self.config.cache and cache_key:
                self.cache.set(cache_key, response_data, ttl=self.config.cache_ttl)

            return response_data

        finally:
            # Clean up pending request
            if cache_key and cache_key in self._pending_requests:
                del self._pending_requests[cache_key]

    async def _make_request(
        self,
        method: HttpMethod,
        url: str,
        options: RequestOptions,
        **kwargs
    ) -> Any:
        """Make actual HTTP request

        Args:
            method: HTTP method
            url: Request URL
            options: Request options
            **kwargs: Additional request arguments

        Returns:
            Response data

        Raises:
            OrangeNetworkError: On request failure
        """
        self.stats["requests"] += 1

        # Prepare headers
        headers = {
            "Content-Type": "application/json",
            "User-Agent": self.config.user_agent,
            "X-Request-ID": generate_request_id(),
        }

        # Add custom headers
        if self.config.headers:
            headers.update(self.config.headers)

        if options.headers:
            headers.update(options.headers)

        # Add authentication headers
        if self.auth:
            auth_headers = self.auth.get_auth_headers()
            headers.update(auth_headers)

        # Apply request middleware
        for middleware in self.request_middleware:
            headers = await middleware(headers) or headers

        # Prepare request data
        json_data = None
        data = None

        if options.body is not None:
            if isinstance(options.body, (dict, list)):
                json_data = options.body
            else:
                data = options.body

        # Configure timeout
        timeout = ClientTimeout(total=options.timeout or self.config.timeout / 1000)

        try:
            async with aiohttp.ClientSession(
                timeout=timeout,
                connector=aiohttp.TCPConnector(
                    verify_ssl=self.config.verify_ssl,
                    limit=100,  # Connection pool limit
                    limit_per_host=20,
                )
            ) as session:
                async with session.request(
                    method.value,
                    url,
                    headers=headers,
                    json=json_data,
                    data=data,
                    params=options.params,
                    **kwargs
                ) as response:
                    await self._log_request(method, url, response, options)

                    # Handle response
                    response_data = await self._handle_response(response)

                    # Apply response middleware
                    for middleware in self.response_middleware:
                        response_data = await middleware(response_data) or response_data

                    return response_data

        except asyncio.TimeoutError as e:
            self.stats["errors"] += 1
            error = TimeoutError(
                f"Request timeout after {options.timeout or self.config.timeout}ms",
                timeout=options.timeout or self.config.timeout
            )
            await self._handle_error(error, method, url, options)
            raise error

        except aiohttp.ClientError as e:
            self.stats["errors"] += 1
            error = ConnectionError(f"Network connection failed: {e}")
            await self._handle_error(error, method, url, options)
            raise error

        except Exception as e:
            self.stats["errors"] += 1
            error = NetworkError(f"Unexpected error: {e}")
            await self._handle_error(error, method, url, options)
            raise error

    async def _handle_response(self, response: ClientResponse) -> Any:
        """Handle HTTP response

        Args:
            response: aiohttp response object

        Returns:
            Response data

        Raises:
            OrangeNetworkError: On error response
        """
        content_type = response.headers.get("content-type", "").lower()

        # Parse response based on content type
        if "application/json" in content_type:
            try:
                response_data = await response.json()
            except Exception as e:
                raise OrangeNetworkError(f"Failed to parse JSON response: {e}")
        else:
            response_data = await response.text()

        # Handle error responses
        if not response.ok:
            error = create_error_from_response(
                status_code=response.status,
                message=f"HTTP {response.status}: {response.reason}",
                details=response_data if isinstance(response_data, dict) else {"response": response_data}
            )
            await self._handle_error(error, "UNKNOWN", str(response.url), RequestOptions())
            raise error

        # Handle wrapped API responses
        if isinstance(response_data, dict):
            if "success" in response_data and not response_data["success"]:
                # API returned error
                error_info = response_data.get("error", {})
                raise create_error_from_response(
                    status_code=response.status,
                    message=error_info.get("message", "API request failed"),
                    code=error_info.get("code"),
                    details=error_info.get("details")
                )

            # Return data field if present, otherwise return full response
            return response_data.get("data", response_data)

        return response_data

    async def _log_request(
        self,
        method: HttpMethod,
        url: str,
        response: ClientResponse,
        options: RequestOptions
    ) -> None:
        """Log request information if logging is enabled

        Args:
            method: HTTP method
            url: Request URL
            response: HTTP response
            options: Request options
        """
        if self.config.logging and self.config.logger:
            self.config.logger.debug(
                f"HTTP {method.value} {url} -> {response.status} "
                f"({response.headers.get('content-length', 'unknown')} bytes)"
            )

    async def _handle_error(
        self,
        error: Exception,
        method: HttpMethod,
        url: str,
        options: RequestOptions
    ) -> None:
        """Handle error through middleware

        Args:
            error: Exception that occurred
            method: HTTP method
            url: Request URL
            options: Request options
        """
        for middleware in self.error_middleware:
            try:
                await middleware(error, method, url, options)
            except Exception:
                # Don't let middleware errors affect the main error flow
                pass

    def _get_cache_key(self, url: str, params: Optional[Dict[str, Any]]) -> Optional[str]:
        """Generate cache key for GET request

        Args:
            url: Request URL
            params: Query parameters

        Returns:
            Cache key or None if caching is not applicable
        """
        if not params:
            return url

        # Create URL builder to serialize parameters consistently
        builder = UrlBuilder(url)
        builder.params(params)
        return builder.build()

    # Convenience methods
    async def get(self, path: str, params: Optional[Dict[str, Any]] = None, **kwargs) -> Any:
        """Make GET request"""
        options = RequestOptions(params=params)
        return await self.request(HttpMethod.GET, path, options, **kwargs)

    async def post(self, path: str, data: Any = None, **kwargs) -> Any:
        """Make POST request"""
        options = RequestOptions(body=data)
        return await self.request(HttpMethod.POST, path, options, **kwargs)

    async def put(self, path: str, data: Any = None, **kwargs) -> Any:
        """Make PUT request"""
        options = RequestOptions(body=data)
        return await self.request(HttpMethod.PUT, path, options, **kwargs)

    async def patch(self, path: str, data: Any = None, **kwargs) -> Any:
        """Make PATCH request"""
        options = RequestOptions(body=data)
        return await self.request(HttpMethod.PATCH, path, options, **kwargs)

    async def delete(self, path: str, **kwargs) -> Any:
        """Make DELETE request"""
        return await self.request(HttpMethod.DELETE, path, **kwargs)

    # Middleware management
    def add_request_middleware(self, middleware: Callable) -> None:
        """Add request middleware"""
        self.request_middleware.append(middleware)

    def add_response_middleware(self, middleware: Callable) -> None:
        """Add response middleware"""
        self.response_middleware.append(middleware)

    def add_error_middleware(self, middleware: Callable) -> None:
        """Add error middleware"""
        self.error_middleware.append(middleware)

    # Cache management
    def clear_cache(self) -> None:
        """Clear all cache entries"""
        self.cache.clear()

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        return self.cache.get_stats()

    # Rate limiting
    def get_rate_limit_info(self) -> RateLimitInfo:
        """Get current rate limit information"""
        stats = self.rate_limiter.get_stats()
        return RateLimitInfo(
            current=stats["current_window_requests"],
            limit=self.rate_limiter.requests_per_second,
            remaining=max(0, self.rate_limiter.requests_per_second - stats["current_window_requests"]),
            reset_time=int(time.time() * 1000) + 1000,  # Next window start
            window_duration=1000,  # 1 second
        )

    def reset_rate_limit(self) -> None:
        """Reset rate limiter"""
        self.rate_limiter.reset()

    # Statistics
    def get_stats(self) -> Dict[str, Any]:
        """Get client statistics"""
        return {
            **self.stats,
            "cache_stats": self.get_cache_stats(),
            "rate_limit_stats": self.rate_limiter.get_stats(),
        }

    # URL building
    def create_url_builder(self) -> UrlBuilder:
        """Create URL builder for this client"""
        return UrlBuilder(self.config.gateway_url)

    # Configuration
    def update_config(self, **updates) -> None:
        """Update client configuration"""
        for key, value in updates.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)

            # Update dependent configurations
            if key == "rate_limit" and value:
                self.rate_limiter = RateLimiter(
                    requests_per_second=value.requests_per_second
                )
            elif key == "cache_max_size" and value:
                self.cache.max_size = value
            elif key == "cache_ttl" and value:
                self.cache.default_ttl = value

    def get_base_url(self) -> str:
        """Get base URL"""
        return self.config.gateway_url

    def get_network_config(self) -> NetworkConfig:
        """Get network configuration"""
        return NetworkConfig(
            gateway_url=self.config.gateway_url,
            network=self.config.network,
            timeout=self.config.timeout,
            retry_attempts=self.config.retry_attempts,
            retry_delay=self.config.retry_delay,
            headers=self.config.headers,
        )