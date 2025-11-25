import { getTransactionParams, sendTransaction } from '@algorandfoundation/algokit-utils';
import {
  Account,
  Algodv2,
  makeAssetCreateTxnWithSuggestedParamsFromObject,
  makeAssetTransferTxnWithSuggestedParamsFromObject,
} from 'algosdk';

const TOKEN_SUPPLY = 4000000_00000000;
const TOKEN_DECIMALS = 8;

export const optInAsset = async (from: Account, assetId: number, algod: Algodv2) => {
  // opt-in txn for user for the asset
  const optInTxn = makeAssetTransferTxnWithSuggestedParamsFromObject({
    from: from.addr,
    to: from.addr,
    amount: 0,
    assetIndex: assetId,
    suggestedParams: await getTransactionParams(undefined, algod),
  });

  await sendTransaction({ transaction: optInTxn, from }, algod);
};

export const createTestAsset = async (from: Account, algod: Algodv2) => {
  console.log('Creating asset...');
  const assetCreateTxn = makeAssetCreateTxnWithSuggestedParamsFromObject({
    from: from.addr,
    manager: from.addr,
    assetName: 'Test Asset',
    unitName: 'TEST',
    decimals: TOKEN_DECIMALS,
    total: TOKEN_SUPPLY,
    defaultFrozen: false,
    suggestedParams: await getTransactionParams(undefined, algod),
  });

  const res = await sendTransaction(
    {
      transaction: assetCreateTxn,
      from,
      sendParams: {},
    },
    algod
  );

  const { confirmation } = res;

  const assetId = confirmation?.assetIndex;

  if (assetId === undefined) {
    throw new Error('failed to create asset');
  }

  return assetId;
};
