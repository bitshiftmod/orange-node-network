# Orange Network Python SDK

A comprehensive Python SDK for interacting with the Orange Node Network gateway services. Provides easy integration for developers with authentication, transaction handling, subscription management, and comprehensive error handling.

## Features

- **Async/Await Support**: Full async/await support with aiohttp for high-performance concurrent requests
- **Authentication**: Support for API key, JWT, and OAuth authentication methods
- **Transaction Building**: Complete transaction building and signing utilities using algopy
- **Subscription Management**: Easy subscription creation, management, and monitoring
- **Real-time Updates**: WebSocket client for real-time event streaming
- **Error Handling**: Comprehensive error handling with retry logic and exponential backoff
- **Type Hints**: Full type hints using Python dataclasses and Pydantic models
- **Rate Limiting**: Built-in rate limiting and caching mechanisms
- **Logging**: Comprehensive logging with custom logger support

## Installation

```bash
pip install orange-network-sdk
```

### Development Installation

```bash
git clone https://github.com/bitshiftmod/orange-node-network.git
cd orange-node-network/packages/sdk/python
pip install -e ".[dev]"
```

## Quick Start

### Using API Key Authentication

```python
import asyncio
from orange_network import OrangeNetworkSDK

async def main():
    # Initialize SDK with API key
    sdk = OrangeNetworkSDK.with_api_key(
        gateway_url="https://gateway.example.com",
        api_key="your-api-key-here",
        network="mainnet"
    )

    # Test connection
    connection_test = await sdk.test_connection()
    print(f"Connection successful: {connection_test.success}")

    # Get gateway info
    gateway_info = await sdk.get_gateway_info()
    print(f"Gateway: {gateway_info.friendly_name}")

    # Get available nodes
    nodes = await sdk.get_nodes()
    print(f"Available nodes: {len(nodes)}")

    # Cleanup
    await sdk.close()

asyncio.run(main())
```

### Using JWT Authentication

```python
from orange_network import OrangeNetworkSDK

async def main():
    sdk = OrangeNetworkSDK.with_jwt(
        gateway_url="https://gateway.example.com",
        token="your-jwt-token",
        refresh_token="your-refresh-token",  # Optional
        network="mainnet"
    )

    # Get current user info
    user_info = sdk.auth.get_user_info()
    print(f"User: {user_info.address if user_info else 'Unknown'}")

    await sdk.close()

asyncio.run(main())
```

### Transaction Building

```python
from orange_network.transactions import TransactionBuilder
from orange_network.utils import validate_address

async def create_payment_transaction():
    builder = TransactionBuilder(
        network="mainnet",
        sender=validate_address("SENDER_ADDRESS_HERE"),
        receiver=validate_address("RECEIVER_ADDRESS_HERE"),
        amount=1_000_000,  # 1 ALGO in microAlgos
        note_bytes=b"Payment via Orange Network"
    )

    # Build the transaction
    transaction = await builder.build()

    # Sign with private key (in production, use secure key management)
    signed_tx = transaction.sign_with_private_key("PRIVATE_KEY_HERE")

    return signed_tx

# Use with SDK
async def send_payment():
    sdk = OrangeNetworkSDK.with_api_key("...", "...")

    signed_tx = await create_payment_transaction()
    result = await sdk.send_transaction(signed_tx)

    print(f"Transaction sent: {result.tx_id}")
    await sdk.close()

asyncio.run(send_payment())
```

### WebSocket Real-time Updates

```python
from orange_network.websocket import WebSocketClient

async def monitor_events():
    sdk = OrangeNetworkSDK.with_api_key("...", "...")

    # Create WebSocket client
    ws_client = WebSocketClient(sdk)

    # Define event handlers
    async def on_transaction_confirmed(event):
        print(f"Transaction confirmed: {event.payload['tx_id']}")

    async def on_node_health(event):
        print(f"Node health update: {event.payload}")

    # Subscribe to events
    await ws_client.subscribe("transaction:confirmed", on_transaction_confirmed)
    await ws_client.subscribe("node:health", on_node_health)

    # Connect and start listening
    await ws_client.connect()

    try:
        # Keep connection alive
        await asyncio.sleep(3600)  # 1 hour
    finally:
        await ws_client.disconnect()
        await sdk.close()

asyncio.run(monitor_events())
```

### Subscription Management

```python
from orange_network.subscriptions import SubscriptionManager, SubscriptionTier

async def manage_subscriptions():
    sdk = OrangeNetworkSDK.with_api_key("...", "...")
    subscriptions = sdk.subscriptions

    # Create a new subscription
    subscription = await subscriptions.create(
        subscriber="USER_ADDRESS_HERE",
        tier=SubscriptionTier.PREMIUM,
        billing_period=30 * 24 * 60 * 60,  # 30 days
        auto_renew=True
    )

    print(f"Created subscription: {subscription.id}")

    # Get subscription usage
    usage = await subscriptions.get_usage(subscription.id)
    print(f"API calls this month: {usage.api_calls}")

    # Update subscription
    updated = await subscriptions.update(
        subscription.id,
        tier=SubscriptionTier.ENTERPRISE
    )

    # Cancel subscription
    await subscriptions.cancel(subscription.id)

    await sdk.close()

asyncio.run(manage_subscriptions())
```

## Configuration

### Environment Variables

The SDK supports configuration through environment variables:

```bash
export ORANGE_GATEWAY_URL="https://gateway.example.com"
export ORANGE_API_KEY="your-api-key-here"
export ORANGE_JWT_TOKEN="your-jwt-token"
export ORANGE_NETWORK="mainnet"  # mainnet, testnet, or betanet
```

### Advanced Configuration

```python
from orange_network import OrangeNetworkSDK, SDKConfig
from orange_network.utils import Logger

class CustomLogger(Logger):
    def debug(self, message: str, *args):
        print(f"[DEBUG] {message}")

    def info(self, message: str, *args):
        print(f"[INFO] {message}")

    def warning(self, message: str, *args):
        print(f"[WARNING] {message}")

    def error(self, message: str, error=None, *args):
        print(f"[ERROR] {message}")
        if error:
            print(f"Error details: {error}")

config = SDKConfig(
    gateway_url="https://gateway.example.com",
    network="mainnet",
    auth={
        "method": "api-key",
        "api_key": "your-api-key"
    },
    timeout=30000,  # 30 seconds
    retry_attempts=3,
    retry_delay=1000,  # 1 second
    debug=True,
    logger=CustomLogger(),
    rate_limit={
        "requests_per_second": 10,
        "max_concurrent": 5
    },
    websocket={
        "auto_reconnect": True,
        "max_reconnect_attempts": 5,
        "reconnect_delay": 2000,
        "heartbeat_interval": 30000
    }
)

sdk = OrangeNetworkSDK(config)
```

## Error Handling

The SDK provides comprehensive error handling with specific exception types:

```python
from orange_network import OrangeNetworkSDK
from orange_network.errors import (
    OrangeNetworkError,
    NetworkError,
    AuthenticationError,
    RateLimitError,
    ValidationError,
    TransactionError
)

async def handle_errors():
    sdk = OrangeNetworkSDK.with_api_key("...", "...")

    try:
        await sdk.get_nodes()
    except NetworkError as e:
        print(f"Network error: {e}")
    except AuthenticationError as e:
        print(f"Authentication failed: {e}")
    except RateLimitError as e:
        print(f"Rate limited: {e}, reset at: {e.reset_time}")
    except OrangeNetworkError as e:
        print(f"SDK error: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")
    finally:
        await sdk.close()

asyncio.run(handle_errors())
```

## Development

### Running Tests

```bash
# Install development dependencies
pip install -e ".[dev]"

# Run all tests
pytest

# Run with coverage
pytest --cov=orange_network --cov-report=html

# Run specific test categories
pytest -m unit
pytest -m integration
pytest -m "not slow"
```

### Code Quality

```bash
# Format code
black src tests
isort src tests

# Lint code
flake8 src tests

# Type checking
mypy src
```

### Pre-commit Hooks

```bash
# Install pre-commit hooks
pre-commit install

# Run pre-commit checks
pre-commit run --all-files
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- Documentation: [https://orange-node-network.readthedocs.io/](https://orange-node-network.readthedocs.io/)
- GitHub Issues: [https://github.com/bitshiftmod/orange-node-network/issues](https://github.com/bitshiftmod/orange-node-network/issues)
- Discussions: [https://github.com/bitshiftmod/orange-node-network/discussions](https://github.com/bitshiftmod/orange-node-network/discussions)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes and version history.