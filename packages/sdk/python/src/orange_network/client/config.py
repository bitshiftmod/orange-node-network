"""HTTP client configuration"""

from typing import Dict, Optional
from dataclasses import dataclass, field
from ..types import NetworkConfig, RateLimitConfig, CacheOptions


@dataclass
class HttpClientConfig:
    """HTTP client configuration"""
    gateway_url: str
    network: str
    timeout: int = 30000
    retry_attempts: int = 3
    retry_delay: int = 1000
    headers: Optional[Dict[str, str]] = None
    auth = None  # Will be set by the client

    # HTTP client specific options
    logging: bool = False
    logger = None
    cache: bool = True
    cache_ttl: int = 300000  # 5 minutes
    cache_max_size: int = 100
    rate_limit: Optional[RateLimitConfig] = None
    verify_ssl: bool = True
    user_agent: str = "orange-network-python-sdk/1.0.0"