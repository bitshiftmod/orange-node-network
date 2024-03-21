import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing';
import * as algokit from '@algorandfoundation/algokit-utils';
import algosdk, { Account } from 'algosdk';
import { OrangeSubscribersClient } from '../src/OrangeSubscribersClient';
import { createTestAsset } from './utils';

const fixture = algorandFixture({ testAccountFunding: algokit.algos(100) });
algokit.Config.configure({ populateAppCallResources: true });

let appClient: OrangeSubscribersClient;
let oraAsaId: number | bigint;
let mainAccount: Account;

describe('TestDappContracts', () => {
  beforeEach(fixture.beforeEach);

  beforeAll(async () => {
    await fixture.beforeEach();
    const { algod, testAccount } = fixture.context;
    mainAccount = testAccount;

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
          fee: algokit.microAlgos(6000),
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

  describe('Subscriptions', () => {
    test('should fail for invalid subscription types', async () => {
      const { algod } = fixture.context;

      const globalState = await appClient.getGlobalState();
      const appRef = await appClient.appClient.getAppReference();

      const oraTx = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: mainAccount.addr,
        to: appRef.appAddress,
        amount: globalState.sp30d!.asNumber() + 1,
        assetIndex: oraAsaId as number,
        suggestedParams: await algod.getTransactionParams().do(),
      });

      try {
        await appClient.subscribe(
          { oraPayment: oraTx, subscriptionType: 0 },
          {
            assets: [oraAsaId as number],
            sender: mainAccount,
            sendParams: {
              fee: algokit.microAlgos(1000),
            },
          }
        );
        expect(true).toBe(false);
      } catch (e) {
        expect((e as Error).message).toContain('assert failed');
      }
    });

    test('should fail for incorrect payment', async () => {
      const { algod } = fixture.context;

      const globalState = await appClient.getGlobalState();
      const appRef = await appClient.appClient.getAppReference();

      const oraTx = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: mainAccount.addr,
        to: appRef.appAddress,
        amount: globalState.sp30d!.asNumber() + 1,
        assetIndex: oraAsaId as number,
        suggestedParams: await algod.getTransactionParams().do(),
      });

      try {
        await appClient.subscribe(
          { oraPayment: oraTx, subscriptionType: 1 },
          {
            assets: [oraAsaId as number],
            sender: mainAccount,
            sendParams: {
              fee: algokit.microAlgos(1000),
            },
          }
        );
        expect(true).toBe(false);
      } catch (e) {
        expect((e as Error).message).toContain('assert failed');
      }
    });

    test('should pass for correct payment for 30 Day', async () => {
      const { algod } = fixture.context;

      let globalState = await appClient.getGlobalState();
      const appRef = await appClient.appClient.getAppReference();

      const oraTx = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: mainAccount.addr,
        to: appRef.appAddress,
        amount: globalState.sp30d!.asBigInt(),
        assetIndex: oraAsaId as number,
        suggestedParams: await algod.getTransactionParams().do(),
      });

      const latestTimestamp = await appClient.getLatestTimestamp({});

      const res = await appClient.subscribe(
        { oraPayment: oraTx, subscriptionType: 1 },
        {
          assets: [oraAsaId as number],
          sender: mainAccount,
          sendParams: {
            fee: algokit.microAlgos(1000),
          },
        }
      );
      expect(res.transactions.length).toBe(2);

      globalState = await appClient.getGlobalState();
      // console.log(await appClient.appClient.getBoxNames());

      const account = algosdk.decodeAddress(mainAccount.addr);
      const boxValue = await appClient.appClient.getBoxValue(account.publicKey);

      const dateValue = algosdk.decodeUint64(boxValue, 'safe');
      const oneDay = 24 * 60 * 60;

      const expected = Number(latestTimestamp.return as bigint) + 30 * oneDay;
      const diff = Math.abs(expected - dateValue);

      expect(diff).toBeLessThan(60);
    });

    test('should pass for correct payment for 1 year', async () => {
      const { algod } = fixture.context;

      let globalState = await appClient.getGlobalState();
      const appRef = await appClient.appClient.getAppReference();

      const oraTx = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: mainAccount.addr,
        to: appRef.appAddress,
        amount: globalState.spy!.asBigInt(),
        assetIndex: oraAsaId as number,
        suggestedParams: await algod.getTransactionParams().do(),
      });

      const latestTimestamp = await appClient.getLatestTimestamp({});

      const res = await appClient.subscribe(
        { oraPayment: oraTx, subscriptionType: 2 },
        {
          assets: [oraAsaId as number],
          sender: mainAccount,
          sendParams: {
            fee: algokit.microAlgos(1000),
          },
        }
      );
      expect(res.transactions.length).toBe(2);

      globalState = await appClient.getGlobalState();
      // console.log(await appClient.appClient.getBoxNames());

      const account = algosdk.decodeAddress(mainAccount.addr);
      const boxValue = await appClient.appClient.getBoxValue(account.publicKey);

      const dateValue = algosdk.decodeUint64(boxValue, 'safe');
      const oneDay = 24 * 60 * 60;

      // checking 1 year plus the 30 day subscription from earlier
      const expected = Number(latestTimestamp.return as bigint) + (365 + 30) * oneDay;
      const diff = Math.abs(expected - dateValue);

      expect(diff).toBeLessThan(120);
    });
  });

  describe('Gift Subscription NFTs', () => {
    test('should allow minting and redeeming 30 day', async () => {
      const { algod, kmd } = fixture.context;

      const globalState = await appClient.getGlobalState();
      const appRef = await appClient.appClient.getAppReference();

      const newAccount = algosdk.generateAccount();

      await algokit.ensureFunded(
        {
          accountToFund: newAccount,
          minSpendingBalance: algokit.algos(100),
        },
        algod,
        kmd
      );
      await algokit.assetOptIn({ assetId: oraAsaId as number, account: newAccount }, algod);
      await algokit.transferAsset(
        { assetId: oraAsaId as number, amount: 20_00000000, from: mainAccount, to: newAccount },
        algod
      );
      await algokit.assetOptIn({ assetId: globalState.gs30d!.asNumber(), account: newAccount }, algod);

      const oraTx = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: newAccount.addr,
        to: appRef.appAddress,
        amount: globalState.sp30d!.asNumber(),
        assetIndex: oraAsaId as number,
        suggestedParams: await algod.getTransactionParams().do(),
      });

      const results = await appClient.mintGiftNft(
        { oraPayment: oraTx, subscriptionType: 1 },
        {
          assets: [oraAsaId as number],
          sender: newAccount,
          sendParams: {
            fee: algokit.microAlgos(2000),
          },
        }
      );
      expect(results.transactions.length).toBe(2);

      const giftTx = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: newAccount.addr,
        to: appRef.appAddress,
        amount: 1,
        assetIndex: globalState.gs30d!.asNumber(),
        suggestedParams: await algod.getTransactionParams().do(),
      });

      const redeemResults = await appClient.redeemGiftNft(
        { giftPayment: giftTx },
        {
          assets: [oraAsaId as number, globalState.gs30d!.asNumber()],
          sender: newAccount,
          sendParams: {
            fee: algokit.microAlgos(2000),
          },
        }
      );
      expect(redeemResults.transactions.length).toBe(2);

      const latestTimestamp = await appClient.getLatestTimestamp({});
      const account = algosdk.decodeAddress(newAccount.addr);
      const boxValue = await appClient.appClient.getBoxValue(account.publicKey);

      const dateValue = algosdk.decodeUint64(boxValue, 'safe');
      const oneDay = 24 * 60 * 60;

      const expected = Number(latestTimestamp.return as bigint) + 30 * oneDay;
      const diff = Math.abs(expected - dateValue);

      expect(diff).toBeLessThan(60);
    });
  });
});
