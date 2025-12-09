"""
Orange Network SDK

Official Python SDK for the Orange Node Network - A decentralized Algorand node infrastructure.

This SDK provides comprehensive access to Orange Network gateway services including:
- REST API client with async support
- WebSocket client for real-time updates
- Authentication and authorization helpers
- Transaction building and signing utilities
- Subscription management
- Comprehensive error handling and retry logic

Example usage:
    ```python
    import asyncio
    from orange_network import OrangeClient

    async def main():
        client = OrangeClient(gateway_url="https://gateway.orange.network")

        # Authenticate
        await client.auth.login(address="YOUR_ALGORAND_ADDRESS")

        # Get node health
        health = await client.nodes.get_health()
        print(f"Network health: {health}")

        # Subscribe to transaction updates
        async for update in client.websocket.subscribe_transactions():
            print(f"Transaction update: {update}")

    asyncio.run(main())
    ```
"""

from typing import Optional

from orange_network.client import OrangeClient
from orange_network.config import Config
from orange_network.exceptions import (
    OrangeNetworkError,
    AuthenticationError,
    APIError,
    WebSocketError,
    TransactionError,
    SubscriptionError,
)
from orange_network.types import (
    NodeInfo,
    GatewayInfo,
    HealthCheckResult,
    TransactionStatus,
    WebSocketMessage,
    AuthTokens,
)
from orange_network.version import __version__, __version_info__

# Configure logging for the SDK
import structlog

# Initialize structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger(__name__)

__all__ = [
    # Main client
    "OrangeClient",
    "Config",

    # Exceptions
    "OrangeNetworkError",
    "AuthenticationError",
    "APIError",
    "WebSocketError",
    "TransactionError",
    "SubscriptionError",

    # Types
    "NodeInfo",
    "GatewayInfo",
    "HealthCheckResult",
    "TransactionStatus",
    "WebSocketMessage",
    "AuthTokens",

    # Version info
    "__version__",
    "__version_info__",
]

# Set default log level
import logging
logging.getLogger(__name__).addHandler(logging.NullHandler())

def get_version() -> str:
    """Get the current SDK version."""
    return __version__

def get_user_agent() -> str:
    """Get the User-Agent string for HTTP requests."""
    return f"orange-network-sdk/{__version__}"

# Configure module-level logger
logger.info("Orange Network SDK initialized", version=__version__)