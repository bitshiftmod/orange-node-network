import algosdk from "algosdk";
import abi from "./OrangeSubscribers.arc4.json";

export interface OrangeSubscription {
  expirationDateRaw: number;
  expirationDate: Date;
}

export const Subscription30Day = 1;
export const SubscriptionYear = 2;
export type SubscriptionType = 1 | 2;

// from use-wallet
export type Txn = {
  apaa: Uint8Array;
  apas: number[];
  apid: number;
  fee: number;
  fv: number;
  gen: string;
  gh: Uint8Array;
  grp: Uint8Array;
  lv: number;
  snd: Uint8Array;
  type: string;
};

// export type TransactionSigner = (
//   transactions: Uint8Array[] | Uint8Array[][],
//   indexesToSign?: number[],
//   returnGroup?: boolean
// ) => Promise<Uint8Array[]>;
export type TransactionSender = (
  transactions: Uint8Array[],
  waitRoundsToConfirm?: number
) => Promise<{
  "confirmed-round": number;
  "global-state-delta": Record<string, unknown>[];
  "pool-error": string;
  txn: {
    sig: Uint8Array;
    txn: Txn;
  };
  txId: string;
  id: string;
}>;

const ALGOD_SERVER = "https://testnet-api.algonode.cloud";
const ALGOD_TOKEN = "";
const ALGOD_PORT = "443";

const APP_ID = 628375398;

const algod = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);

export const getContractDetails = async () => {
  try {
    const appInfoResponse = await algod.getApplicationByID(APP_ID).do();
    const globalState = appInfoResponse["params"]["global-state"];

    const details = globalState.reduce(
      (acc: Map<string, any>, entry: { key: string; value: any }) => {
        const key = atob(entry.key);
        let value;
        if (entry.value.type == 1) {
          const buffer = Buffer.from(entry.value.bytes, "base64");
          value = algosdk.encodeAddress(buffer);
        } else if (entry.value.type == 2) {
          value = entry.value.uint;
        } else {
          value = entry.value;
        }
        acc.set(key, value);
        return acc;
      },
      new Map<string, any>()
    );

    return details;
  } catch (error) {
    console.error("Failed to read global state:", error);
    throw error; // Or handle the error as per your application's error handling policy
  }
};

export const getSubscription = async (
  address: string
): Promise<OrangeSubscription | undefined> => {
  try {
    const box = await algod
      .getApplicationBoxByName(APP_ID, algosdk.decodeAddress(address).publicKey)
      .do();

    console.log('box', box)

    if (box.value !== undefined) {
      const seconds = algosdk.decodeUint64(box.value, "safe");

      return {
        expirationDateRaw: seconds,
        expirationDate: new Date(seconds * 1000),
      };
    }
  } catch (e) {}
  return undefined;
};

export const subscribe = async (
  subscriptionType: SubscriptionType,
  address: string,
  signer: algosdk.TransactionSigner,
  // txsSender: TransactionSender
) => {
  const contract = new algosdk.ABIContract(abi);
  const accountInfo = await algod.accountInformation(address).do();
  const details = await getContractDetails();

  const subscriptionAmount =
    subscriptionType === Subscription30Day
      ? details.get("sp30d")
      : details.get("spy");
  const oraAsaId = details.get("oraAsaId");

  const oraBalance =
    accountInfo.assets.find((asset: any) => asset["asset-id"] === oraAsaId)
      ?.amount || 0;

  if (oraBalance < subscriptionAmount) {
    throw new Error(
      `Insufficient balance or asset id ${oraAsaId} for subscription. Required: ${subscriptionAmount} Available: ${oraBalance}`
    );
  }

  // console.log("Subscription Price: " + subscriptionAmount);
  // console.log(accountInfo);

  try {
    const atc = new algosdk.AtomicTransactionComposer();
    const suggestedParams = await algod.getTransactionParams().do();
    // @ts-ignore
    // const signer = async (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => {
    //     return txsSigner(txnGroup, indexesToSign);
    // };
    // atc.addTransaction({
    //   txn: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    //     from: address,
    //     to: algosdk.getApplicationAddress(APP_ID),
    //     assetIndex: oraAsaId,
    //     amount: subscriptionAmount,
    //     suggestedParams,
    //   }), 
    //   signer 
    // });



    const paymentTx = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      from: address,
      to: algosdk.getApplicationAddress(APP_ID),
      assetIndex: oraAsaId,
      amount: subscriptionAmount,
      suggestedParams,
    });

    atc.addMethodCall({
      appID: APP_ID,
      method: contract.getMethodByName("subscribe"),
      sender: address,
      methodArgs: [{ txn: paymentTx, signer}, subscriptionType],
      boxes: [
        {
          appIndex: APP_ID,
          name: algosdk.decodeAddress(address).publicKey,
        },
      ],
      appForeignAssets: [oraAsaId],
      signer,
      suggestedParams,
    });
    atc.buildGroup();
    // @ts-ignore

    console.log(atc);

    return await atc.execute(algod, 4);
    // const transactions = atc.transactions.map((tx) =>
    //   algosdk.encodeUnsignedTransaction(tx.txn)
    // );
    

    // const signedTxs = await signer(transactions);
    // return await txsSender(atc.);

  } catch (e: any) {
    throw e; 
  }
};
