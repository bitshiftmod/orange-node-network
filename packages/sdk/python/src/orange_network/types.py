"""Core types for the Orange Network Python SDK"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union, Callable, Literal
from enum import Enum
import time


class NetworkType(str, Enum):
    """Algorand network types"""
    MAINNET = "mainnet"
    TESTNET = "testnet"
    BETANET = "betanet"


class AuthMethod(str, Enum):
    """Authentication methods"""
    API_KEY = "api-key"
    JWT = "jwt"
    OAUTH = "oauth"


class SubscriptionTier(str, Enum):
    """Subscription tiers"""
    BASIC = "basic"
    PREMIUM = "premium"
    ENTERPRISE = "enterprise"


class SubscriptionStatus(str, Enum):
    """Subscription status"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class EventType(str, Enum):
    """Event types for real-time updates"""
    NODE_HEALTH = "node:health"
    NODE_ADDED = "node:added"
    NODE_REMOVED = "node:removed"
    TRANSACTION_CONFIRMED = "transaction:confirmed"
    SUBSCRIPTION_CREATED = "subscription:created"
    SUBSCRIPTION_EXPIRED = "subscription:expired"
    GATEWAY_STATUS = "gateway:status"
    RATE_LIMIT_WARNING = "rate-limit:warning"


class HttpMethod(str, Enum):
    """HTTP methods"""
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    DELETE = "DELETE"
    PATCH = "PATCH"


@dataclass
class NetworkConfig:
    """Network configuration"""
    gateway_url: str
    network: NetworkType
    timeout: int = 30000
    retry_attempts: int = 3
    retry_delay: int = 1000
    headers: Optional[Dict[str, str]] = None


@dataclass
class AuthConfig:
    """Authentication configuration"""
    method: AuthMethod
    api_key: Optional[str] = None
    jwt: Optional["JWTConfig"] = None
    oauth: Optional["OAuthConfig"] = None


@dataclass
class JWTConfig:
    """JWT configuration"""
    token: str
    refresh_token: Optional[str] = None
    expires_at: Optional[int] = None


@dataclass
class OAuthConfig:
    """OAuth configuration"""
    token: str
    token_type: Literal["Bearer"] = "Bearer"
    expires_at: Optional[int] = None
    refresh_token: Optional[str] = None


@dataclass
class RateLimitConfig:
    """Rate limiting configuration"""
    requests_per_second: int = 10
    max_concurrent: int = 5


@dataclass
class WebSocketOptions:
    """WebSocket connection options"""
    auto_reconnect: bool = True
    max_reconnect_attempts: int = 5
    reconnect_delay: int = 2000
    timeout: int = 30000
    heartbeat_interval: int = 30000


@dataclass
class SDKConfig:
    """SDK configuration options"""
    gateway_url: str
    network: NetworkType
    auth: AuthConfig
    timeout: int = 30000
    retry_attempts: int = 3
    retry_delay: int = 1000
    headers: Optional[Dict[str, str]] = None
    debug: bool = False
    logger: Optional["Logger"] = None
    websocket: Optional[WebSocketOptions] = None
    rate_limit: Optional[RateLimitConfig] = None


@dataclass
class NodeInfo:
    """Node information from the gateway"""
    address: str
    friendly_name: str
    fqdn: str
    port: int
    network: str
    version: str
    geolocation: str
    stake_weight: int
    is_active: bool
    is_healthy: bool
    last_health_check: int
    total_requests: int
    successful_requests: int
    failed_requests: int
    average_response_time: float


@dataclass
class GatewayInfo:
    """Gateway information"""
    address: str
    friendly_name: str
    fqdn: str
    port: int
    owner: str
    network: str
    version: str
    max_connections: int
    supported_methods: List[str]
    geolocation: str
    is_active: bool
    is_healthy: bool
    last_health_check: int
    total_requests: int
    successful_requests: int
    failed_requests: int
    average_response_time: float


@dataclass
class HealthCheckResult:
    """Health check result"""
    node_id: str
    is_healthy: bool
    response_time: int
    error: Optional[str] = None
    timestamp: int = field(default_factory=lambda: int(time.time() * 1000))


@dataclass
class RequestLog:
    """Request/response logging information"""
    timestamp: int
    method: str
    path: str
    status_code: int
    response_time: int
    node_used: Optional[str] = None
    user_agent: Optional[str] = None
    ip: str = ""
    request_id: str = ""


@dataclass
class Subscription:
    """Subscription information"""
    id: str
    subscriber: str
    tier: SubscriptionTier
    status: SubscriptionStatus
    starts_at: int
    ends_at: int
    amount: int  # in microAlgos
    billing_period: int  # in seconds
    auto_renew: bool
    features: List[str]
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class TransactionInfo:
    """Transaction information"""
    tx_id: str
    sender: str
    receiver: Optional[str] = None
    amount: Optional[int] = None
    fee: int = 0
    first_round: int = 0
    last_round: int = 0
    note: Optional[str] = None
    type: str = ""
    confirmed: bool = False
    confirmed_round: Optional[int] = None
    block_time: Optional[int] = None


@dataclass
class ApiResponse:
    """API response wrapper"""
    success: bool
    data: Optional[Any] = None
    error: Optional["ErrorInfo"] = None
    meta: Optional["ResponseMeta"] = None


@dataclass
class ErrorInfo:
    """Error information"""
    code: str
    message: str
    details: Optional[Any] = None


@dataclass
class ResponseMeta:
    """Response metadata"""
    request_id: str
    timestamp: int
    version: str


@dataclass
class PaginatedResponse(ApiResponse):
    """Paginated response"""
    pagination: Optional["PaginationInfo"] = None


@dataclass
class PaginationInfo:
    """Pagination information"""
    page: int
    limit: int
    total: int
    total_pages: int
    has_next: bool
    has_prev: bool


@dataclass
class RateLimitInfo:
    """Rate limit information"""
    current: int
    limit: int
    remaining: int
    reset_time: int
    window_duration: int


@dataclass
class EventData:
    """Real-time event data"""
    type: EventType
    timestamp: int
    id: str
    payload: Any
    source: str


@dataclass
class RetryConfig:
    """Retry configuration"""
    max_attempts: int = 3
    base_delay: int = 1000
    max_delay: int = 30000
    backoff_factor: float = 2.0
    jitter: bool = True


@dataclass
class CacheOptions:
    """Cache options"""
    enabled: bool = True
    ttl: int = 300000  # 5 minutes
    max_size: int = 100
    strategy: Literal["lru", "fifo", "lfu"] = "lru"


@dataclass
class RequestOptions:
    """Request options"""
    method: Optional[HttpMethod] = None
    headers: Optional[Dict[str, str]] = None
    body: Optional[Any] = None
    params: Optional[Dict[str, Any]] = None
    timeout: Optional[int] = None
    retry_attempts: Optional[int] = None
    skip_rate_limit: bool = False


class Logger:
    """Logger interface"""
    def debug(self, message: str, *args: Any) -> None:
        """Log debug message"""
        pass

    def info(self, message: str, *args: Any) -> None:
        """Log info message"""
        pass

    def warning(self, message: str, *args: Any) -> None:
        """Log warning message"""
        pass

    def error(self, message: str, error: Optional[Exception] = None, *args: Any) -> None:
        """Log error message"""
        pass


# Type aliases
EventListener = Callable[[EventData], None]
JSONType = Union[Dict[str, Any], List[Any], str, int, float, bool, None]