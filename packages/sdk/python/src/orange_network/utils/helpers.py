"""Helper utilities"""

import asyncio
import time
import uuid
import copy
import random
import string
from typing import Any, Dict, List, Optional, Callable, TypeVar, Union
from urllib.parse import urljoin, urlparse

T = TypeVar('T')


def generate_id(length: int = 16) -> str:
    """Generate random ID

    Args:
        length: Length of the ID

    Returns:
        Random string ID
    """
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))


def generate_request_id() -> str:
    """Generate unique request ID

    Returns:
        UUID-based request ID
    """
    return str(uuid.uuid4()).replace('-', '')[:16]


async def sleep(ms: int) -> None:
    """Sleep for specified milliseconds

    Args:
        ms: Milliseconds to sleep
    """
    await asyncio.sleep(ms / 1000)


def debounce(delay_ms: int) -> Callable:
    """Decorator to debounce function calls

    Args:
        delay_ms: Delay in milliseconds

    Returns:
        Decorated function
    """
    def decorator(func: Callable) -> Callable:
        if asyncio.iscoroutinefunction(func):
            last_call = [None]

            async def wrapper(*args, **kwargs):
                # Cancel previous call if pending
                if last_call[0] and not last_call[0].done():
                    last_call[0].cancel()

                # Schedule new call
                last_call[0] = asyncio.create_task(asyncio.sleep(delay_ms / 1000))
                try:
                    await last_call[0]
                    return await func(*args, **kwargs)
                except asyncio.CancelledError:
                    return None

            return wrapper
        else:
            last_call = [None]

            def wrapper(*args, **kwargs):
                # Cancel previous task if running
                if last_call[0] and not last_call[0].done():
                    last_call[0].cancel()

                # Schedule new task
                last_call[0] = asyncio.create_task(_debounce_sync(func, delay_ms, *args, **kwargs))
                return last_call[0]

            return wrapper

    return decorator


async def _debounce_sync(func: Callable, delay_ms: int, *args, **kwargs):
    """Helper for debouncing sync functions"""
    await asyncio.sleep(delay_ms / 1000)
    return func(*args, **kwargs)


def throttle(delay_ms: int) -> Callable:
    """Decorator to throttle function calls

    Args:
        delay_ms: Minimum time between calls in milliseconds

    Returns:
        Decorated function
    """
    def decorator(func: Callable) -> Callable:
        if asyncio.iscoroutinefunction(func):
            last_call = [0]

            async def wrapper(*args, **kwargs):
                current_time = time.time() * 1000
                time_since_last = current_time - last_call[0]

                if time_since_last < delay_ms:
                    await asyncio.sleep((delay_ms - time_since_last) / 1000)

                last_call[0] = time.time() * 1000
                return await func(*args, **kwargs)

            return wrapper
        else:
            last_call = [0]

            async def wrapper(*args, **kwargs):
                current_time = time.time() * 1000
                time_since_last = current_time - last_call[0]

                if time_since_last < delay_ms:
                    await asyncio.sleep((delay_ms - time_since_last) / 1000)

                last_call[0] = time.time() * 1000
                return func(*args, **kwargs)

            return wrapper

    return decorator


async def concurrent(tasks: List[Callable], max_concurrent: int = 10) -> List[Any]:
    """Run tasks concurrently with limit on concurrent executions

    Args:
        tasks: List of async functions or callables
        max_concurrent: Maximum number of concurrent tasks

    Returns:
        List of results in same order as input tasks
    """
    semaphore = asyncio.Semaphore(max_concurrent)

    async def run_task(task):
        async with semaphore:
            if asyncio.iscoroutinefunction(task):
                return await task()
            elif callable(task):
                return task()
            else:
                return task

    # Create and run all tasks
    results = await asyncio.gather(*[run_task(task) for task in tasks])
    return results


def deep_clone(obj: Any) -> Any:
    """Deep clone an object

    Args:
        obj: Object to clone

    Returns:
        Deep cloned object
    """
    return copy.deepcopy(obj)


def merge_options(default: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """Merge two dictionaries, with override taking precedence

    Args:
        default: Default options
        override: Override options

    Returns:
        Merged dictionary
    """
    result = copy.deepcopy(default)

    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = merge_options(result[key], value)
        else:
            result[key] = value

    return result


def format_duration(ms: int) -> str:
    """Format duration in milliseconds to human readable string

    Args:
        ms: Duration in milliseconds

    Returns:
        Formatted duration string
    """
    if ms < 1000:
        return f"{ms}ms"
    elif ms < 60000:
        seconds = ms / 1000
        return f"{seconds:.1f}s"
    elif ms < 3600000:
        minutes = ms / 60000
        return f"{minutes:.1f}m"
    else:
        hours = ms / 3600000
        return f"{hours:.1f}h"


def format_bytes(bytes_count: int) -> str:
    """Format bytes to human readable string

    Args:
        bytes_count: Number of bytes

    Returns:
        Formatted bytes string
    """
    if bytes_count == 0:
        return "0B"

    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    unit_index = 0

    while bytes_count >= 1024 and unit_index < len(units) - 1:
        bytes_count /= 1024
        unit_index += 1

    if unit_index == 0:
        return f"{int(bytes_count)}{units[unit_index]}"
    else:
        return f"{bytes_count:.1f}{units[unit_index]}"


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
        ValueError: If URL is invalid
    """
    if not is_valid_url(url):
        raise ValueError(f"Invalid URL: {url}")

    # Add scheme if missing
    if not url.startswith(('http://', 'https://')):
        url = f'https://{url}'

    return url.rstrip('/')


def sanitize_filename(filename: str) -> str:
    """Sanitize filename by removing invalid characters

    Args:
        filename: Original filename

    Returns:
        Sanitized filename
    """
    # Remove invalid characters
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        filename = filename.replace(char, '_')

    # Remove leading/trailing spaces and dots
    filename = filename.strip(' .')

    # Ensure filename is not empty
    if not filename:
        filename = "unnamed_file"

    # Limit length
    if len(filename) > 255:
        name, ext = filename.rsplit('.', 1) if '.' in filename else (filename, '')
        max_name_len = 255 - len(ext) - 1
        filename = name[:max_name_len] + ('.' + ext if ext else '')

    return filename


def parse_iso8601(iso_string: str) -> int:
    """Parse ISO 8601 datetime string to timestamp in milliseconds

    Args:
        iso_string: ISO 8601 datetime string

    Returns:
        Timestamp in milliseconds

    Raises:
        ValueError: If string cannot be parsed
    """
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(iso_string.replace('Z', '+00:00'))
        return int(dt.timestamp() * 1000)
    except Exception as e:
        raise ValueError(f"Invalid ISO 8601 datetime: {iso_string}") from e


def format_iso8601(timestamp_ms: int) -> str:
    """Format timestamp in milliseconds to ISO 8601 string

    Args:
        timestamp_ms: Timestamp in milliseconds

    Returns:
        ISO 8601 datetime string
    """
    from datetime import datetime, timezone
    dt = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)
    return dt.isoformat().replace('+00:00', 'Z')


def chunk_list(lst: List[T], chunk_size: int) -> List[List[T]]:
    """Split list into chunks

    Args:
        lst: List to chunk
        chunk_size: Size of each chunk

    Returns:
        List of chunks
    """
    return [lst[i:i + chunk_size] for i in range(0, len(lst), chunk_size)]


async def gather_with_errors(*tasks) -> tuple[List[Any], List[Exception]]:
    """Gather tasks, separating successful results from errors

    Args:
        *tasks: Tasks to run

    Returns:
        Tuple of (successful_results, errors)
    """
    results = []
    errors = []

    for task in asyncio.as_completed(tasks):
        try:
            result = await task
            results.append(result)
        except Exception as e:
            errors.append(e)

    return results, errors


def safe_json_loads(json_str: str, default: Any = None) -> Any:
    """Safely parse JSON string

    Args:
        json_str: JSON string to parse
        default: Default value if parsing fails

    Returns:
        Parsed JSON or default value
    """
    try:
        import json
        return json.loads(json_str)
    except Exception:
        return default


def safe_json_dumps(obj: Any, default: str = "{}") -> str:
    """Safely serialize object to JSON string

    Args:
        obj: Object to serialize
        default: Default string if serialization fails

    Returns:
        JSON string or default value
    """
    try:
        import json
        return json.dumps(obj)
    except Exception:
        return default


def mask_string(s: str, visible_chars: int = 4, mask_char: str = "*") -> str:
    """Mask string for security purposes

    Args:
        s: String to mask
        visible_chars: Number of characters to keep visible at end
        mask_char: Character to use for masking

    Returns:
        Masked string
    """
    if not s or len(s) <= visible_chars:
        return mask_char * len(s) if s else ""

    masked_length = len(s) - visible_chars
    return mask_char * masked_length + s[-visible_chars:]


def get_nested_value(data: Dict[str, Any], path: str, default: Any = None) -> Any:
    """Get value from nested dictionary using dot notation

    Args:
        data: Dictionary to search
        path: Dot-separated path (e.g., "user.profile.name")
        default: Default value if path not found

    Returns:
        Value at path or default
    """
    keys = path.split('.')
    current = data

    for key in keys:
        if isinstance(current, dict) and key in current:
            current = current[key]
        else:
            return default

    return current


def set_nested_value(data: Dict[str, Any], path: str, value: Any) -> None:
    """Set value in nested dictionary using dot notation

    Args:
        data: Dictionary to modify
        path: Dot-separated path (e.g., "user.profile.name")
        value: Value to set
    """
    keys = path.split('.')
    current = data

    for key in keys[:-1]:
        if key not in current:
            current[key] = {}
        current = current[key]

    current[keys[-1]] = value