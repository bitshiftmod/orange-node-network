import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing';
import * as algokit from '@algorandfoundation/algokit-utils';
import { OrangeSubscribersClient } from '../src/OrangeSubscribersClient';
import { createTestAsset } from './utils';

const fixture = algorandFixture({ testAccountFunding: algokit.algos(100) });
algokit.Config.configure({ populateAppCallResources: true });

let appClient: OrangeSubscribersClient;
let oraAsaId: number | bigint;

describe('TestDappContracts', () => {
  beforeEach(fixture.beforeEach);

  beforeAll(async () => {
    await fixture.beforeEach();
    const { algod, testAccount } = fixture.context;

    appClient = new OrangeSubscribersClient(
      {
        sender: testAccount,
        resolveBy: 'id',
        id: 0,
      },
      algod
    );

    const appRes = await appClient.create.createApplication({});
    console.log(`App ID: ${appRes.appId}`);
    console.log(`App Address: ${appRes.appAddress}`);

    await appClient.appClient.fundAppAccount({ amount: algokit.algos(10) });
    const asaId = await createTestAsset(testAccount, algod);

    console.log('ASA ID:', asaId);

    oraAsaId = asaId;

    await appClient.bootstrap(
      { oraAsaId: asaId },
      {
        sender: testAccount,
        sendParams: {
          fee: algokit.microAlgos(5000),
        },
      }
    );
  });

  test('bootstrapped correctly', async () => {
    const globalState = await appClient.appClient.getGlobalState();
    expect(globalState.sp30d.value).toBe(1_00000000);
    expect(globalState.spy.value).toBe(12_00000000);
    expect(globalState.oraAsaId.value).toBe(oraAsaId);
  });
});
