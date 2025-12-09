"""Validation utilities"""

import re
from urllib.parse import urlparse
from typing import Any

from ..errors import InvalidAddressError, ValidationError


def is_valid_algorand_address(address: str) -> bool:
    """Validate Algorand address format

    Args:
        address: Address to validate

    Returns:
        True if address is valid, False otherwise
    """
    if not isinstance(address, str):
        return False

    # Algorand addresses are 58 characters long and use base32 encoding
    # They consist of uppercase letters A-Z and digits 2-7
    algorand_address_pattern = r'^[A-Z2-7]{58}$'

    return bool(re.match(algorand_address_pattern, address))


def validate_address(address: str) -> str:
    """Validate and normalize Algorand address

    Args:
        address: Address to validate

    Returns:
        Normalized address in uppercase

    Raises:
        InvalidAddressError: If address is invalid
    """
    if not is_valid_algorand_address(address):
        raise InvalidAddressError(address)

    return address.strip().upper()


def is_valid_url(url: str) -> bool:
    """Check if URL is valid

    Args:
        url: URL to validate

    Returns:
        True if URL is valid, False otherwise
    """
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except Exception:
        return False


def validate_url(url: str) -> str:
    """Validate and normalize URL

    Args:
        url: URL to validate

    Returns:
        Normalized URL

    Raises:
        ValidationError: If URL is invalid
    """
    if not is_valid_url(url):
        raise ValidationError(f"Invalid URL: {url}", field="url", value=url)

    # Add scheme if missing
    if not url.startswith(('http://', 'https://')):
        url = f'https://{url}'

    return url.rstrip('/')


def validate_positive_int(value: Any, field_name: str = "value") -> int:
    """Validate that value is a positive integer

    Args:
        value: Value to validate
        field_name: Name of the field for error messages

    Returns:
        Validated integer value

    Raises:
        ValidationError: If value is not a positive integer
    """
    if not isinstance(value, int) or value <= 0:
        raise ValidationError(
            f"{field_name} must be a positive integer",
            field=field_name,
            value=value,
        )
    return value


def validate_non_negative_int(value: Any, field_name: str = "value") -> int:
    """Validate that value is a non-negative integer

    Args:
        value: Value to validate
        field_name: Name of the field for error messages

    Returns:
        Validated integer value

    Raises:
        ValidationError: If value is not a non-negative integer
    """
    if not isinstance(value, int) or value < 0:
        raise ValidationError(
            f"{field_name} must be a non-negative integer",
            field=field_name,
            value=value,
        )
    return value


def validate_string(value: Any, field_name: str = "value", min_length: int = 0, max_length: int = None) -> str:
    """Validate that value is a string with optional length constraints

    Args:
        value: Value to validate
        field_name: Name of the field for error messages
        min_length: Minimum allowed length
        max_length: Maximum allowed length

    Returns:
        Validated string value

    Raises:
        ValidationError: If value is not a valid string
    """
    if not isinstance(value, str):
        raise ValidationError(
            f"{field_name} must be a string",
            field=field_name,
            value=value,
        )

    if len(value) < min_length:
        raise ValidationError(
            f"{field_name} must be at least {min_length} characters long",
            field=field_name,
            value=value,
        )

    if max_length is not None and len(value) > max_length:
        raise ValidationError(
            f"{field_name} must be no more than {max_length} characters long",
            field=field_name,
            value=value,
        )

    return value


def validate_email(email: str) -> str:
    """Validate email address

    Args:
        email: Email address to validate

    Returns:
        Validated email address

    Raises:
        ValidationError: If email is invalid
    """
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

    if not re.match(email_pattern, email):
        raise ValidationError("Invalid email address", field="email", value=email)

    return email.lower().strip()


def validate_choice(value: Any, choices: list, field_name: str = "value") -> Any:
    """Validate that value is one of the allowed choices

    Args:
        value: Value to validate
        choices: List of allowed choices
        field_name: Name of the field for error messages

    Returns:
        Validated value

    Raises:
        ValidationError: If value is not in choices
    """
    if value not in choices:
        raise ValidationError(
            f"{field_name} must be one of {choices}",
            field=field_name,
            value=value,
        )

    return value


def validate_dict(value: Any, field_name: str = "value", required_keys: list = None) -> dict:
    """Validate that value is a dictionary

    Args:
        value: Value to validate
        field_name: Name of the field for error messages
        required_keys: List of required keys

    Returns:
        Validated dictionary

    Raises:
        ValidationError: If value is not a valid dictionary
    """
    if not isinstance(value, dict):
        raise ValidationError(
            f"{field_name} must be a dictionary",
            field=field_name,
            value=value,
        )

    if required_keys:
        missing_keys = [key for key in required_keys if key not in value]
        if missing_keys:
            raise ValidationError(
                f"{field_name} is missing required keys: {missing_keys}",
                field=field_name,
                value=value,
            )

    return value


def validate_list(value: Any, field_name: str = "value", item_type: type = None, min_length: int = 0, max_length: int = None) -> list:
    """Validate that value is a list with optional type and length constraints

    Args:
        value: Value to validate
        field_name: Name of the field for error messages
        item_type: Expected type for list items
        min_length: Minimum allowed length
        max_length: Maximum allowed length

    Returns:
        Validated list

    Raises:
        ValidationError: If value is not a valid list
    """
    if not isinstance(value, list):
        raise ValidationError(
            f"{field_name} must be a list",
            field=field_name,
            value=value,
        )

    if len(value) < min_length:
        raise ValidationError(
            f"{field_name} must contain at least {min_length} items",
            field=field_name,
            value=value,
        )

    if max_length is not None and len(value) > max_length:
        raise ValidationError(
            f"{field_name} must contain no more than {max_length} items",
            field=field_name,
            value=value,
        )

    if item_type is not None:
        for i, item in enumerate(value):
            if not isinstance(item, item_type):
                raise ValidationError(
                    f"{field_name}[{i}] must be of type {item_type.__name__}",
                    field=f"{field_name}[{i}]",
                    value=item,
                )

    return value


def validate_timestamp(timestamp: Any, field_name: str = "timestamp") -> int:
    """Validate timestamp in milliseconds

    Args:
        timestamp: Timestamp to validate
        field_name: Name of the field for error messages

    Returns:
        Validated timestamp

    Raises:
        ValidationError: If timestamp is invalid
    """
    if not isinstance(timestamp, (int, float)):
        raise ValidationError(
            f"{field_name} must be a number",
            field=field_name,
            value=timestamp,
        )

    # Convert to int and check if it's reasonable (not too far in the past or future)
    timestamp_int = int(timestamp)
    now = int(__import__('time').time() * 1000)

    # Allow timestamps from 1 year ago to 1 year in the future
    min_timestamp = now - (365 * 24 * 60 * 60 * 1000)
    max_timestamp = now + (365 * 24 * 60 * 60 * 1000)

    if timestamp_int < min_timestamp or timestamp_int > max_timestamp:
        raise ValidationError(
            f"{field_name} is out of reasonable range",
            field=field_name,
            value=timestamp_int,
        )

    return timestamp_int