"""Main Orange Network SDK class"""

import asyncio
import time
from typing import Any, Dict, Optional

from .types import (
    SDKConfig,
    NetworkConfig,
    AuthConfig,
    NetworkType,
    AuthMethod,
    GatewayInfo,
    NodeInfo,
    HealthCheckResult,
)
from .errors import OrangeNetworkError, ValidationError
from .client import HttpClient
from .client.config import HttpClientConfig
from .auth import AuthManager, TokenInfo, create_api_key_auth, create_jwt_auth, create_oauth_auth
from .subscriptions import SubscriptionManager
from .utils import get_logger, DefaultLogger


class OrangeNetworkSDK:
    """Main Orange Network SDK class"""

    def __init__(self, config: SDKConfig):
        """Initialize SDK

        Args:
            config: SDK configuration

        Raises:
            ValidationError: If configuration is invalid
        """
        self._validate_config(config)
        self.config = config

        # Initialize logger
        if config.logger:
            self.logger = config.logger
        else:
            self.logger = DefaultLogger("orange_network")
            if config.debug:
                self.logger._logger.setLevel("DEBUG")

        # Initialize authentication
        self.auth = self._create_auth_manager(config.auth)

        # Initialize HTTP client
        client_config = HttpClientConfig(
            gateway_url=config.gateway_url,
            network=config.network.value,
            timeout=config.timeout,
            retry_attempts=config.retry_attempts,
            retry_delay=config.retry_delay,
            headers=config.headers,
            auth=self.auth,
            logging=config.debug,
            logger=self.logger,
            rate_limit=config.rate_limit,
        )
        self.client = HttpClient(client_config)

        # Initialize subscription manager
        self.subscriptions = SubscriptionManager(self.client)

        self._log_debug("Orange Network SDK initialized")

    def _validate_config(self, config: SDKConfig) -> None:
        """Validate SDK configuration"""
        if not config.gateway_url:
            raise ValidationError("Gateway URL is required")

        if not config.auth:
            raise ValidationError("Authentication configuration is required")

        # Validate network
        if config.network not in NetworkType:
            raise ValidationError(f"Invalid network: {config.network}. Must be one of {list(NetworkType)}")

        # Validate URL format
        if not config.gateway_url.startswith(('http://', 'https://')):
            raise ValidationError("Gateway URL must start with http:// or https://")

    def _create_auth_manager(self, auth_config: AuthConfig) -> AuthManager:
        """Create authentication manager from configuration"""
        if auth_config.method == AuthMethod.API_KEY:
            if not auth_config.api_key:
                raise ValidationError("API key is required for API key authentication")
            return create_api_key_auth(auth_config.api_key)

        elif auth_config.method == AuthMethod.JWT:
            if not auth_config.jwt or not auth_config.jwt.token:
                raise ValidationError("JWT token is required for JWT authentication")
            return create_jwt_auth(
                auth_config.jwt.token,
                auth_config.jwt.refresh_token,
                auth_config.jwt.expires_at,
            )

        elif auth_config.method == AuthMethod.OAUTH:
            if not auth_config.oauth or not auth_config.oauth.token:
                raise ValidationError("OAuth token is required for OAuth authentication")
            return create_oauth_auth(
                auth_config.oauth.token,
                auth_config.oauth.refresh_token,
                None,  # expires_in - will be calculated from expires_at
                auth_config.oauth.token_type,
            )

        else:
            raise ValidationError(f"Unsupported authentication method: {auth_config.method}")

    def _log_debug(self, message: str) -> None:
        """Log debug message if debug mode is enabled"""
        if self.config.debug:
            self.logger.debug(message)

    def _log_info(self, message: str) -> None:
        """Log info message"""
        self.logger.info(message)

    def _log_error(self, message: str, error: Optional[Exception] = None) -> None:
        """Log error message"""
        self.logger.error(message, error)

    # Core API methods
    async def get_gateway_info(self) -> GatewayInfo:
        """Get gateway information

        Returns:
            Gateway information

        Raises:
            OrangeNetworkError: On API error
        """
        try:
            response = await self.client.get("/gateway/info")
            return GatewayInfo(**response)
        except Exception as e:
            raise OrangeNetworkError(f"Failed to get gateway info: {e}") from e

    async def check_health(self) -> HealthCheckResult:
        """Check gateway health

        Returns:
            Health check result

        Raises:
            OrangeNetworkError: On API error
        """
        try:
            response = await self.client.get("/health")
            return HealthCheckResult(**response)
        except Exception as e:
            raise OrangeNetworkError(f"Failed to check health: {e}") from e

    async def get_nodes(self) -> list[NodeInfo]:
        """Get available nodes

        Returns:
            List of node information

        Raises:
            OrangeNetworkError: On API error
        """
        try:
            response = await self.client.get("/nodes")
            return [NodeInfo(**node) for node in response]
        except Exception as e:
            raise OrangeNetworkError(f"Failed to get nodes: {e}") from e

    async def test_connection(self) -> dict:
        """Test connection to gateway

        Returns:
            Dictionary with connection test results

        Raises:
            OrangeNetworkError: On test failure
        """
        start_time = time.time()

        try:
            health_result = await self.check_health()
            latency = int((time.time() - start_time) * 1000)

            return {
                "success": True,
                "latency": latency,
                "health": health_result,
            }
        except Exception as e:
            latency = int((time.time() - start_time) * 1000)
            return {
                "success": False,
                "latency": latency,
                "error": str(e),
            }

    # Transaction methods (placeholder - will be enhanced in transactions module)
    async def send_transaction(self, transaction: Any) -> dict:
        """Send transaction to network

        Args:
            transaction: Transaction data

        Returns:
            Transaction submission result

        Raises:
            OrangeNetworkError: On submission error
        """
        try:
            return await self.client.post("/transactions", transaction)
        except Exception as e:
            raise OrangeNetworkError(f"Failed to send transaction: {e}") from e

    async def get_transaction(self, tx_id: str) -> dict:
        """Get transaction information

        Args:
            tx_id: Transaction ID

        Returns:
            Transaction information

        Raises:
            OrangeNetworkError: On API error
        """
        try:
            return await self.client.get(f"/transactions/{tx_id}")
        except Exception as e:
            raise OrangeNetworkError(f"Failed to get transaction {tx_id}: {e}") from e

    # Configuration methods
    def update_config(self, updates: dict) -> None:
        """Update SDK configuration

        Args:
            updates: Configuration updates
        """
        for key, value in updates.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)

        # Update client configuration
        if any(key in updates for key in ["gateway_url", "network", "timeout", "headers", "rate_limit"]):
            self.client.update_config(**{
                key: value for key, value in updates.items()
                if hasattr(self.client.config, key)
            })

        # Update authentication
        if "auth" in updates:
            self.auth = self._create_auth_manager(updates["auth"])
            self.client.auth = self.auth

    def get_config(self) -> dict:
        """Get current SDK configuration (without sensitive data)

        Returns:
            Configuration dictionary
        """
        return {
            "gateway_url": self.config.gateway_url,
            "network": self.config.network.value,
            "timeout": self.config.timeout,
            "retry_attempts": self.config.retry_attempts,
            "retry_delay": self.config.retry_delay,
            "debug": self.config.debug,
            "auth": self.auth.get_config(),
            "rate_limit": {
                "requests_per_second": self.config.rate_limit.requests_per_second,
                "max_concurrent": self.config.rate_limit.max_concurrent,
            } if self.config.rate_limit else None,
            "websocket": {
                "auto_reconnect": self.config.websocket.auto_reconnect,
                "max_reconnect_attempts": self.config.websocket.max_reconnect_attempts,
                "reconnect_delay": self.config.websocket.reconnect_delay,
                "timeout": self.config.websocket.timeout,
                "heartbeat_interval": self.config.websocket.heartbeat_interval,
            } if self.config.websocket else None,
        }

    # Statistics and monitoring
    def get_stats(self) -> dict:
        """Get SDK statistics

        Returns:
            Statistics dictionary
        """
        return {
            "client": self.client.get_stats(),
            "cache": self.client.get_cache_stats(),
            "rate_limit": self.client.get_rate_limit_info(),
        }

    # Utility methods
    def get_http_client(self) -> HttpClient:
        """Get HTTP client instance for custom requests

        Returns:
            HTTP client instance
        """
        return self.client

    def get_auth(self) -> AuthManager:
        """Get authentication manager

        Returns:
            Authentication manager
        """
        return self.auth

    def get_subscriptions(self) -> SubscriptionManager:
        """Get subscription manager

        Returns:
            Subscription manager
        """
        return self.subscriptions

    # Cleanup
    async def close(self) -> None:
        """Close SDK and cleanup resources"""
        try:
            # Clear HTTP client cache
            self.client.clear_cache()

            # Reset rate limiter
            self.client.reset_rate_limit()

            self._log_debug("Orange Network SDK closed")
        except Exception as e:
            self._log_error("Error during SDK cleanup", e)

    # Class methods for convenient initialization
    @classmethod
    def with_api_key(
        cls,
        gateway_url: str,
        api_key: str,
        network: NetworkType = NetworkType.MAINNET,
        **kwargs
    ) -> "OrangeNetworkSDK":
        """Create SDK instance with API key authentication

        Args:
            gateway_url: Gateway base URL
            api_key: API key
            network: Algorand network
            **kwargs: Additional configuration options

        Returns:
            SDK instance
        """
        config = SDKConfig(
            gateway_url=gateway_url,
            network=network,
            auth=AuthConfig(method=AuthMethod.API_KEY, api_key=api_key),
            **kwargs
        )
        return cls(config)

    @classmethod
    def with_jwt(
        cls,
        gateway_url: str,
        token: str,
        refresh_token: Optional[str] = None,
        network: NetworkType = NetworkType.MAINNET,
        **kwargs
    ) -> "OrangeNetworkSDK":
        """Create SDK instance with JWT authentication

        Args:
            gateway_url: Gateway base URL
            token: JWT token
            refresh_token: JWT refresh token
            network: Algorand network
            **kwargs: Additional configuration options

        Returns:
            SDK instance
        """
        from .types import JWTConfig
        config = SDKConfig(
            gateway_url=gateway_url,
            network=network,
            auth=AuthConfig(
                method=AuthMethod.JWT,
                jwt=JWTConfig(token=token, refresh_token=refresh_token)
            ),
            **kwargs
        )
        return cls(config)

    @classmethod
    def with_oauth(
        cls,
        gateway_url: str,
        access_token: str,
        refresh_token: Optional[str] = None,
        network: NetworkType = NetworkType.MAINNET,
        **kwargs
    ) -> "OrangeNetworkSDK":
        """Create SDK instance with OAuth authentication

        Args:
            gateway_url: Gateway base URL
            access_token: OAuth access token
            refresh_token: OAuth refresh token
            network: Algorand network
            **kwargs: Additional configuration options

        Returns:
            SDK instance
        """
        from .types import OAuthConfig
        config = SDKConfig(
            gateway_url=gateway_url,
            network=network,
            auth=AuthConfig(
                method=AuthMethod.OAUTH,
                oauth=OAuthConfig(token=access_token, refresh_token=refresh_token)
            ),
            **kwargs
        )
        return cls(config)

    @classmethod
    def from_env(cls, network: NetworkType = NetworkType.MAINNET, **kwargs) -> "OrangeNetworkSDK":
        """Create SDK instance from environment variables

        Args:
            network: Algorand network
            **kwargs: Additional configuration options

        Returns:
            SDK instance

        Raises:
            ValidationError: If required environment variables are not set
        """
        import os

        gateway_url = os.getenv("ORANGE_GATEWAY_URL")
        api_key = os.getenv("ORANGE_API_KEY")
        jwt_token = os.getenv("ORANGE_JWT_TOKEN")

        if not gateway_url:
            raise ValidationError("ORANGE_GATEWAY_URL environment variable is required")

        if api_key:
            return cls.with_api_key(gateway_url, api_key, network, **kwargs)
        elif jwt_token:
            return cls.with_jwt(gateway_url, jwt_token, None, network, **kwargs)
        else:
            raise ValidationError("Either ORANGE_API_KEY or ORANGE_JWT_TOKEN environment variable is required")

    # Version information
    @staticmethod
    def get_version() -> str:
        """Get SDK version

        Returns:
            Version string
        """
        return "1.0.0"

    def __repr__(self) -> str:
        """Developer representation"""
        return f"OrangeNetworkSDK(gateway_url='{self.config.gateway_url}', network='{self.config.network.value}')"