"""Custom exceptions for the Orange Network Python SDK"""

from typing import Any, Dict, Optional


class OrangeNetworkError(Exception):
    """Base exception for all Orange Network SDK errors"""

    def __init__(
        self,
        message: str,
        code: Optional[str] = None,
        status_code: int = 0,
        details: Optional[Dict[str, Any]] = None,
        retryable: bool = False,
    ):
        super().__init__(message)
        self.message = message
        self.code = code or "UNKNOWN_ERROR"
        self.status_code = status_code
        self.details = details or {}
        self.retryable = retryable

    def __str__(self) -> str:
        return f"[{self.code}] {self.message}"

    def to_dict(self) -> Dict[str, Any]:
        """Convert error to dictionary for serialization"""
        return {
            "error": self.__class__.__name__,
            "code": self.code,
            "message": self.message,
            "status_code": self.status_code,
            "details": self.details,
            "retryable": self.retryable,
        }


class NetworkError(OrangeNetworkError):
    """Network-related errors"""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="NETWORK_ERROR",
            status_code=0,
            details=details,
            retryable=True,
        )


class TimeoutError(NetworkError):
    """Request timeout errors"""

    def __init__(self, message: str, timeout: int, details: Optional[Dict[str, Any]] = None):
        super().__init__(message, {**details or {}, "timeout": timeout})
        self.timeout = timeout


class ConnectionError(NetworkError):
    """Connection errors"""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message, details)


class AuthenticationError(OrangeNetworkError):
    """Authentication and authorization errors"""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="AUTHENTICATION_ERROR",
            status_code=401,
            details=details,
            retryable=False,
        )


class UnauthorizedError(AuthenticationError):
    """Unauthorized access errors"""

    def __init__(self, message: str = "Unauthorized access"):
        super().__init__(message, {"type": "unauthorized"})


class ForbiddenError(AuthenticationError):
    """Forbidden access errors"""

    def __init__(self, message: str = "Access forbidden"):
        super().__init__(message, {"type": "forbidden"})


class InvalidTokenError(AuthenticationError):
    """Invalid token errors"""

    def __init__(self, message: str = "Invalid authentication token"):
        super().__init__(message, {"type": "invalid_token"})


class ExpiredTokenError(AuthenticationError):
    """Expired token errors"""

    def __init__(self, message: str = "Authentication token has expired"):
        super().__init__(message, {"type": "expired_token"})


class ValidationError(OrangeNetworkError):
    """Validation errors"""

    def __init__(self, message: str, field: Optional[str] = None, value: Any = None):
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            status_code=400,
            details={"field": field, "value": value} if field else {},
            retryable=False,
        )
        self.field = field
        self.value = value


class InvalidAddressError(ValidationError):
    """Invalid Algorand address errors"""

    def __init__(self, address: str):
        super().__init__(
            f"Invalid Algorand address: {address}",
            field="address",
            value=address,
        )
        self.address = address


class InvalidTransactionError(ValidationError):
    """Invalid transaction errors"""

    def __init__(self, message: str, transaction: Optional[Dict[str, Any]] = None):
        super().__init__(
            message,
            field="transaction",
            value=transaction,
        )
        self.transaction = transaction


class TransactionError(OrangeNetworkError):
    """Transaction-related errors"""

    def __init__(self, message: str, tx_id: Optional[str] = None, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="TRANSACTION_ERROR",
            status_code=400,
            details={**details or {}, "tx_id": tx_id} if tx_id else details,
            retryable=True,
        )
        self.tx_id = tx_id


class InsufficientFundsError(TransactionError):
    """Insufficient balance errors"""

    def __init__(self, message: str = "Insufficient funds for transaction"):
        super().__init__(message, None, {"type": "insufficient_funds"})


class InvalidSignatureError(TransactionError):
    """Invalid signature errors"""

    def __init__(self, message: str = "Invalid transaction signature"):
        super().__init__(message, None, {"type": "invalid_signature"})


class TransactionFailedError(TransactionError):
    """Transaction failed to confirm"""

    def __init__(self, message: str, tx_id: str, round: Optional[int] = None):
        super().__init__(message, tx_id, {"round": round, "type": "failed"})
        self.round = round


class RateLimitError(OrangeNetworkError):
    """Rate limiting errors"""

    def __init__(
        self,
        message: str,
        reset_time: int,
        limit: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(
            message=message,
            code="RATE_LIMITED",
            status_code=429,
            details={**details or {}, "reset_time": reset_time, "limit": limit} if limit else details,
            retryable=True,
        )
        self.reset_time = reset_time
        self.limit = limit


class QuotaExceededError(OrangeNetworkError):
    """Quota exceeded errors"""

    def __init__(self, message: str = "API quota exceeded", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="QUOTA_EXCEEDED",
            status_code=429,
            details=details,
            retryable=False,
        )


class ResourceError(OrangeNetworkError):
    """Resource-related errors"""

    def __init__(self, message: str, resource_type: str, resource_id: str):
        super().__init__(
            message=message,
            code="RESOURCE_ERROR",
            status_code=404,
            details={"resource_type": resource_type, "resource_id": resource_id},
            retryable=False,
        )
        self.resource_type = resource_type
        self.resource_id = resource_id


class NotFoundError(ResourceError):
    """Resource not found errors"""

    def __init__(self, resource_type: str, resource_id: str):
        super().__init__(
            f"{resource_type.capitalize()} not found: {resource_id}",
            resource_type,
            resource_id,
        )


class ResourceLimitError(ResourceError):
    """Resource limit exceeded errors"""

    def __init__(self, message: str, resource_type: str, limit: Optional[int] = None):
        super().__init__(
            message,
            resource_type,
            "",
        )
        self.limit = limit
        if limit:
            self.details["limit"] = limit


class SystemError(OrangeNetworkError):
    """System-level errors"""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="SYSTEM_ERROR",
            status_code=500,
            details=details,
            retryable=True,
        )


class InternalError(SystemError):
    """Internal server errors"""

    def __init__(self, message: str = "Internal server error", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, details)


class ServiceUnavailableError(SystemError):
    """Service unavailable errors"""

    def __init__(self, message: str = "Service temporarily unavailable"):
        super().__init__(message, {"type": "service_unavailable"})


class MaintenanceModeError(SystemError):
    """Maintenance mode errors"""

    def __init__(self, message: str = "Service under maintenance"):
        super().__init__(message, {"type": "maintenance"}, retryable=False)


class SubscriptionError(OrangeNetworkError):
    """Subscription-related errors"""

    def __init__(self, message: str, subscription_id: Optional[str] = None, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="SUBSCRIPTION_ERROR",
            status_code=400,
            details={**details or {}, "subscription_id": subscription_id} if subscription_id else details,
            retryable=False,
        )
        self.subscription_id = subscription_id


class SubscriptionRequiredError(SubscriptionError):
    """Subscription required errors"""

    def __init__(self, message: str = "Active subscription required"):
        super().__init__(message, None, {"type": "subscription_required"})


class SubscriptionExpiredError(SubscriptionError):
    """Subscription expired errors"""

    def __init__(self, subscription_id: str, message: Optional[str] = None):
        super().__init__(
            message or f"Subscription {subscription_id} has expired",
            subscription_id,
            {"type": "expired"},
        )


class SubscriptionInactiveError(SubscriptionError):
    """Subscription inactive errors"""

    def __init__(self, subscription_id: str, message: Optional[str] = None):
        super().__init__(
            message or f"Subscription {subscription_id} is inactive",
            subscription_id,
            {"type": "inactive"},
        )


class WebSocketError(OrangeNetworkError):
    """WebSocket connection errors"""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="WEBSOCKET_ERROR",
            status_code=0,
            details=details,
            retryable=True,
        )


class WebSocketConnectionError(WebSocketError):
    """WebSocket connection errors"""

    def __init__(self, message: str = "Failed to connect to WebSocket"):
        super().__init__(message, {"type": "connection_error"})


class WebSocketClosedError(WebSocketError):
    """WebSocket closed errors"""

    def __init__(self, message: str = "WebSocket connection closed"):
        super().__init__(message, {"type": "connection_closed"})


class ConfigurationError(OrangeNetworkError):
    """Configuration errors"""

    def __init__(self, message: str, field: Optional[str] = None):
        super().__init__(
            message=message,
            code="CONFIGURATION_ERROR",
            status_code=0,
            details={"field": field} if field else {},
            retryable=False,
        )
        self.field = field


class CacheError(OrangeNetworkError):
    """Cache-related errors"""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="CACHE_ERROR",
            status_code=0,
            details=details,
            retryable=False,
        )


# Error code to exception mapping
ERROR_CODE_MAP: Dict[str, type] = {
    "NETWORK_ERROR": NetworkError,
    "TIMEOUT_ERROR": TimeoutError,
    "CONNECTION_ERROR": ConnectionError,
    "UNAUTHORIZED": UnauthorizedError,
    "FORBIDDEN": ForbiddenError,
    "INVALID_TOKEN": InvalidTokenError,
    "EXPIRED_TOKEN": ExpiredTokenError,
    "VALIDATION_ERROR": ValidationError,
    "INVALID_ADDRESS": InvalidAddressError,
    "INVALID_TRANSACTION": InvalidTransactionError,
    "TRANSACTION_FAILED": TransactionFailedError,
    "INSUFFICIENT_FUNDS": InsufficientFundsError,
    "INVALID_SIGNATURE": InvalidSignatureError,
    "RATE_LIMITED": RateLimitError,
    "QUOTA_EXCEEDED": QuotaExceededError,
    "NOT_FOUND": NotFoundError,
    "RESOURCE_LIMITED": ResourceLimitError,
    "INTERNAL_ERROR": InternalError,
    "SERVICE_UNAVAILABLE": ServiceUnavailableError,
    "MAINTENANCE_MODE": MaintenanceModeError,
    "SUBSCRIPTION_REQUIRED": SubscriptionRequiredError,
    "SUBSCRIPTION_EXPIRED": SubscriptionExpiredError,
    "SUBSCRIPTION_INACTIVE": SubscriptionInactiveError,
    "WEBSOCKET_ERROR": WebSocketError,
    "CONFIGURATION_ERROR": ConfigurationError,
    "CACHE_ERROR": CacheError,
}


def create_error_from_response(
    status_code: int,
    message: str,
    code: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> OrangeNetworkError:
    """Create appropriate error from HTTP response"""
    error_code = code or "UNKNOWN_ERROR"

    # Map HTTP status codes to default error types
    if status_code == 401:
        base_error = AuthenticationError
    elif status_code == 403:
        base_error = ForbiddenError
    elif status_code == 404:
        base_error = NotFoundError
    elif status_code == 429:
        base_error = RateLimitError
    elif status_code == 500:
        base_error = InternalError
    elif status_code == 503:
        base_error = ServiceUnavailableError
    else:
        # Use error code mapping if available
        base_error = ERROR_CODE_MAP.get(error_code, OrangeNetworkError)

    # Create appropriate error instance
    if base_error == RateLimitError:
        # For rate limit errors, extract reset time from details
        reset_time = details.get("reset_time", 0) if details else 0
        limit = details.get("limit") if details else None
        return base_error(message, reset_time, limit, details)
    elif base_error in [InvalidAddressError, InvalidTransactionError]:
        return base_error(message, details)
    elif base_error in [NotFoundError, ResourceError]:
        resource_type = details.get("resource_type", "resource") if details else "resource"
        resource_id = details.get("resource_id", "unknown") if details else "unknown"
        return base_error(resource_type, resource_id)
    elif base_error == ValidationError:
        field = details.get("field") if details else None
        value = details.get("value") if details else None
        return base_error(message, field, value)
    elif base_error in [SubscriptionExpiredError, SubscriptionInactiveError]:
        subscription_id = details.get("subscription_id") if details else "unknown"
        return base_error(subscription_id)
    elif base_error == ConfigurationError:
        field = details.get("field") if details else None
        return base_error(message, field)
    else:
        return base_error(message, details)


def is_retryable_error(error: Exception) -> bool:
    """Check if an error is retryable"""
    if isinstance(error, OrangeNetworkError):
        return error.retryable

    # Network errors are typically retryable
    if isinstance(error, (ConnectionError, TimeoutError)):
        return True

    # Default to non-retryable
    return False