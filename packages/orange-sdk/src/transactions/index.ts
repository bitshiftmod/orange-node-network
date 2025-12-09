/**
 * Transaction Module
 * 
 * Provides transaction building, signing, and verification utilities
 * for Algorand transactions in the Orange Node Network.
 * 
 * Note: This module uses algosdk v3 API.
 */

import * as algosdk from 'algosdk';
import type { TransactionInfo, NetworkConfig } from '../types';
import { InvalidTransactionError, ValidationError } from '../errors';

/**
 * Transaction parameters
 */
export interface TransactionParams {
  sender: string;
  receiver?: string;
  amount?: number;
  fee?: number;
  note?: string;
  type?: TransactionType;
  assetId?: number;
  assetAmount?: number;
  appId?: number;
  appArgs?: Uint8Array[];
  foreignAssets?: number[];
  foreignApps?: number[];
  accounts?: string[];
}

/**
 * Transaction type
 */
export type TransactionType = 'pay' | 'keyreg' | 'acfg' | 'axfer' | 'afrz' | 'appl';

/**
 * Signed transaction
 */
export interface SignedTransaction {
  txId: string;
  signedTxn: Uint8Array;
  transaction: algosdk.Transaction;
}

/**
 * Transaction group
 */
export interface TransactionGroup {
  transactions: algosdk.Transaction[];
  groupId: string;
}

/**
 * Transaction Builder
 * 
 * Creates and signs Algorand transactions using algosdk v3.
 */
export class TransactionBuilder {
  private algod: algosdk.Algodv2;
  private params: algosdk.SuggestedParams | null = null;
  private network: NetworkConfig['network'];

  constructor(algodClient: algosdk.Algodv2, network: NetworkConfig['network']) {
    this.algod = algodClient;
    this.network = network;
  }

  /**
   * Load suggested transaction parameters from network
   */
  async loadSuggestedParams(): Promise<algosdk.SuggestedParams> {
    try {
      this.params = await this.algod.getTransactionParams().do();
      return this.params;
    } catch (error) {
      throw new InvalidTransactionError(
        `Failed to load transaction parameters: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get suggested transaction parameters (cached)
   */
  async getSuggestedParams(): Promise<algosdk.SuggestedParams> {
    if (!this.params) {
      return await this.loadSuggestedParams();
    }
    return this.params;
  }

  /**
   * Create payment transaction
   */
  async createPaymentTransaction(params: TransactionParams): Promise<algosdk.Transaction> {
    const suggestedParams = await this.getSuggestedParams();
    this.validateTransactionParams(params);

    return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: params.sender,
      receiver: params.receiver || params.sender,
      amount: params.amount || 0,
      note: params.note ? new TextEncoder().encode(params.note) : undefined,
      suggestedParams
    });
  }

  /**
   * Create asset transfer transaction
   */
  async createAssetTransferTransaction(params: TransactionParams): Promise<algosdk.Transaction> {
    if (!params.assetId) {
      throw new ValidationError('Asset ID is required for asset transfer');
    }

    const suggestedParams = await this.getSuggestedParams();
    this.validateTransactionParams(params);

    return algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: params.sender,
      receiver: params.receiver || params.sender,
      assetIndex: params.assetId,
      amount: params.assetAmount || 0,
      note: params.note ? new TextEncoder().encode(params.note) : undefined,
      suggestedParams
    });
  }

  /**
   * Create application call transaction
   */
  async createApplicationCallTransaction(params: TransactionParams): Promise<algosdk.Transaction> {
    if (!params.appId) {
      throw new ValidationError('Application ID is required for application call');
    }

    const suggestedParams = await this.getSuggestedParams();

    return algosdk.makeApplicationCallTxnFromObject({
      sender: params.sender,
      appIndex: params.appId,
      appArgs: params.appArgs || [],
      accounts: params.accounts || [],
      foreignApps: params.foreignApps || [],
      foreignAssets: params.foreignAssets || [],
      note: params.note ? new TextEncoder().encode(params.note) : undefined,
      suggestedParams,
      onComplete: algosdk.OnApplicationComplete.NoOpOC
    });
  }

  /**
   * Sign transaction with private key
   */
  signTransaction(transaction: algosdk.Transaction, privateKey: Uint8Array): SignedTransaction {
    try {
      const signedTxn = algosdk.signTransaction(transaction, privateKey);
      return {
        txId: signedTxn.txID,
        signedTxn: signedTxn.blob,
        transaction
      };
    } catch (error) {
      throw new InvalidTransactionError(
        `Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Sign transaction with mnemonic
   */
  signTransactionWithMnemonic(transaction: algosdk.Transaction, mnemonic: string): SignedTransaction {
    try {
      const account = algosdk.mnemonicToSecretKey(mnemonic);
      return this.signTransaction(transaction, account.sk);
    } catch (error) {
      throw new InvalidTransactionError(
        `Failed to sign transaction with mnemonic: ${error instanceof Error ? error.message : 'Invalid mnemonic'}`
      );
    }
  }

  /**
   * Create transaction group
   */
  createTransactionGroup(transactions: algosdk.Transaction[]): TransactionGroup {
    if (transactions.length === 0) {
      throw new ValidationError('At least one transaction is required for a group');
    }

    algosdk.assignGroupID(transactions);

    return {
      transactions,
      groupId: transactions[0].group ? Buffer.from(transactions[0].group).toString('base64') : ''
    };
  }

  /**
   * Sign transaction group
   */
  signTransactionGroup(
    group: TransactionGroup,
    privateKeys: { [txId: string]: Uint8Array }
  ): SignedTransaction[] {
    const signedTransactions: SignedTransaction[] = [];

    for (const transaction of group.transactions) {
      const privateKey = privateKeys[transaction.txID()];
      if (!privateKey) {
        throw new ValidationError(`Private key not found for transaction ${transaction.txID()}`);
      }

      const signedTxn = this.signTransaction(transaction, privateKey);
      signedTransactions.push(signedTxn);
    }

    return signedTransactions;
  }

  /**
   * Submit transaction to network
   */
  async submitTransaction(signedTransaction: SignedTransaction): Promise<TransactionInfo> {
    try {
      await this.algod.sendRawTransaction(signedTransaction.signedTxn).do();
      const confirmedTxn = await this.waitForConfirmation(signedTransaction.txId);
      return this.parseTransactionInfo(confirmedTxn);
    } catch (error) {
      throw new InvalidTransactionError(
        `Failed to submit transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Submit transaction group to network
   */
  async submitTransactionGroup(signedTransactions: SignedTransaction[]): Promise<TransactionInfo[]> {
    try {
      const signedTxns = signedTransactions.map(st => st.signedTxn);
      await this.algod.sendRawTransaction(signedTxns).do();

      const confirmedTxns: TransactionInfo[] = [];
      for (const signedTxn of signedTransactions) {
        const confirmedTxn = await this.waitForConfirmation(signedTxn.txId);
        confirmedTxns.push(this.parseTransactionInfo(confirmedTxn));
      }

      return confirmedTxns;
    } catch (error) {
      throw new InvalidTransactionError(
        `Failed to submit transaction group: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Wait for transaction confirmation
   */
  private async waitForConfirmation(txId: string, maxRounds: number = 5): Promise<any> {
    let lastRound = (await this.algod.status().do())['last-round'];

    for (let i = 0; i < maxRounds; i++) {
      try {
        const confirmedTxn = await this.algod.pendingTransactionInformation(txId).do();
        if (confirmedTxn['confirmed-round']) {
          return confirmedTxn;
        }
        lastRound++;
        await this.algod.statusAfterBlock(lastRound).do();
      } catch {
        // Continue waiting
      }
    }

    throw new Error(`Transaction ${txId} not confirmed after ${maxRounds} rounds`);
  }

  /**
   * Parse transaction information from confirmed transaction
   */
  private parseTransactionInfo(confirmedTxn: any): TransactionInfo {
    return {
      txId: confirmedTxn['tx-id'] || confirmedTxn.txn?.txn?.txID,
      sender: confirmedTxn.txn?.txn?.snd || confirmedTxn['sender'],
      receiver: confirmedTxn.txn?.txn?.rcv,
      amount: confirmedTxn.txn?.txn?.amt,
      fee: confirmedTxn.txn?.txn?.fee,
      firstRound: confirmedTxn.txn?.txn?.fv,
      lastRound: confirmedTxn.txn?.txn?.lv,
      note: confirmedTxn.txn?.txn?.note,
      type: confirmedTxn.txn?.txn?.type,
      confirmed: true,
      confirmedRound: confirmedTxn['confirmed-round'],
      blockTime: confirmedTxn['round-time']
    };
  }

  /**
   * Validate transaction parameters
   */
  private validateTransactionParams(params: TransactionParams): void {
    if (!params.sender) {
      throw new ValidationError('Sender address is required');
    }

    try {
      algosdk.decodeAddress(params.sender);
    } catch {
      throw new ValidationError('Invalid sender address format');
    }

    if (params.receiver) {
      try {
        algosdk.decodeAddress(params.receiver);
      } catch {
        throw new ValidationError('Invalid receiver address format');
      }
    }

    if (params.amount !== undefined && (params.amount < 0 || !Number.isInteger(params.amount))) {
      throw new ValidationError('Amount must be a non-negative integer');
    }

    if (params.fee !== undefined && (params.fee < 0 || !Number.isInteger(params.fee))) {
      throw new ValidationError('Fee must be a non-negative integer');
    }
  }

  /**
   * Get account information
   */
  async getAccountInfo(address: string): Promise<any> {
    try {
      return await this.algod.accountInformation(address).do();
    } catch (error) {
      throw new ValidationError(
        `Failed to get account information: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Transaction verification utilities
 */
export class TransactionVerifier {
  /**
   * Verify transaction group has consistent group ID
   */
  static verifyTransactionGroup(transactions: algosdk.Transaction[]): boolean {
    if (transactions.length === 0) return false;

    try {
      const groupId = transactions[0].group;
      for (const txn of transactions) {
        if (!txn.group || !groupId || !Buffer.from(txn.group).equals(Buffer.from(groupId))) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Transaction utility functions
 */
export class TransactionUtils {
  /**
   * Encode note to Uint8Array
   */
  static encodeNote(note: string): Uint8Array {
    return new TextEncoder().encode(note);
  }

  /**
   * Decode note from Uint8Array
   */
  static decodeNote(note: Uint8Array): string {
    return new TextDecoder().decode(note);
  }

  /**
   * Generate transaction ID
   */
  static generateTransactionId(transaction: algosdk.Transaction): string {
    return transaction.txID();
  }

  /**
   * Convert microAlgos to Algos
   */
  static microAlgosToAlgos(microAlgos: number): number {
    return microAlgos / 1_000_000;
  }

  /**
   * Convert Algos to microAlgos
   */
  static algosToMicroAlgos(algos: number): number {
    return Math.floor(algos * 1_000_000);
  }
}
