"""JWT utilities for token management"""

import jwt
import time
from typing import Any, Dict, Optional
from ..errors import InvalidTokenError, ExpiredTokenError


def decode_jwt(token: str, verify_signature: bool = False, secret: Optional[str] = None) -> Dict[str, Any]:
    """Decode JWT token

    Args:
        token: JWT token string
        verify_signature: Whether to verify token signature
        secret: Secret key for verification (required if verify_signature is True)

    Returns:
        Decoded JWT payload

    Raises:
        InvalidTokenError: If token is invalid
        ExpiredTokenError: If token is expired
    """
    try:
        if verify_signature:
            if not secret:
                raise InvalidTokenError("Secret key is required for signature verification")
            payload = jwt.decode(token, secret, algorithms=["HS256"])
        else:
            payload = jwt.decode(token, options={"verify_signature": False})

        # Ensure required fields are present
        if not isinstance(payload, dict):
            raise InvalidTokenError("Invalid JWT payload structure")

        return payload

    except jwt.ExpiredSignatureError as e:
        raise ExpiredTokenError("JWT token has expired") from e
    except jwt.InvalidTokenError as e:
        raise InvalidTokenError(f"Invalid JWT token: {e}") from e
    except Exception as e:
        raise InvalidTokenError(f"Failed to decode JWT token: {e}") from e


def verify_jwt(token: str, secret: str, algorithms: Optional[list] = None) -> Dict[str, Any]:
    """Verify JWT token signature and claims

    Args:
        token: JWT token string
        secret: Secret key for verification
        algorithms: List of allowed algorithms (defaults to ["HS256"])

    Returns:
        Verified JWT payload

    Raises:
        InvalidTokenError: If token is invalid
        ExpiredTokenError: If token is expired
    """
    if algorithms is None:
        algorithms = ["HS256"]

    try:
        payload = jwt.decode(token, secret, algorithms=algorithms)
        return payload
    except jwt.ExpiredSignatureError as e:
        raise ExpiredTokenError("JWT token has expired") from e
    except jwt.InvalidTokenError as e:
        raise InvalidTokenError(f"JWT token verification failed: {e}") from e


def create_jwt(
    payload: Dict[str, Any],
    secret: str,
    algorithm: str = "HS256",
    expires_in: Optional[int] = None,
    issued_at: Optional[int] = None,
) -> str:
    """Create JWT token

    Args:
        payload: JWT payload data
        secret: Secret key for signing
        algorithm: Signing algorithm (default: "HS256")
        expires_in: Expiration time in seconds (None for no expiration)
        issued_at: Issued at timestamp in seconds (None for current time)

    Returns:
        JWT token string
    """
    jwt_payload = payload.copy()

    # Add standard claims
    if issued_at is not None:
        jwt_payload["iat"] = issued_at
    else:
        jwt_payload["iat"] = int(time.time())

    if expires_in is not None:
        jwt_payload["exp"] = jwt_payload["iat"] + expires_in

    return jwt.encode(jwt_payload, secret, algorithm=algorithm)


def create_refresh_token(
    user_address: str,
    secret: str,
    algorithm: str = "HS256",
    expires_in: int = 7 * 24 * 60 * 60,  # 7 days
) -> str:
    """Create refresh token

    Args:
        user_address: User's wallet address
        secret: Secret key for signing
        algorithm: Signing algorithm
        expires_in: Expiration time in seconds

    Returns:
        Refresh token string
    """
    payload = {
        "sub": user_address,
        "type": "refresh",
        "purpose": "token_refresh",
    }

    return create_jwt(payload, secret, algorithm, expires_in)


def is_token_expired(token: str) -> bool:
    """Check if JWT token is expired

    Args:
        token: JWT token string

    Returns:
        True if token is expired, False otherwise
    """
    try:
        payload = decode_jwt(token)
        exp = payload.get("exp")
        if exp is None:
            return False  # No expiration claim

        current_time = int(time.time())
        return exp < current_time
    except Exception:
        return True  # Assume expired if can't decode


def get_token_expiration_time(token: str) -> Optional[int]:
    """Get token expiration time

    Args:
        token: JWT token string

    Returns:
        Expiration timestamp in seconds, or None if no expiration
    """
    try:
        payload = decode_jwt(token)
        return payload.get("exp")
    except Exception:
        return None


def extract_token_info(token: str) -> Dict[str, Any]:
    """Extract user information from JWT token

    Args:
        token: JWT token string

    Returns:
        Dictionary with user information
    """
    payload = decode_jwt(token)

    return {
        "address": payload.get("sub") or payload.get("address"),
        "level": payload.get("level", 1),
        "permissions": payload.get("permissions", []),
        "issued_at": payload.get("iat"),
        "expires_at": payload.get("exp"),
        "issuer": payload.get("iss"),
        "audience": payload.get("aud"),
        "token_id": payload.get("jti"),
    }