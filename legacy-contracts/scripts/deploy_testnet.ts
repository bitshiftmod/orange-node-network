import algosdk from 'algosdk';

import { OrangeSubscribersClient } from '../src/OrangeSubscribersClient';

const { DEPLOYER_MNEMONIC } = process.env;

const ALGOD_SERVER = 'https://testnet-api.algonode.cloud';
const ALGOD_TOKEN = '';
const ALGOD_PORT = '443';

// const APP_ID = 0;
const APP_ID = 628375398;

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

async function deploy(name: string) {
  console.log(`Deploying app: ${name}`);
  const result = await appClient.create.createApplication({});

  console.log(result);

  // const appId = result['application-index'];
  // console.log(
  //   `App (${name}) deployed successfully. App ID:
  //   ${appId.toString()}
  //   (https://app.dappflow.org/explorer/application/${appId})`
  // );
}

deploy('Orange Subscribers').catch((e) => {
  console.error(e);
});
