"""Authentication manager for handling different auth methods"""

import time
from typing import Any, Callable, Dict, Optional, List
from dataclasses import dataclass
from ..types import AuthMethod, AuthConfig
from ..errors import (
    AuthenticationError,
    InvalidTokenError,
    ExpiredTokenError,
    ValidationError,
)
from .jwt_utils import decode_jwt, is_token_expired, get_token_expiration_time, extract_token_info


@dataclass
class TokenInfo:
    """JWT token information"""
    access_token: str
    refresh_token: Optional[str] = None
    expires_at: Optional[int] = None
    token_type: str = "Bearer"


@dataclass
class AuthResponse:
    """Authentication response from login"""
    success: bool
    tokens: TokenInfo
    user: "UserInfo"
    expires_in: int


@dataclass
class UserInfo:
    """User information"""
    address: str
    level: int
    permissions: List[str]


class AuthManager:
    """Authentication manager for handling different auth methods"""

    def __init__(self, config: AuthConfig):
        """Initialize auth manager

        Args:
            config: Authentication configuration
        """
        self.config = config
        self.token_refresh_callbacks: List[Callable[[TokenInfo], None]] = []
        self._validate_config()

    def _validate_config(self) -> None:
        """Validate authentication configuration"""
        if not self.config.method:
            raise ValidationError("Authentication method is required")

        if self.config.method == AuthMethod.API_KEY and not self.config.api_key:
            raise ValidationError("API key is required for API key authentication")

        if self.config.method == AuthMethod.JWT and not self.config.jwt or not self.config.jwt.token:
            raise ValidationError("JWT token is required for JWT authentication")

        if self.config.method == AuthMethod.OAUTH and not self.config.oauth or not self.config.oauth.token:
            raise ValidationError("OAuth token is required for OAuth authentication")

    def get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers for requests

        Returns:
            Dictionary of authentication headers
        """
        headers = {}

        if self.config.method == AuthMethod.API_KEY:
            headers["X-API-Key"] = self.config.api_key or ""

        elif self.config.method == AuthMethod.JWT:
            token = self.config.jwt.token if self.config.jwt else ""
            headers["Authorization"] = f"Bearer {token}"

        elif self.config.method == AuthMethod.OAUTH:
            if self.config.oauth:
                token_type = self.config.oauth.token_type or "Bearer"
                token = self.config.oauth.token
                headers["Authorization"] = f"{token_type} {token}"

        return headers

    def is_valid(self) -> bool:
        """Check if current authentication is valid

        Returns:
            True if authentication is valid, False otherwise
        """
        try:
            if self.config.method == AuthMethod.API_KEY:
                return bool(self.config.api_key)

            elif self.config.method == AuthMethod.JWT:
                if not self.config.jwt or not self.config.jwt.token:
                    return False
                return not is_token_expired(self.config.jwt.token)

            elif self.config.method == AuthMethod.OAUTH:
                if not self.config.oauth or not self.config.oauth.token:
                    return False

                # Check expiration if available
                if self.config.oauth.expires_at:
                    current_time = int(time.time() * 1000)
                    return current_time < self.config.oauth.expires_at

                return True

            return False
        except Exception:
            return False

    def decode_jwt(self, token: str) -> Dict[str, Any]:
        """Decode JWT token

        Args:
            token: JWT token to decode

        Returns:
            Decoded JWT payload

        Raises:
            InvalidTokenError: If token is invalid
        """
        return decode_jwt(token, verify_signature=False)

    def verify_jwt(self, token: str, secret: str) -> Dict[str, Any]:
        """Verify JWT token

        Args:
            token: JWT token to verify
            secret: Secret key for verification

        Returns:
            Verified JWT payload

        Raises:
            InvalidTokenError: If token is invalid
            ExpiredTokenError: If token is expired
        """
        from .jwt_utils import verify_jwt as jwt_verify
        return jwt_verify(token, secret)

    def get_tokens(self) -> Optional[TokenInfo]:
        """Get current JWT tokens

        Returns:
            Current tokens or None if not using JWT authentication
        """
        if self.config.method != AuthMethod.JWT or not self.config.jwt:
            return None

        return TokenInfo(
            access_token=self.config.jwt.token,
            refresh_token=self.config.jwt.refresh_token,
            expires_at=self.config.jwt.expires_at,
            token_type="Bearer",
        )

    def update_tokens(self, tokens: TokenInfo) -> None:
        """Update JWT tokens

        Args:
            tokens: New token information

        Raises:
            ValidationError: If not using JWT authentication
        """
        if self.config.method != AuthMethod.JWT:
            raise ValidationError("Cannot update tokens for non-JWT authentication")

        # Update configuration
        if not self.config.jwt:
            self.config.jwt = type("JWTConfig", (), {})()

        self.config.jwt.token = tokens.access_token
        self.config.jwt.refresh_token = tokens.refresh_token
        self.config.jwt.expires_at = tokens.expires_at

        # Notify callbacks
        for callback in self.token_refresh_callbacks:
            try:
                callback(tokens)
            except Exception as e:
                # Log error but don't fail token update
                print(f"Token refresh callback error: {e}")

    def needs_refresh(self) -> bool:
        """Check if token needs refresh

        Returns:
            True if token should be refreshed, False otherwise
        """
        if self.config.method != AuthMethod.JWT or not self.config.jwt or not self.config.jwt.expires_at:
            return False

        # Refresh if token expires within 5 minutes
        current_time = int(time.time() * 1000)
        refresh_threshold = 5 * 60 * 1000  # 5 minutes in milliseconds

        return (self.config.jwt.expires_at - current_time) <= refresh_threshold

    def get_refresh_token(self) -> Optional[str]:
        """Get refresh token

        Returns:
            Refresh token or None if not available
        """
        if self.config.method == AuthMethod.JWT:
            return self.config.jwt.refresh_token if self.config.jwt else None
        elif self.config.method == AuthMethod.OAUTH:
            return self.config.oauth.refresh_token if self.config.oauth else None
        return None

    def on_token_refresh(self, callback: Callable[[TokenInfo], None]) -> None:
        """Register callback for token refresh events

        Args:
            callback: Function to call when tokens are refreshed
        """
        self.token_refresh_callbacks.append(callback)

    def remove_token_refresh_callback(self, callback: Callable[[TokenInfo], None]) -> None:
        """Remove token refresh callback

        Args:
            callback: Function to remove from callbacks
        """
        if callback in self.token_refresh_callbacks:
            self.token_refresh_callbacks.remove(callback)

    def get_auth_method(self) -> AuthMethod:
        """Get current authentication method

        Returns:
            Current authentication method
        """
        return self.config.method

    def get_user_info(self) -> Optional[UserInfo]:
        """Get user information from authentication

        Returns:
            User information or None if not available
        """
        if self.config.method == AuthMethod.JWT and self.config.jwt and self.config.jwt.token:
            try:
                token_info = extract_token_info(self.config.jwt.token)
                if token_info["address"]:
                    return UserInfo(
                        address=token_info["address"],
                        level=token_info["level"],
                        permissions=token_info["permissions"],
                    )
            except Exception:
                return None

        return None

    def has_permission(self, permission: str) -> bool:
        """Check if user has specific permission

        Args:
            permission: Permission to check

        Returns:
            True if user has permission, False otherwise
        """
        user_info = self.get_user_info()
        if not user_info:
            return False

        return (
            permission in user_info.permissions or
            "*" in user_info.permissions or
            user_info.level >= 10  # Admin level
        )

    def has_minimum_level(self, minimum_level: int) -> bool:
        """Check if user has minimum level

        Args:
            minimum_level: Minimum required level

        Returns:
            True if user has required level, False otherwise
        """
        user_info = self.get_user_info()
        if not user_info:
            return False

        return user_info.level >= minimum_level

    def update_oauth_tokens(
        self,
        access_token: str,
        refresh_token: Optional[str] = None,
        expires_in: Optional[int] = None,
    ) -> None:
        """Update OAuth tokens

        Args:
            access_token: New access token
            refresh_token: New refresh token
            expires_in: Expiration time in seconds

        Raises:
            ValidationError: If not using OAuth authentication
        """
        if self.config.method != AuthMethod.OAUTH:
            raise ValidationError("Cannot update OAuth tokens for non-OAuth authentication")

        # Update configuration
        if not self.config.oauth:
            self.config.oauth = type("OAuthConfig", (), {})()

        self.config.oauth.token = access_token
        if refresh_token:
            self.config.oauth.refresh_token = refresh_token
        if expires_in:
            self.config.oauth.expires_at = int(time.time() * 1000) + (expires_in * 1000)

    def clone(self) -> "AuthManager":
        """Create a clone of this auth manager

        Returns:
            New auth manager with same configuration
        """
        # Deep copy configuration
        import copy
        config_copy = copy.deepcopy(self.config)
        return AuthManager(config_copy)

    def get_config(self) -> Dict[str, Any]:
        """Get configuration without sensitive data

        Returns:
            Safe configuration information
        """
        return {
            "method": self.config.method.value,
            "has_credentials": self.is_valid(),
        }

    @staticmethod
    def create_jwt(
        payload: Dict[str, Any],
        secret: str,
        expires_in: Optional[int] = None,
    ) -> str:
        """Create JWT token

        Args:
            payload: JWT payload
            secret: Secret key
            expires_in: Expiration time in seconds

        Returns:
            JWT token string
        """
        from .jwt_utils import create_jwt as jwt_create
        return jwt_create(payload, secret, expires_in=expires_in)

    @staticmethod
    def create_refresh_token(
        user_address: str,
        secret: str,
        expires_in: int = 7 * 24 * 60 * 60,  # 7 days
    ) -> str:
        """Create refresh token

        Args:
            user_address: User's wallet address
            secret: Secret key
            expires_in: Expiration time in seconds

        Returns:
            Refresh token string
        """
        from .jwt_utils import create_refresh_token as jwt_create_refresh
        return jwt_create_refresh(user_address, secret, expires_in=expires_in)