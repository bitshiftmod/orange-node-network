import algosdk, { makeAssetCreateTxnWithSuggestedParamsFromObject } from 'algosdk';

import { OrangeSubscribersClient } from '../src/OrangeSubscribersClient';
import { getTransactionParams, sendTransaction, microAlgos } from '@algorandfoundation/algokit-utils';

const { DEPLOYER_MNEMONIC } = process.env;

const ALGOD_SERVER = 'https://testnet-api.algonode.cloud';
const ALGOD_TOKEN = '';
const ALGOD_PORT = '443';

// const APP_ID = 0;
const APP_ID = 628375398;

const TOKEN_SUPPLY = 4000000_00000000;
const TOKEN_DECIMALS = 8;

const algod = new algosdk.Algodv2(ALGOD_TOKEN as string, ALGOD_SERVER as string, ALGOD_PORT as string);
const creator = algosdk.mnemonicToSecretKey(DEPLOYER_MNEMONIC as string);

const appClient = new OrangeSubscribersClient(
  {
    sender: creator,
    resolveBy: 'id',
    id: APP_ID,
  },
  algod
);

async function bootstrap(name: string) {
  console.log(`Boostrapping app: ${name}`);

  // console.log('Creating asset...');
  // const assetCreateTxn = makeAssetCreateTxnWithSuggestedParamsFromObject({
  //   from: creator.addr,
  //   manager: creator.addr,
  //   reserve: creator.addr,
  //   assetName: 'Test Asset',
  //   unitName: 'TEST',
  //   decimals: TOKEN_DECIMALS,
  //   total: TOKEN_SUPPLY,
  //   defaultFrozen: false,
  //   suggestedParams: await getTransactionParams(undefined, algod),
  // });

  // const res = await sendTransaction(
  //   {
  //     transaction: assetCreateTxn,
  //     from: creator,
  //     sendParams: {},
  //   },
  //   algod
  // );

  // const { confirmation } = res;

  // const assetId = confirmation?.assetIndex;

  // if (assetId === undefined) {
  //   throw new Error('failed to create asset');
  // }

  const assetId = 628378359;

  await appClient.bootstrap(
    { oraAsaId: assetId },
    {
      sender: creator,
      sendParams: {
        fee: microAlgos(6000),
      },
      assets: [assetId],
    }
  );
}

bootstrap('Orange Subscribers').catch((e) => {
  console.error(e);
});
