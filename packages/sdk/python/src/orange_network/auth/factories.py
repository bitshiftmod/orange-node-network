"""Factory functions for creating authentication managers"""

from .manager import AuthManager, TokenInfo
from ..types import AuthConfig, AuthMethod, JWTConfig, OAuthConfig


def create_api_key_auth(api_key: str) -> AuthManager:
    """Create API key authentication manager

    Args:
        api_key: API key for authentication

    Returns:
        AuthManager configured for API key authentication
    """
    config = AuthConfig(
        method=AuthMethod.API_KEY,
        api_key=api_key,
    )
    return AuthManager(config)


def create_jwt_auth(
    access_token: str,
    refresh_token: Optional[str] = None,
    expires_at: Optional[int] = None,
) -> AuthManager:
    """Create JWT authentication manager

    Args:
        access_token: JWT access token
        refresh_token: JWT refresh token
        expires_at: Token expiration timestamp in milliseconds

    Returns:
        AuthManager configured for JWT authentication
    """
    jwt_config = JWTConfig(
        token=access_token,
        refresh_token=refresh_token,
        expires_at=expires_at,
    )

    config = AuthConfig(
        method=AuthMethod.JWT,
        jwt=jwt_config,
    )
    return AuthManager(config)


def create_oauth_auth(
    access_token: str,
    refresh_token: Optional[str] = None,
    expires_in: Optional[int] = None,
    token_type: str = "Bearer",
) -> AuthManager:
    """Create OAuth authentication manager

    Args:
        access_token: OAuth access token
        refresh_token: OAuth refresh token
        expires_in: Token expiration time in seconds
        token_type: Token type (default: "Bearer")

    Returns:
        AuthManager configured for OAuth authentication
    """
    import time

    oauth_config = OAuthConfig(
        token=access_token,
        token_type=token_type,  # type: ignore
        refresh_token=refresh_token,
        expires_at=int(time.time() * 1000) + (expires_in * 1000) if expires_in else None,
    )

    config = AuthConfig(
        method=AuthMethod.OAUTH,
        oauth=oauth_config,
    )
    return AuthManager(config)


def create_auth_from_token_info(token_info: TokenInfo) -> AuthManager:
    """Create JWT authentication manager from TokenInfo

    Args:
        token_info: Token information

    Returns:
        AuthManager configured for JWT authentication
    """
    return create_jwt_auth(
        access_token=token_info.access_token,
        refresh_token=token_info.refresh_token,
        expires_at=token_info.expires_at,
    )