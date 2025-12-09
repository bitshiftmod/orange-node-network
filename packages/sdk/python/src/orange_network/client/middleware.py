"""HTTP client middleware"""

from typing import Any, Callable, Dict, Optional
from ..types import HttpMethod, RequestOptions


# Type aliases for middleware functions
RequestMiddleware = Callable[[Dict[str, str]], Any]
ResponseMiddleware = Callable[[Any], Any]
ErrorMiddleware = Callable[[Exception, HttpMethod, str, RequestOptions], Any]


class MiddlewareManager:
    """Manager for HTTP client middleware"""

    def __init__(self):
        self.request_middleware: list[RequestMiddleware] = []
        self.response_middleware: list[ResponseMiddleware] = []
        self.error_middleware: list[ErrorMiddleware] = []

    def add_request_middleware(self, middleware: RequestMiddleware) -> None:
        """Add request middleware"""
        self.request_middleware.append(middleware)

    def add_response_middleware(self, middleware: ResponseMiddleware) -> None:
        """Add response middleware"""
        self.response_middleware.append(middleware)

    def add_error_middleware(self, middleware: ErrorMiddleware) -> None:
        """Add error middleware"""
        self.error_middleware.append(middleware)

    async def apply_request_middleware(self, headers: Dict[str, str]) -> Dict[str, str]:
        """Apply all request middleware"""
        for middleware in self.request_middleware:
            result = middleware(headers)
            if result is not None:
                if isinstance(result, dict):
                    headers = result
                else:
                    # If middleware returns something other than a dict, ignore it
                    pass
        return headers

    async def apply_response_middleware(self, response_data: Any) -> Any:
        """Apply all response middleware"""
        for middleware in self.response_middleware:
            result = middleware(response_data)
            if result is not None:
                response_data = result
        return response_data

    async def apply_error_middleware(
        self,
        error: Exception,
        method: HttpMethod,
        url: str,
        options: RequestOptions
    ) -> None:
        """Apply all error middleware"""
        for middleware in self.error_middleware:
            try:
                await middleware(error, method, url, options)
            except Exception:
                # Don't let middleware errors affect the main error flow
                pass


# Built-in middleware functions
def request_id_middleware(headers: Dict[str, str]) -> Dict[str, str]:
    """Add request ID header if not present"""
    if "X-Request-ID" not in headers:
        import uuid
        headers["X-Request-ID"] = str(uuid.uuid4())
    return headers


def user_agent_middleware(user_agent: str) -> RequestMiddleware:
    """Create middleware that sets User-Agent header"""
    def middleware(headers: Dict[str, str]) -> Dict[str, str]:
        if "User-Agent" not in headers:
            headers["User-Agent"] = user_agent
        return headers
    return middleware


def response_logging_middleware(logger) -> ResponseMiddleware:
    """Create middleware that logs responses"""
    async def middleware(response_data: Any) -> Any:
        if logger:
            logger.debug(f"Response: {response_data}")
        return response_data
    return middleware


def error_logging_middleware(logger) -> ErrorMiddleware:
    """Create middleware that logs errors"""
    async def middleware(
        error: Exception,
        method: HttpMethod,
        url: str,
        options: RequestOptions
    ) -> None:
        if logger:
            logger.error(f"Request failed: {method.value} {url} - {error}", error=error)
    return middleware


def retry_logging_middleware(logger) -> ErrorMiddleware:
    """Create middleware that logs retry attempts"""
    async def middleware(
        error: Exception,
        method: HttpMethod,
        url: str,
        options: RequestOptions
    ) -> None:
        if logger and hasattr(error, '__retry_count__'):
            logger.warning(f"Retrying request ({error.__retry_count__}): {method.value} {url}")
    return middleware