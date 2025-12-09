# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-11-18

### Added
- Initial release of Orange Network Python SDK
- Full async/await support with aiohttp
- Authentication support for API key, JWT, and OAuth methods
- Transaction building and signing utilities using algopy
- Subscription management helpers
- WebSocket client for real-time updates
- Comprehensive error handling with retry logic
- Type hints using Python dataclasses and Pydantic models
- Rate limiting and caching mechanisms
- Comprehensive test suite using pytest
- PyPI publishing configuration
- Full documentation and examples

### Features
- **Core Client**: HTTP client with automatic retry, rate limiting, and caching
- **Authentication**: JWT token management, API key authentication, OAuth support
- **Transactions**: Transaction building, signing, and verification with algopy integration
- **Subscriptions**: Create, manage, and monitor Orange network subscriptions
- **WebSocket**: Real-time event streaming with automatic reconnection
- **Error Handling**: Specific exception types with detailed error information
- **Type Safety**: Full type hints and Pydantic models for validation
- **Logging**: Comprehensive logging with custom logger support
- **Testing**: Unit tests, integration tests, and comprehensive test coverage

### Supported Python Versions
- Python 3.8+
- Tested on Python 3.8, 3.9, 3.10, 3.11, and 3.12

### Dependencies
- aiohttp >= 3.8.0
- websockets >= 11.0.0
- pyjwt >= 2.8.0
- algopy >= 1.0.0
- cryptography >= 41.0.0
- typing-extensions >= 4.5.0
- pydantic >= 2.0.0
- tenacity >= 8.2.0