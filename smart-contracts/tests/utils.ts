import algosdk from 'algosdk';

/**
 * Create a test ORA asset for testing subscription payments
 */
export async function createTestAsset(
  creator: algosdk.Account,
  algod: algosdk.Algodv2,
  options?: {
    name?: string;
    unitName?: string;
    total?: number | bigint;
    decimals?: number;
  }
): Promise<number> {
  const suggestedParams = await algod.getTransactionParams().do();
  
  const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
    from: creator.addr,
    total: options?.total ?? 1_000_000_000_000, // 1 trillion with 6 decimals
    decimals: options?.decimals ?? 6,
    defaultFrozen: false,
    assetName: options?.name ?? 'Test ORA',
    unitName: options?.unitName ?? 'ORA',
    manager: creator.addr,
    reserve: creator.addr,
    freeze: creator.addr,
    clawback: creator.addr,
    suggestedParams,
  });

  const signedTxn = txn.signTxn(creator.sk);
  const { txId } = await algod.sendRawTransaction(signedTxn).do();
  const result = await algosdk.waitForConfirmation(algod, txId, 4);
  
  return result['asset-index'];
}

/**
 * Helper to create a payment transaction
 */
export function createPaymentTxn(
  from: string,
  to: string,
  amount: number | bigint,
  suggestedParams: algosdk.SuggestedParams
): algosdk.Transaction {
  return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from,
    to,
    amount,
    suggestedParams,
  });
}

/**
 * Helper to create an asset transfer transaction
 */
export function createAssetTransferTxn(
  from: string,
  to: string,
  assetIndex: number | bigint,
  amount: number | bigint,
  suggestedParams: algosdk.SuggestedParams
): algosdk.Transaction {
  return algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from,
    to,
    assetIndex,
    amount,
    suggestedParams,
  });
}

/**
 * Helper to opt an account into an asset
 */
export async function optInToAsset(
  account: algosdk.Account,
  assetId: number | bigint,
  algod: algosdk.Algodv2
): Promise<string> {
  const suggestedParams = await algod.getTransactionParams().do();
  
  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from: account.addr,
    to: account.addr,
    assetIndex: assetId,
    amount: 0,
    suggestedParams,
  });

  const signedTxn = txn.signTxn(account.sk);
  const { txId } = await algod.sendRawTransaction(signedTxn).do();
  await algosdk.waitForConfirmation(algod, txId, 4);
  
  return txId;
}

/**
 * Helper to transfer assets between accounts
 */
export async function transferAsset(
  from: algosdk.Account,
  to: string,
  assetId: number | bigint,
  amount: number | bigint,
  algod: algosdk.Algodv2
): Promise<string> {
  const suggestedParams = await algod.getTransactionParams().do();
  
  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from: from.addr,
    to,
    assetIndex: assetId,
    amount,
    suggestedParams,
  });

  const signedTxn = txn.signTxn(from.sk);
  const { txId } = await algod.sendRawTransaction(signedTxn).do();
  await algosdk.waitForConfirmation(algod, txId, 4);
  
  return txId;
}

/**
 * Helper to check if timestamp is within expected range
 */
export function expectTimestampNear(
  actual: number | bigint,
  expected: number | bigint,
  toleranceSeconds: number = 60
): void {
  const diff = Math.abs(Number(actual) - Number(expected));
  if (diff > toleranceSeconds) {
    throw new Error(
      `Timestamp ${actual} is not within ${toleranceSeconds}s of expected ${expected} (diff: ${diff}s)`
    );
  }
}

/**
 * Helper to calculate subscription end time
 */
export function calculateSubscriptionEnd(
  currentTimestamp: number | bigint,
  existingEnd: number | bigint,
  durationType: '30day' | 'year'
): number {
  const oneDay = 24 * 60 * 60;
  const duration = durationType === '30day' ? 30 * oneDay : 365 * oneDay;
  
  const current = Number(currentTimestamp);
  const existing = Number(existingEnd);
  
  // If existing subscription is in the future, extend from there
  // Otherwise, extend from current time
  const baseTime = existing > current ? existing : current;
  
  return baseTime + duration;
}

/**
 * Constants matching contract values
 */
export const CONSTANTS = {
  // Subscription types
  DAYS_30: 1,
  YEAR: 2,
  
  // Status values for nodes
  NODE_STATUS_ACTIVE: 0,
  NODE_STATUS_SUSPENDED: 1,
  NODE_STATUS_BANNED: 2,
  
  // Status values for gateways
  GATEWAY_STATUS_ACTIVE: 0,
  GATEWAY_STATUS_SUSPENDED: 1,
  GATEWAY_STATUS_BANNED: 2,
  
  // Default prices (with 6 decimals)
  DEFAULT_30DAY_PRICE: 100_000000, // 100 ORA
  DEFAULT_YEAR_PRICE: 1_200_000000, // 1200 ORA
  
  // Default stakes
  DEFAULT_NODE_STAKE: 4_000_000000, // 4000 ORA
  DEFAULT_GATEWAY_STAKE: 12_000_000000, // 12000 ORA
  
  // Time constants
  ONE_DAY_SECONDS: 86400,
  THIRTY_DAYS_SECONDS: 2_592_000,
  ONE_YEAR_SECONDS: 31_536_000,
  HEARTBEAT_INTERVAL: 300, // 5 minutes
} as const;

/**
 * Helper to generate random P2P ID
 */
export function generateP2PId(prefix: string = 'node'): Uint8Array {
  const random = Math.random().toString(36).substring(2, 15);
  return new Uint8Array(Buffer.from(`${prefix}-${random}`));
}

/**
 * Helper to generate random endpoint
 */
export function generateEndpoint(prefix: string = 'gateway'): Uint8Array {
  const random = Math.random().toString(36).substring(2, 10);
  return new Uint8Array(Buffer.from(`${prefix}-${random}.example.com`));
}

/**
 * Helper to generate mock public key
 */
export function generateMockPublicKey(): Uint8Array {
  return new Uint8Array(32).map(() => Math.floor(Math.random() * 256));
}
