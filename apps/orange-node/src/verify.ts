import crypto from "crypto";
import {
  decodeSignedTransaction,
  encodeAddress,
  verifyBytes,

  SignedTransaction
} from 'algosdk';

interface VerificationResult {
  success: boolean;
  address?: string;
  error?: string;
}

interface NonceStore {
  [userId: string]: {
    nonce: string;
    timestamp: number;
    expiresAt: number;
  };
}

class NonceManager {
  private nonces: NonceStore = {};
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly NONCE_TTL = 10 * 60 * 1000; // 10 minutes

  constructor() {
    // Start cleanup interval
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
  }

  generateNonce(userId: string): string {
    const nonce = crypto.randomBytes(16).toString("hex");
    const timestamp = Date.now();

    this.nonces[userId] = {
      nonce,
      timestamp,
      expiresAt: timestamp + this.NONCE_TTL
    };

    console.log(`Generated nonce for user ${userId}: ${nonce.substring(0, 8)}...`);
    return nonce;
  }

  getNonce(userId: string): string | null {
    const nonceData = this.nonces[userId];
    if (!nonceData) {
      return null;
    }

    // Check if nonce has expired
    if (Date.now() > nonceData.expiresAt) {
      delete this.nonces[userId];
      return null;
    }

    return nonceData.nonce;
  }

  consumeNonce(userId: string, nonce: string): boolean {
    const nonceData = this.nonces[userId];
    if (!nonceData) {
      return false;
    }

    // Check if nonce matches
    if (nonceData.nonce !== nonce) {
      return false;
    }

    // Check if nonce has expired
    if (Date.now() > nonceData.expiresAt) {
      delete this.nonces[userId];
      return false;
    }

    // Consume the nonce (remove it)
    delete this.nonces[userId];
    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const userId in this.nonces) {
      if (this.nonces[userId] && now > this.nonces[userId]!.expiresAt) {
        delete this.nonces[userId];
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired nonces`);
    }
  }
}

const nonceManager = new NonceManager();

/**
 * Generate a nonce for user verification
 */
export const generateNonce = (userId: string): string => {
  return nonceManager.generateNonce(userId);
};

/**
 * Verify a user's signed transaction
 */
export const verifyUser = (userId: string, signedTransaction: string): VerificationResult => {
  try {
    // Input validation
    if (!userId || typeof userId !== 'string') {
      return {
        success: false,
        error: 'Invalid userId'
      };
    }

    if (!signedTransaction || typeof signedTransaction !== 'string') {
      return {
        success: false,
        error: 'Invalid signed transaction'
      };
    }

    // Decode the signed transaction
    let decodedTxn: SignedTransaction;
    try {
      decodedTxn = decodeSignedTransaction(Buffer.from(signedTransaction, "base64"));
    } catch (error) {
      console.error("Failed to decode signed transaction:", error);
      return {
        success: false,
        error: 'Invalid transaction format'
      };
    }

    // Extract transaction components
    const { txn, sig, msig } = decodedTxn;
    const txnNote = txn.note ? new TextDecoder().decode(txn.note) : '';

    // Get stored nonce for this user
    const storedNonce = nonceManager.getNonce(userId);
    if (!storedNonce) {
      return {
        success: false,
        error: 'No valid nonce found for user'
      };
    }

    // Verify transaction details
    const validationErrors = [];

    // Check if transaction has note
    if (!txn.note || txnNote.length === 0) {
      validationErrors.push('Transaction must contain nonce in note field');
    }

    // Verify nonce matches
    if (txnNote !== storedNonce) {
      validationErrors.push('Nonce does not match');
    }

    // Verify transaction amount is 0 (should be a zero-value transaction)
    const txnAmount = (txn as any).amount;
    if (txnAmount && txnAmount !== 0n) {
      validationErrors.push('Transaction amount must be 0');
    }

    // Verify transaction is not a rekey transaction
    if ((txn as any).reKeyTo) {
      validationErrors.push('Rekey transactions are not allowed');
    }

    // Verify no other recipients
    if (txn.type !== 'pay' || (txn as any).toAddr) {
      validationErrors.push('Invalid transaction type or recipient');
    }

    if (validationErrors.length > 0) {
      return {
        success: false,
        error: validationErrors.join('; ')
      };
    }

    // Verify signature
    let isSignatureValid = false;
    const fromAddress = encodeAddress((txn as any).from || (txn as any).snd);

    if (sig) {
      // Single signature
      try {
        const txnBytes = Buffer.from(signedTransaction, "base64");
        // Remove the last 64 bytes (signature) to get the unsigned transaction
        const unsignedTxnBytes = txnBytes.slice(0, -64);

        const senderPubKey = (txn as any).from || (txn as any).snd;
        isSignatureValid = verifyBytes(
          unsignedTxnBytes,
          sig,
          senderPubKey
        );
      } catch (error) {
        console.error("Single signature verification failed:", error);
      }
    } else if (msig) {
      // Multi-signature (not implemented for this use case)
      return {
        success: false,
        error: 'Multi-signature transactions are not supported'
      };
    } else {
      return {
        success: false,
        error: 'No signature found in transaction'
      };
    }

    if (!isSignatureValid) {
      return {
        success: false,
        error: 'Invalid signature'
      };
    }

    // Consume the nonce (one-time use)
    if (!nonceManager.consumeNonce(userId, storedNonce)) {
      return {
        success: false,
        error: 'Nonce has already been used or expired'
      };
    }

    console.log(`Successfully verified transaction for user ${userId}, address: ${fromAddress}`);

    return {
      success: true,
      address: fromAddress
    };

  } catch (error) {
    console.error("Verification failed:", error);
    return {
      success: false,
      error: 'Verification process failed'
    };
  }
};

/**
 * Verify multiple signed transactions (for batch operations)
 */
export const verifyMultipleTransactions = (
  userId: string,
  signedTransactions: string[]
): { results: VerificationResult[], successCount: number } => {
  const results = signedTransactions.map(txn => verifyUser(userId, txn));
  const successCount = results.filter(result => result.success).length;

  return { results, successCount };
};

/**
 * Get nonce status for a user
 */
export const getNonceStatus = (userId: string): { hasNonce: boolean; timeRemaining?: number } => {
  const nonceData = (nonceManager as any).nonces[userId];
  if (!nonceData) {
    return { hasNonce: false };
  }

  const timeRemaining = Math.max(0, nonceData.expiresAt - Date.now());

  return {
    hasNonce: timeRemaining > 0,
    timeRemaining
  };
};
