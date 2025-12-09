import type { uint64 } from '@algorandfoundation/algorand-typescript';
import {
  Contract,
  GlobalState,
  BoxMap,
  assert,
  Txn,
  Global,
  itxn,
  Account,
  Asset,
  gtxn,
  emit,
} from '@algorandfoundation/algorand-typescript';

/**
 * Orange Network Subscription Management Contract - Algorand TypeScript v1.0
 *
 * Manages user subscriptions to the Orange Network with support for:
 * - Direct subscription payments
 * - Gift subscription NFTs (ARC-19)
 * - 30-day and 1-year subscription tiers
 * - Subscription expiration tracking
 */

// Constants (module-level for Puya compatibility)
const TOTAL_SUPPLY: uint64 = 10_000_000_000;
const DAYS_30: uint64 = 1; // 30 Days subscription type
const YEAR: uint64 = 2; // 365 Days subscription type
const DEFAULT_30DAY_PRICE: uint64 = 100_000_000; // 100 ORA (assuming 6 decimals)
const DEFAULT_YEAR_PRICE: uint64 = 1_200_000_000; // 1200 ORA
const DAY_DUR: uint64 = 86400; // 60 * 60 * 24 seconds
const DAYS_30_DUR: uint64 = 2_592_000; // 30 days in seconds
const YEAR_DUR: uint64 = 31_536_000; // 365 days in seconds
const IPFS_URL = 'template-ipfs://{ipfscid:1:raw:reserve:sha2-256}';

class OrangeSubscriptionsContract extends Contract {
  // Administrative state
  admin = GlobalState<Account>();
  isPaused = GlobalState<boolean>();

  // ASA configuration
  oraAsaId = GlobalState<Asset>();
  giftSubscription30day = GlobalState<Asset>();
  giftSubscriptionYear = GlobalState<Asset>();

  // Pricing configuration
  subscriptionPrice30day = GlobalState<uint64>();
  subscriptionPriceYear = GlobalState<uint64>();

  // Subscription storage
  subscriptions = BoxMap<Account, uint64>({ keyPrefix: 'subs' });

  /**
   * Initialize the subscription contract
   */
  createApplication(): void {
    this.admin.value = Txn.sender;
    this.isPaused.value = false;
    this.subscriptionPrice30day.value = DEFAULT_30DAY_PRICE;
    this.subscriptionPriceYear.value = DEFAULT_YEAR_PRICE;
    this.oraAsaId.value = Asset();
    this.giftSubscription30day.value = Asset();
    this.giftSubscriptionYear.value = Asset();
  }

  /**
   * Bootstrap the contract with ORA ASA
   */
  bootstrap(oraAsaId: Asset): void {
    assert(Txn.sender === this.admin.value, 'Admin only');
    assert(this.oraAsaId.value === Asset(), 'Already bootstrapped');
    assert(oraAsaId !== Asset(), 'ASA must be non-zero');

    this.oraAsaId.value = oraAsaId;

    // Opt contract into ASA
    itxn.assetTransfer({
      assetReceiver: Global.currentApplicationAddress,
      assetAmount: 0,
      xferAsset: oraAsaId,
      fee: Global.minTxnFee
    }).submit();

    this.createGiftNFTs();
  }

  /**
   * Create gift subscription NFTs
   */
  private createGiftNFTs(): void {
    assert(this.giftSubscription30day.value === Asset(), 'Gift NFTs already created');
    assert(this.giftSubscriptionYear.value === Asset(), 'Gift NFTs already created');

    // Create 30-day gift NFT
    const nft30day = itxn.assetConfig({
      assetName: 'ORA 30 Day Subscription',
      unitName: 'ORA30day',
      total: TOTAL_SUPPLY,
      decimals: 0,
      manager: Global.currentApplicationAddress,
      reserve: Global.currentApplicationAddress,
      url: IPFS_URL,
      fee: Global.minTxnFee
    }).submit().createdAsset;
    
    this.giftSubscription30day.value = nft30day;

    // Create 1-year gift NFT
    const nftYear = itxn.assetConfig({
      assetName: 'ORA 1 Year Subscription',
      unitName: 'ORA1Year',
      total: TOTAL_SUPPLY,
      decimals: 0,
      manager: Global.currentApplicationAddress,
      reserve: Global.currentApplicationAddress,
      url: IPFS_URL,
      fee: Global.minTxnFee
    }).submit().createdAsset;
    
    this.giftSubscriptionYear.value = nftYear;
  }

  /**
   * Mint a gift subscription NFT
   */
  mintGiftNFT(subscriptionType: uint64): void {
    assert(!this.isPaused.value, 'Contract is paused');
    assert(subscriptionType === DAYS_30 || subscriptionType === YEAR, 'Invalid subscription type');

    const price = subscriptionType === DAYS_30 ? this.subscriptionPrice30day.value : this.subscriptionPriceYear.value;
    
    // Verify payment transaction
    assert(Txn.groupIndex > 0, 'Payment required');
    const oraPayment = gtxn.AssetTransferTxn(Txn.groupIndex - 1);

    assert(oraPayment.assetReceiver === Global.currentApplicationAddress, 'Payment required');
    assert(oraPayment.xferAsset === this.oraAsaId.value, 'Wrong ASA');
    assert(oraPayment.assetAmount === price, 'Incorrect payment amount');

    const subscriptionAssetId = subscriptionType === DAYS_30 ?
      this.giftSubscription30day.value : this.giftSubscriptionYear.value;

    assert(subscriptionAssetId !== Asset(), 'Gift NFTs not created');

    // Transfer NFT to buyer
    itxn.assetTransfer({
      assetReceiver: Txn.sender,
      assetAmount: 1,
      xferAsset: subscriptionAssetId,
      fee: Global.minTxnFee
    }).submit();

    // Emit ARC-28 event
    emit('GiftNFTMinted', Txn.sender, subscriptionType, price);
  }

  /**
   * Redeem a gift subscription NFT for subscription time
   */
  redeemGiftNFT(): void {
    // Verify gift NFT payment
    assert(Txn.groupIndex > 0, 'Gift NFT required');
    const giftPayment = gtxn.AssetTransferTxn(Txn.groupIndex - 1);

    assert(giftPayment.assetReceiver === Global.currentApplicationAddress, 'Gift NFT required');
    assert(
      giftPayment.xferAsset === this.giftSubscription30day.value ||
      giftPayment.xferAsset === this.giftSubscriptionYear.value,
      'Invalid gift subscription NFT'
    );
    assert(giftPayment.assetAmount === 1, 'Invalid gift amount');

    const sender = Txn.sender;
    const existingSubscription: uint64 = this.subscriptions(sender).exists ?
      this.subscriptions(sender).value : 0;

    const currentEnd = existingSubscription < Global.latestTimestamp ?
      Global.latestTimestamp : existingSubscription;

    const dur: uint64 = giftPayment.xferAsset === this.giftSubscription30day.value ?
      DAYS_30_DUR : YEAR_DUR;
    const newEnd: uint64 = currentEnd + dur;

    this.subscriptions(sender).value = newEnd;

    // Emit ARC-28 event
    emit('GiftNFTRedeemed', sender, dur, newEnd);
  }

  /**
   * Subscribe directly with ORA tokens
   */
  subscribe(subscriptionType: uint64): void {
    assert(!this.isPaused.value, 'Contract is paused');
    assert(subscriptionType === DAYS_30 || subscriptionType === YEAR, 'Invalid subscription type');

    const price = subscriptionType === DAYS_30 ?
      this.subscriptionPrice30day.value : this.subscriptionPriceYear.value;

    // Verify payment transaction
    assert(Txn.groupIndex > 0, 'Payment required');
    const oraPayment = gtxn.AssetTransferTxn(Txn.groupIndex - 1);

    assert(oraPayment.assetReceiver === Global.currentApplicationAddress, 'Payment required');
    assert(oraPayment.xferAsset === this.oraAsaId.value, 'Wrong ASA');
    assert(oraPayment.assetAmount === price, 'Incorrect payment amount');

    const sender = Txn.sender;
    const existingSubscription: uint64 = this.subscriptions(sender).exists ?
      this.subscriptions(sender).value : 0;

    const currentEnd = existingSubscription < Global.latestTimestamp ?
      Global.latestTimestamp : existingSubscription;

    const dur: uint64 = subscriptionType === DAYS_30 ? DAYS_30_DUR : YEAR_DUR;
    const newEnd: uint64 = currentEnd + dur;

    this.subscriptions(sender).value = newEnd;

    // Emit ARC-28 event
    emit('Subscribed', sender, subscriptionType, price, newEnd);
  }

  /**
   * Update subscription prices (admin only)
   */
  updatePrices(price30day: uint64, priceYear: uint64): void {
    assert(Txn.sender === this.admin.value, 'Admin only');
    assert(price30day > 0, 'Price must be positive');
    assert(priceYear > 0, 'Price must be positive');

    this.subscriptionPrice30day.value = price30day;
    this.subscriptionPriceYear.value = priceYear;
  }

  /**
   * Pause/unpause contract (admin only)
   */
  setPauseState(paused: boolean): void {
    assert(Txn.sender === this.admin.value, 'Admin only');
    this.isPaused.value = paused;
  }

  /**
   * Update admin address (admin only)
   */
  updateAdmin(newAdmin: Account): void {
    assert(Txn.sender === this.admin.value, 'Admin only');
    this.admin.value = newAdmin;
  }

  /**
   * Get subscription expiration for a user
   */
  getSubscription(user: Account): uint64 {
    return this.subscriptions(user).exists ? this.subscriptions(user).value : 0;
  }

  /**
   * Check if a user has active subscription
   */
  hasActiveSubscription(user: Account): boolean {
    if (!this.subscriptions(user).exists) return false;
    return this.subscriptions(user).value > Global.latestTimestamp;
  }

  /**
   * Get current timestamp
   */
  getLatestTimestamp(): uint64 {
    return Global.latestTimestamp;
  }
}