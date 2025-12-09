"""Cryptography utilities"""

import hashlib
import secrets
import hmac
import time
from typing import Optional, Tuple, Union
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import base64


def generate_nonce(length: int = 32) -> str:
    """Generate cryptographically secure random nonce

    Args:
        length: Length of nonce in bytes

    Returns:
        Hexadecimal nonce string
    """
    return secrets.token_hex(length)


def generate_random_bytes(length: int = 32) -> bytes:
    """Generate cryptographically secure random bytes

    Args:
        length: Number of bytes to generate

    Returns:
        Random bytes
    """
    return secrets.token_bytes(length)


def hash_data(data: Union[str, bytes], algorithm: str = "sha256") -> str:
    """Hash data using specified algorithm

    Args:
        data: Data to hash
        algorithm: Hash algorithm (sha256, sha512, md5)

    Returns:
        Hexadecimal hash string
    """
    if isinstance(data, str):
        data = data.encode('utf-8')

    if algorithm.lower() == "sha256":
        return hashlib.sha256(data).hexdigest()
    elif algorithm.lower() == "sha512":
        return hashlib.sha512(data).hexdigest()
    elif algorithm.lower() == "md5":
        return hashlib.md5(data).hexdigest()
    else:
        raise ValueError(f"Unsupported hash algorithm: {algorithm}")


def hmac_sign(data: Union[str, bytes], key: Union[str, bytes], algorithm: str = "sha256") -> str:
    """Sign data using HMAC

    Args:
        data: Data to sign
        key: Secret key for signing
        algorithm: HMAC algorithm

    Returns:
        Hexadecimal HMAC signature
    """
    if isinstance(data, str):
        data = data.encode('utf-8')
    if isinstance(key, str):
        key = key.encode('utf-8')

    if algorithm.lower() == "sha256":
        return hmac.new(key, data, hashlib.sha256).hexdigest()
    elif algorithm.lower() == "sha512":
        return hmac.new(key, data, hashlib.sha512).hexdigest()
    else:
        raise ValueError(f"Unsupported HMAC algorithm: {algorithm}")


def hmac_verify(data: Union[str, bytes], signature: str, key: Union[str, bytes], algorithm: str = "sha256") -> bool:
    """Verify HMAC signature

    Args:
        data: Original data
        signature: HMAC signature to verify
        key: Secret key used for signing
        algorithm: HMAC algorithm used

    Returns:
        True if signature is valid, False otherwise
    """
    expected_signature = hmac_sign(data, key, algorithm)
    return hmac.compare_digest(expected_signature, signature)


def derive_key(password: Union[str, bytes], salt: bytes, iterations: int = 100000, key_length: int = 32) -> bytes:
    """Derive cryptographic key from password using PBKDF2

    Args:
        password: Password to derive key from
        salt: Salt for key derivation
        iterations: Number of iterations
        key_length: Length of derived key in bytes

    Returns:
        Derived key bytes
    """
    if isinstance(password, str):
        password = password.encode('utf-8')

    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=key_length,
        salt=salt,
        iterations=iterations,
        backend=default_backend(),
    )

    return kdf.derive(password)


def encrypt_aes_gcm(plaintext: Union[str, bytes], key: bytes, associated_data: Optional[bytes] = None) -> Tuple[bytes, bytes, bytes]:
    """Encrypt data using AES-GCM

    Args:
        plaintext: Data to encrypt
        key: Encryption key (32 bytes for AES-256)
        associated_data: Additional authenticated data

    Returns:
        Tuple of (nonce, ciphertext, authentication_tag)
    """
    if isinstance(plaintext, str):
        plaintext = plaintext.encode('utf-8')

    # Generate random nonce
    nonce = generate_random_bytes(12)  # GCM recommended nonce size

    # Create cipher
    cipher = Cipher(
        algorithms.AES(key),
        modes.GCM(nonce),
        backend=default_backend(),
    )

    encryptor = cipher.encryptor()

    # Add associated data if provided
    if associated_data:
        encryptor.authenticate_additional_data(associated_data)

    # Encrypt and get authentication tag
    ciphertext = encryptor.update(plaintext) + encryptor.finalize()
    tag = encryptor.tag

    return nonce, ciphertext, tag


def decrypt_aes_gcm(ciphertext: bytes, key: bytes, nonce: bytes, tag: bytes, associated_data: Optional[bytes] = None) -> bytes:
    """Decrypt data using AES-GCM

    Args:
        ciphertext: Encrypted data
        key: Encryption key (32 bytes for AES-256)
        nonce: Nonce used for encryption
        tag: Authentication tag
        associated_data: Additional authenticated data used during encryption

    Returns:
        Decrypted plaintext bytes

    Raises:
        ValueError: If decryption fails (invalid tag, etc.)
    """
    # Create cipher
    cipher = Cipher(
        algorithms.AES(key),
        modes.GCM(nonce, tag),
        backend=default_backend(),
    )

    decryptor = cipher.decryptor()

    # Add associated data if provided
    if associated_data:
        decryptor.authenticate_additional_data(associated_data)

    # Decrypt
    plaintext = decryptor.update(ciphertext) + decryptor.finalize()
    return plaintext


def secure_compare(a: Union[str, bytes], b: Union[str, bytes]) -> bool:
    """Securely compare two strings or bytes to prevent timing attacks

    Args:
        a: First value to compare
        b: Second value to compare

    Returns:
        True if values are equal, False otherwise
    """
    if isinstance(a, str):
        a = a.encode('utf-8')
    if isinstance(b, str):
        b = b.encode('utf-8')

    # Use constant-time comparison
    return hmac.compare_digest(a, b)


def base64url_encode(data: bytes) -> str:
    """Encode data using URL-safe Base64 encoding

    Args:
        data: Data to encode

    Returns:
        URL-safe Base64 string without padding
    """
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')


def base64url_decode(data: str) -> bytes:
    """Decode URL-safe Base64 string

    Args:
        data: URL-safe Base64 string

    Returns:
        Decoded bytes
    """
    # Add padding if needed
    padding_len = (4 - len(data) % 4) % 4
    data += '=' * padding_len

    return base64.urlsafe_b64decode(data)


def create_timestamp_signature(data: Union[str, bytes], secret_key: Union[str, bytes], expires_in: int = 300) -> str:
    """Create a timestamped signature for data

    Args:
        data: Data to sign
        secret_key: Secret key for signing
        expires_in: Signature expiration time in seconds

    Returns:
        Timestamped signature (timestamp:signature)
    """
    timestamp = int(time.time())
    message = f"{data}:{timestamp}"
    signature = hmac_sign(message, secret_key)
    return f"{timestamp}:{signature}"


def verify_timestamp_signature(
    data: Union[str, bytes],
    signature: str,
    secret_key: Union[str, bytes],
    max_age: int = 300
) -> bool:
    """Verify a timestamped signature

    Args:
        data: Original data
        signature: Timestamped signature (timestamp:signature)
        secret_key: Secret key used for signing
        max_age: Maximum age in seconds

    Returns:
        True if signature is valid and not expired, False otherwise
    """
    try:
        timestamp_str, sig = signature.split(':', 1)
        timestamp = int(timestamp_str)
    except (ValueError, IndexError):
        return False

    # Check if signature is expired
    current_time = int(time.time())
    if current_time - timestamp > max_age:
        return False

    # Verify signature
    message = f"{data}:{timestamp}"
    return hmac_verify(message, sig, secret_key)


class KeyGenerator:
    """Utility class for generating various types of cryptographic keys"""

    @staticmethod
    def generate_aes_key(length: int = 32) -> bytes:
        """Generate AES encryption key

        Args:
            length: Key length in bytes (16 for AES-128, 32 for AES-256)

        Returns:
            Random AES key
        """
        return generate_random_bytes(length)

    @staticmethod
    def generate_hmac_key(length: int = 32) -> bytes:
        """Generate HMAC key

        Args:
            length: Key length in bytes

        Returns:
            Random HMAC key
        """
        return generate_random_bytes(length)

    @staticmethod
    def derive_key_from_nonce(nonce: str, purpose: str, length: int = 32) -> bytes:
        """Derive key from nonce using HKDF-like process

        Args:
            nonce: Input nonce
            purpose: Purpose string for key derivation
            length: Desired key length in bytes

        Returns:
            Derived key
        """
        # Simple HKDF-like derivation
        data = f"{nonce}:{purpose}".encode('utf-8')
        return hash_data(data)[:length].encode('utf-8')


def mask_sensitive_data(data: str, visible_chars: int = 4) -> str:
    """Mask sensitive data for logging

    Args:
        data: Sensitive data to mask
        visible_chars: Number of characters to keep visible at the end

    Returns:
        Masked data string
    """
    if not data or len(data) <= visible_chars:
        return "*" * len(data) if data else ""

    masked_length = len(data) - visible_chars
    return "*" * masked_length + data[-visible_chars:]