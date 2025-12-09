"""Logging utilities"""

import logging
import sys
from typing import Any
from ..types import Logger


class DefaultLogger(Logger):
    """Default logger implementation using Python's logging module"""

    def __init__(self, name: str = "orange_network", level: int = logging.INFO):
        """Initialize logger

        Args:
            name: Logger name
            level: Logging level
        """
        self._logger = logging.getLogger(name)
        self._logger.setLevel(level)

        # Create console handler if not already present
        if not self._logger.handlers:
            handler = logging.StreamHandler(sys.stdout)
            handler.setLevel(level)

            # Create formatter
            formatter = logging.Formatter(
                '[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
            handler.setFormatter(formatter)

            self._logger.addHandler(handler)

    def debug(self, message: str, *args: Any) -> None:
        """Log debug message"""
        self._logger.debug(message, *args)

    def info(self, message: str, *args: Any) -> None:
        """Log info message"""
        self._logger.info(message, *args)

    def warning(self, message: str, *args: Any) -> None:
        """Log warning message"""
        self._logger.warning(message, *args)

    def error(self, message: str, error: Exception = None, *args: Any) -> None:
        """Log error message"""
        if error:
            self._logger.error(f"{message}: {error}", *args, exc_info=True)
        else:
            self._logger.error(message, *args)


def get_logger(name: str = "orange_network", level: str = "INFO") -> DefaultLogger:
    """Get a logger instance

    Args:
        name: Logger name
        level: Logging level as string

    Returns:
        Logger instance
    """
    level_map = {
        "DEBUG": logging.DEBUG,
        "INFO": logging.INFO,
        "WARNING": logging.WARNING,
        "ERROR": logging.ERROR,
        "CRITICAL": logging.CRITICAL,
    }

    log_level = level_map.get(level.upper(), logging.INFO)
    return DefaultLogger(name, log_level)