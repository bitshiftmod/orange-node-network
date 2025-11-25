import { Contract } from '@algorandfoundation/tealscript';

// Gift NFTs
const TOTAL_SUPPLY = 10_000_000_000;

// allowed subscription types
const DAYS_30 = 1; // 30 Days
const YEAR = 2; // 365 Days

const DEFAULT_30DAY_PRICE = 1_00000000;
const DEFAULT_YEAR_PRICE = 12_00000000;

// time in seconds, to work with Algorand's latestTimestamp value in seconds
const DAY_DUR = 60 * 60 * 24;
const DAYS_30_DUR = DAY_DUR * 30;
const YEAR_DUR = DAY_DUR * 365;

// GIFT NFTS (ARC-19)
const IPFS_URL = 'template-ipfs://{ipfscid:1:raw:reserve:sha2-256}';

// FIXME: add hashed IPFS CID for reserve address
// const IPFS_CID = 'QmUitxJuPJJrcuAdAiVdEEpuzGmsELGgAvhLd5FiXRShEu';

// eslint-disable-next-line no-unused-vars
class OrangeSubscribers extends Contract {
  manager = GlobalStateKey<Address>({ key: 'manager' });

  oraAsaId = GlobalStateKey<AssetID>({ key: 'oraAsaId' });

  giftSubscription30day = GlobalStateKey<AssetID>({ key: 'gs30d' });

  giftSubscriptionYear = GlobalStateKey<AssetID>({ key: 'gsy' });

  subscriptions = BoxMap<Address, uint64>();

  subscriptionPrice30day = GlobalStateKey<uint64>({ key: 'sp30d' });

  subscriptionPriceYear = GlobalStateKey<uint64>({ key: 'spy' });

  @allow.bareCreate()
  createApplication(): void {
    this.subscriptionPrice30day.value = DEFAULT_30DAY_PRICE;
    this.subscriptionPriceYear.value = DEFAULT_YEAR_PRICE;
    this.manager.value = globals.creatorAddress;
  }

  @allow.bareCall('UpdateApplication')
  updateApplication(): void {
    verifyAppCallTxn(this.txn, { sender: this.manager.value });
  }

  @allow.bareCall('DeleteApplication')
  deleteApplication(): void {
    verifyAppCallTxn(this.txn, { sender: this.manager.value });
  }

  bootstrap(oraAsaId: AssetID): void {
    assert(this.oraAsaId.value === AssetID.zeroIndex, 'Already bootstrapped');
    assert(oraAsaId !== AssetID.zeroIndex, 'ASA must be non-zero');
    verifyAppCallTxn(this.txn, { sender: this.manager.value });

    this.oraAsaId.value = oraAsaId;

    // opt contract into ASA
    sendAssetTransfer({
      assetReceiver: this.app.address,
      assetAmount: 0,
      xferAsset: oraAsaId,
    });

    this.createGiftNFTs();
  }

  private createGiftNFTs(): void {
    verifyAppCallTxn(this.txn, { sender: this.manager.value });

    assert(this.giftSubscription30day.value === AssetID.zeroIndex, 'Gift NFTs already created');
    assert(this.giftSubscriptionYear.value === AssetID.zeroIndex, 'Gift NFTs already created');

    this.giftSubscription30day.value = sendAssetCreation({
      configAssetName: 'ORA 30 Day Subscription',
      configAssetUnitName: 'ORA30day',
      configAssetTotal: TOTAL_SUPPLY,
      configAssetDecimals: 0,
      configAssetManager: this.app.address,
      configAssetReserve: this.app.address,
      configAssetFreeze: Address.zeroAddress,
      configAssetClawback: Address.zeroAddress,
      configAssetURL: IPFS_URL,
      fee: 0,
    });

    this.giftSubscriptionYear.value = sendAssetCreation({
      configAssetName: 'ORA 1 Year Subscription',
      configAssetUnitName: 'ORA1Year',
      configAssetTotal: TOTAL_SUPPLY,
      configAssetDecimals: 0,
      configAssetManager: this.app.address,
      configAssetReserve: this.app.address,
      configAssetFreeze: Address.zeroAddress,
      configAssetClawback: Address.zeroAddress,
      configAssetURL: IPFS_URL,
      fee: 0,
    });
  }

  mintGiftNFT(oraPayment: AssetTransferTxn, subscriptionType: uint8): void {
    assert(subscriptionType === DAYS_30 || subscriptionType === YEAR, 'Invalid subscription type');

    const price = subscriptionType === DAYS_30 ? this.subscriptionPrice30day.value : this.subscriptionPriceYear.value;

    verifyAssetTransferTxn(oraPayment, {
      sender: this.txn.sender,
      assetReceiver: this.app.address,
      xferAsset: this.oraAsaId.value,
      assetAmount: price,
    });

    const subscriptionAssetId =
      subscriptionType === DAYS_30 ? this.giftSubscription30day.value : this.giftSubscriptionYear.value;

    assert(
      this.txn.sender.isOptedInToAsset(subscriptionAssetId),
      'User not opted into asset id: ' + subscriptionAssetId
    );

    sendAssetTransfer({
      sender: this.app.address,
      assetReceiver: this.txn.sender,
      assetAmount: 1,
      xferAsset: subscriptionAssetId,
    });
  }

  redeemGiftNFT(giftPayment: AssetTransferTxn): void {
    assert(
      giftPayment.xferAsset === this.giftSubscription30day.value ||
        giftPayment.xferAsset === this.giftSubscriptionYear.value,
      'Invalid gift subscription NFT'
    );

    verifyAssetTransferTxn(giftPayment, {
      sender: this.txn.sender,
      assetReceiver: this.app.address,
      assetAmount: 1,
    });

    const existingSubscription = this.subscriptions(this.txn.sender).exists
      ? this.subscriptions(this.txn.sender).value
      : 0;

    const currentEnd = existingSubscription < globals.latestTimestamp ? globals.latestTimestamp : existingSubscription;

    const dur = giftPayment.xferAsset === this.giftSubscription30day.value ? DAYS_30_DUR : YEAR_DUR;
    const newEnd = currentEnd + dur;

    this.subscriptions(this.txn.sender).value = newEnd;
  }

  subscribe(oraPayment: AssetTransferTxn, subscriptionType: uint8): void {
    assert(subscriptionType === DAYS_30 || subscriptionType === YEAR, 'Invalid subscription type');

    const price = subscriptionType === DAYS_30 ? this.subscriptionPrice30day.value : this.subscriptionPriceYear.value;

    verifyAssetTransferTxn(oraPayment, {
      sender: this.txn.sender,
      assetReceiver: this.app.address,
      xferAsset: this.oraAsaId.value,
      assetAmount: price,
    });

    const existingSubscription = this.subscriptions(this.txn.sender).exists
      ? this.subscriptions(this.txn.sender).value
      : 0;

    const currentEnd = existingSubscription < globals.latestTimestamp ? globals.latestTimestamp : existingSubscription;

    const dur = subscriptionType === DAYS_30 ? DAYS_30_DUR : YEAR_DUR;
    const newEnd = currentEnd + dur;

    this.subscriptions(this.txn.sender).value = newEnd;
  }

  getLatestTimestamp(): uint64 {
    return globals.latestTimestamp;
  }
}
