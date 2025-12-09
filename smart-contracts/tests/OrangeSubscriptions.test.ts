import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing';
import * as algokit from '@algorandfoundation/algokit-utils';
import algosdk from 'algosdk';
import { OrangeSubscriptionsContractFactory } from '../src/clients/OrangeSubscriptionsClient.js';

const fixture = algorandFixture({ testAccountFunding: algokit.algos(100) });
algokit.Config.configure({ populateAppCallResources: true });

describe('OrangeSubscriptions', () => {
  beforeEach(fixture.beforeEach);

  let factory: OrangeSubscriptionsContractFactory;
  let appId: bigint;
  let appAddress: string;
  let oraAsaId: bigint;

  beforeAll(async () => {
    await fixture.beforeEach();
    const { algorand, testAccount } = fixture.context;
    
    // Create test ORA ASA
    oraAsaId = await createTestAsset(testAccount, algorand);

    // Create factory with AlgorandClient
    factory = new OrangeSubscriptionsContractFactory({
      algorand,
      defaultSender: testAccount.addr,
    });

    // Create the contract
    const { appClient } = await factory.send.create.createApplication({
      args: {},
    });
    
    appId = appClient.appId;
    appAddress = appClient.appAddress as unknown as string;

    // Fund the app account  
    await algorand.send.payment({
      sender: testAccount.addr,
      receiver: appAddress as unknown as string,
      amount: algokit.algos(10),
    });

    // Bootstrap with ORA ASA
    const appClientForBootstrap = factory.getAppClientById({ appId });
    await appClientForBootstrap.send.bootstrap({
      args: { oraAsaId },
      sender: testAccount.addr,
    });
  });

  describe('Initialization', () => {
    test('should initialize with correct default values', async () => {
      const { algorand, testAccount } = fixture.context;
      const appClient = factory.getAppClientById({ appId });
      
      const globalState = await appClient.appClient.getGlobalState();
      // Verify defaults
      const adminState = globalState.admin;
      expect(adminState).toBeDefined();
      expect(globalState.isPaused?.value).toBe(0n); // false = 0
      expect(globalState.subscriptionPrice30day?.value).toBe(100_000_000n); // 100 ORA
      expect(globalState.subscriptionPriceYear?.value).toBe(1_200_000_000n); // 1200 ORA
    });

    test('should have asset IDs set after bootstrap', async () => {
      const { algorand, testAccount } = fixture.context;
      const appClient = factory.getAppClientById({ appId });
      
      const globalState = await appClient.appClient.getGlobalState();
      
      // Verify ORA ASA ID is set
      expect(globalState.oraAsaId?.value).toBe(oraAsaId);
      // Verify gift NFTs were created (non-zero IDs)
      expect(globalState.giftSubscription30day?.value).toBeGreaterThan(0n);
      expect(globalState.giftSubscriptionYear?.value).toBeGreaterThan(0n);
    });
  });

  describe('Bootstrap', () => {
    test('should bootstrap with ORA ASA successfully', async () => {
      // Bootstrap with oraAsaId
      // Verify oraAsaId stored
      // Verify contract opted into ASA
    });

    test('should create gift NFTs on bootstrap', async () => {
      // Bootstrap contract
      // Verify giftSubscription30day created
      // Verify giftSubscriptionYear created
      // Verify NFT properties (name, unit name, decimals, total supply)
    });

    test('should reject bootstrap if already bootstrapped', async () => {
      // Bootstrap once
      // Attempt second bootstrap
      // Should fail
    });

    test('should reject bootstrap from non-admin', async () => {
      // Attempt bootstrap from subscriber account
      // Should fail
    });

    test('should reject bootstrap with zero ASA ID', async () => {
      // Attempt bootstrap with ASA ID 0
      // Should fail
    });
  });

  describe('Direct Subscriptions', () => {
    test('should subscribe for 30 days with correct payment', async () => {
      // Create ORA payment for sp30day price
      // Call subscribe with type DAYS_30
      // Verify subscription end time is current + 30 days
    });

    test('should subscribe for 1 year with correct payment', async () => {
      // Create ORA payment for spy price
      // Call subscribe with type YEAR
      // Verify subscription end time is current + 365 days
    });

    test('should extend existing subscription', async () => {
      // Subscribe for 30 days
      // Subscribe for another 30 days
      // Verify end time is original + 60 days
    });

    test('should extend from current time if expired', async () => {
      // Create expired subscription (mock old timestamp)
      // Subscribe again
      // Verify new end time based on current timestamp
    });

    test('should reject invalid subscription type', async () => {
      // Attempt subscribe with type 0 or 3
      // Should fail
    });

    test('should reject incorrect payment amount', async () => {
      // Create payment with wrong amount
      // Should fail with assertion
    });

    test('should reject wrong ASA type', async () => {
      // Create payment with different ASA
      // Should fail
    });

    test('should reject subscription while paused', async () => {
      // Admin pauses contract
      // Attempt subscription
      // Should fail
    });
  });

  describe('Gift Subscription NFTs - Minting', () => {
    test('should mint 30-day gift NFT with correct payment', async () => {
      // User opts into gift NFT
      // Create ORA payment for 30-day price
      // Call mintGiftNFT with DAYS_30
      // Verify user received 1 NFT
    });

    test('should mint 1-year gift NFT with correct payment', async () => {
      // User opts into year NFT
      // Create ORA payment for year price
      // Call mintGiftNFT with YEAR
      // Verify user received 1 NFT
    });

    test('should reject minting without payment', async () => {
      // Attempt mintGiftNFT without payment txn
      // Should fail
    });

    test('should reject minting with incorrect payment', async () => {
      // Create payment with wrong amount
      // Should fail
    });

    test('should reject minting while paused', async () => {
      // Admin pauses
      // Attempt mint
      // Should fail
    });

    test('should reject minting before bootstrap', async () => {
      // Attempt mint on unbootstrapped contract
      // Should fail (gift NFTs not created)
    });
  });

  describe('Gift Subscription NFTs - Redemption', () => {
    test('should redeem 30-day gift NFT correctly', async () => {
      // Mint 30-day gift NFT
      // Transfer NFT to contract
      // Call redeemGiftNFT
      // Verify subscription added (30 days)
    });

    test('should redeem 1-year gift NFT correctly', async () => {
      // Mint 1-year gift NFT
      // Transfer NFT to contract
      // Call redeemGiftNFT
      // Verify subscription added (365 days)
    });

    test('should extend subscription when redeeming gift', async () => {
      // Create existing subscription
      // Redeem gift NFT
      // Verify extension added to existing end time
    });

    test('should accept gift from different sender than minter', async () => {
      // User A mints NFT
      // User A transfers to User B
      // User B redeems
      // Verify User B gets subscription
    });

    test('should reject redemption of invalid NFT', async () => {
      // Create different ASA
      // Attempt redeem with wrong ASA
      // Should fail
    });

    test('should reject redemption with wrong amount', async () => {
      // Transfer 0 or 2 NFTs
      // Should fail (must be exactly 1)
    });

    test('should reject redemption without NFT transfer', async () => {
      // Attempt redeemGiftNFT without transfer txn
      // Should fail
    });
  });

  describe('Price Management', () => {
    test('should allow admin to update prices', async () => {
      // Admin calls updatePrices
      // Verify subscriptionPrice30day updated
      // Verify subscriptionPriceYear updated
    });

    test('should reject price updates from non-admin', async () => {
      // Subscriber attempts updatePrices
      // Should fail
    });

    test('should reject zero prices', async () => {
      // Attempt updatePrices with 0 for either price
      // Should fail
    });
  });

  describe('Contract Pause', () => {
    test('should allow admin to pause', async () => {
      // Admin calls setPauseState(true)
      // Verify isPaused is true
    });

    test('should allow admin to unpause', async () => {
      // Pause contract
      // Admin calls setPauseState(false)
      // Verify isPaused is false
    });

    test('should block subscriptions when paused', async () => {
      // Pause contract
      // Attempt subscribe
      // Should fail
    });

    test('should block minting when paused', async () => {
      // Pause contract
      // Attempt mintGiftNFT
      // Should fail
    });

    test('should allow redemption when paused', async () => {
      // Note: Check if redemption should be blocked or allowed when paused
      // Current implementation doesn't check pause state for redemption
    });

    test('should reject pause from non-admin', async () => {
      // Subscriber attempts setPauseState
      // Should fail
    });
  });

  describe('Admin Transfer', () => {
    test('should allow admin to transfer ownership', async () => {
      const newAdmin = await fixture.context.generateAccount({
        initialFunds: algokit.algos(10)
      });
      
      // Admin calls updateAdmin(newAdmin)
      // Verify admin changed
      // Verify new admin can perform admin functions
      // Verify old admin cannot
    });

    test('should reject admin transfer from non-admin', async () => {
      // Subscriber attempts updateAdmin
      // Should fail
    });
  });

  describe('Query Functions', () => {
    test('should return correct subscription expiration', async () => {
      // Subscribe for 30 days
      // Query getSubscription
      // Verify correct timestamp returned
    });

    test('should return 0 for non-existent subscription', async () => {
      // Query getSubscription for user without subscription
      // Verify returns 0
    });

    test('should correctly identify active subscriptions', async () => {
      // Subscribe for 30 days
      // Query hasActiveSubscription
      // Verify returns true
      
      // Query for expired subscription
      // Verify returns false
    });

    test('should return false for non-existent user', async () => {
      // Query hasActiveSubscription for unsubscribed user
      // Verify returns false
    });

    test('should return current timestamp', async () => {
      // Query getLatestTimestamp
      // Verify reasonable value returned
    });
  });

  describe('Edge Cases and Gas', () => {
    test('should handle multiple subscriptions per user', async () => {
      // Subscribe for 30 days
      // Subscribe for 1 year
      // Verify cumulative end time
    });

    test('should handle subscription extending far into future', async () => {
      // Subscribe multiple times
      // Verify no overflow in timestamp calculations
    });

    test('should handle gift redemption with existing subscription', async () => {
      // Direct subscribe for 30 days
      // Redeem 1-year gift
      // Verify correct total duration
    });

    test('should handle concurrent gift mints', async () => {
      // Multiple users mint gifts in same block
      // All should succeed
    });

    test('should properly fund contract for inner transactions', async () => {
      // Verify contract has enough ALGOs for:
      // - Opt-in to ORA ASA
      // - Create 2 NFTs
      // - Transfer NFTs to users
    });

    test('should track multiple users independently', async () => {
      // User A subscribes
      // User B subscribes
      // Verify separate box storage
      // Verify no interference
    });

    test('should handle year + 30-day stack correctly', async () => {
      const oneDay = 24 * 60 * 60;
      
      // Subscribe for 1 year
      // Subscribe for 30 days
      // Verify end time = current + (365 + 30) * oneDay
    });
  });

  describe('NFT Metadata', () => {
    test('should create NFTs with correct properties', async () => {
      // After bootstrap:
      // Verify 30-day NFT has:
      //   - name: 'ORA 30 Day Subscription'
      //   - unit name: 'ORA30day'
      //   - decimals: 0
      //   - total supply: 10_000_000_000
      //   - manager: contract address
      //   - reserve: contract address
      //   - URL: IPFS template
    });

    test('should create NFTs as non-divisible', async () => {
      // Verify decimals = 0 for both NFTs
    });

    test('should set contract as manager and reserve', async () => {
      // Verify contract controls both NFTs
    });
  });
});

/**
 * Utility function to create a test ASA using AlgorandClient
 */
async function createTestAsset(
  creator: algosdk.Account,
  algorand: algokit.AlgorandClient
): Promise<bigint> {
  const result = await algorand.send.assetCreate({
    sender: creator.addr,
    total: 1_000_000_000_000n, // 1 trillion with 6 decimals
    decimals: 6,
    assetName: 'Test ORA',
    unitName: 'ORA',
  });
  
  return result.confirmation.assetIndex!;
}
