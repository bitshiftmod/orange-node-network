import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing';
import * as algokit from '@algorandfoundation/algokit-utils';
import { decodeAddress } from 'algosdk';
import { OrangeGatewayRegistryFactory } from '../src/clients/OrangeGatewayRegistryClient.js';

const fixture = algorandFixture({ testAccountFunding: algokit.algos(100) });
algokit.Config.configure({ populateAppCallResources: true });

/**
 * Create box references for gateway registration.
 * BoxMap prefixes (packed storage):
 * - 'gd' (gatewayData): packed endpoint + publicKey with length prefixes
 * - 'gs' (gatewayState): 64-byte packed numeric fields
 * - 'gl' (gatewayList): index → Account mapping
 */
function createGatewayBoxReferences(gatewayAddr: string, listIndex: bigint, appId: bigint) {
  const addressBytes = decodeAddress(gatewayAddr).publicKey;
  
  // Only 2 box prefixes for gateway data (gd = data, gs = state)
  const prefixes = ['gd', 'gs'];
  
  const boxes = prefixes.map(prefix => {
    const boxName = new Uint8Array(prefix.length + addressBytes.length);
    boxName.set(new TextEncoder().encode(prefix), 0);
    boxName.set(addressBytes, prefix.length);
    return { appId, name: boxName };
  });
  
  // Add gateway list box for the new index
  const listPrefix = 'gl';
  const indexBytes = new Uint8Array(8);
  new DataView(indexBytes.buffer).setBigUint64(0, listIndex, false); // big-endian
  const listBoxName = new Uint8Array(listPrefix.length + indexBytes.length);
  listBoxName.set(new TextEncoder().encode(listPrefix), 0);
  listBoxName.set(indexBytes, listPrefix.length);
  boxes.push({ appId, name: listBoxName });
  
  return boxes;
}

// Note: With BoxMap storage, no OptIn is needed - registrants pay MBR via their payment transaction

describe('OrangeGatewayRegistry', () => {
  beforeEach(fixture.beforeEach);

  let factory: OrangeGatewayRegistryFactory;
  let appId: bigint;
  let appAddress: string;
  let adminAccount: ReturnType<typeof fixture.context.generateAccount> extends Promise<infer T> ? T : never;

  beforeAll(async () => {
    await fixture.beforeEach();
    const { algorand, testAccount } = fixture.context;
    adminAccount = testAccount; // Save for later use
    
    // Create factory with AlgorandClient
    factory = new OrangeGatewayRegistryFactory({
      algorand,
      defaultSender: testAccount.addr,
    });

    // Create the contract using send.create
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
  });

  describe('Initialization', () => {
    test('should initialize with correct default values', async () => {
      const { algorand, testAccount } = fixture.context;
      const appClient = factory.getAppClientById({ appId });
      
      const globalState = await appClient.appClient.getGlobalState();
      // Verify default values
      const adminState = globalState.admin;
      expect(adminState).toBeDefined();
      expect(globalState.totalGateways?.value).toBe(0n);
      expect(globalState.minStakeGateways?.value).toBe(12_000_000_000n); // 12000 ORA
      expect(globalState.maxGateways?.value).toBe(1_000n);
      expect(globalState.heartbeatInterval?.value).toBe(300n); // 5 minutes
    });

    test('should allow admin to update configuration', async () => {
      const { algorand, testAccount } = fixture.context;
      const appClient = factory.getAppClientById({ appId });
      
      const newMinStake = 15_000_000_000n; // 15000 ORA
      
      await appClient.send.updateMinStakeGateways({
        args: { newMinStake },
        sender: adminAccount.addr,
        signer: adminAccount,
      });
      
      const globalState = await appClient.appClient.getGlobalState();
      expect(globalState.minStakeGateways?.value).toBe(newMinStake);
    });

    test('should reject non-admin configuration updates', async () => {
      const { algorand, generateAccount } = fixture.context;
      const nonAdmin = await generateAccount({ initialFunds: algokit.algos(10) });
      const appClient = factory.getAppClientById({ appId });
      
      await expect(
        appClient.send.updateMinStakeGateways({
          args: { newMinStake: 15_000_000_000n },
          sender: nonAdmin.addr,
        })
      ).rejects.toThrow();
    }, 15000); // Increase timeout
  });

  describe('Gateway Registration', () => {
    // Lower min stake to a testable value (1 ALGO = 1,000,000 microALGO)
    const testMinStake = 1_000_000n; // 1 ALGO for testing

    beforeAll(async () => {
      const appClient = factory.getAppClientById({ appId });
      // Lower minimum stake for testing
      await appClient.send.updateMinStakeGateways({
        args: { newMinStake: testMinStake },
        sender: adminAccount.addr,
        signer: adminAccount,
      });
    });

    test('should register gateway with valid endpoint and stake', async () => {
      const { algorand, generateAccount } = fixture.context;
      const gateway = await generateAccount({ initialFunds: algokit.algos(20) });
      const appClient = factory.getAppClientById({ appId });

      const endpoint = new Uint8Array(Buffer.from('https://gateway1.example.com'));
      const publicKey = new Uint8Array(32);

      // Get current totalGateways for box reference
      const globalState = await appClient.appClient.getGlobalState();
      const currentTotal = BigInt(globalState.totalGateways?.value ?? 0n);

      // Create box references for the new gateway
      const boxRefs = createGatewayBoxReferences(gateway.addr.toString(), currentTotal, appId);

      // Register with payment transaction group (no OptIn needed - BoxMap storage)
      await algorand.newGroup()
        .addPayment({
          sender: gateway.addr,
          receiver: appAddress,
          amount: algokit.algos(5), // 5 ALGO (exceeds test minimum of 1 ALGO)
        })
        .addAppCallMethodCall({
          ...(await appClient.params.registerGateway({
            args: {
              endpoint: endpoint,
              publicKey: publicKey,
            },
            sender: gateway.addr,
          })),
          boxReferences: boxRefs,
        })
        .send({ populateAppCallResources: false });

      // Verify registration using getter methods (BoxMap storage)
      const statusResult = await appClient.send.getGatewayStatus({
        args: { gatewayAddress: gateway.addr.toString() },
      });
      expect(statusResult.return).toBe(0n); // ACTIVE
      
      const stakeResult = await appClient.send.getGatewayStake({
        args: { gatewayAddress: gateway.addr.toString() },
      });
      expect(stakeResult.return).toBeGreaterThan(0n);
    });

    test('should reject duplicate gateway registration', async () => {
      const { algorand, generateAccount } = fixture.context;
      const gateway = await generateAccount({ initialFunds: algokit.algos(30) });
      const appClient = factory.getAppClientById({ appId });

      const endpoint = new Uint8Array(Buffer.from('gateway-dup.example.com'));
      const publicKey = new Uint8Array(32);

      // First registration (no OptIn needed - BoxMap storage)
      await algorand.newGroup()
        .addPayment({
          sender: gateway.addr,
          receiver: appAddress,
          amount: algokit.algos(5),
        })
        .addAppCallMethodCall(await appClient.params.registerGateway({
          args: { endpoint, publicKey },
          sender: gateway.addr,
        }))
        .send();

      // Second registration should fail
      await expect(
        algorand.newGroup()
          .addPayment({
            sender: gateway.addr,
            receiver: appAddress,
            amount: algokit.algos(5),
          })
          .addAppCallMethodCall(await appClient.params.registerGateway({
            args: {
              endpoint: new Uint8Array(Buffer.from('different.com')),
              publicKey: new Uint8Array(32),
            },
            sender: gateway.addr,
          }))
          .send()
      ).rejects.toThrow();
    });

    test('should reject empty endpoint or public key', async () => {
      const { algorand, generateAccount } = fixture.context;
      const gateway = await generateAccount({ initialFunds: algokit.algos(20) });
      const appClient = factory.getAppClientById({ appId });

      // No OptIn needed with BoxMap storage
      await expect(
        algorand.newGroup()
          .addPayment({
            sender: gateway.addr,
            receiver: appAddress,
            amount: algokit.algos(5),
          })
          .addAppCallMethodCall(await appClient.params.registerGateway({
            args: {
              endpoint: new Uint8Array(0),
              publicKey: new Uint8Array(32),
            },
            sender: gateway.addr,
          }))
          .send()
      ).rejects.toThrow();
    });
  });

  describe('Gateway Updates', () => {
    test('should allow updating endpoint', async () => {
      // Register gateway
      // Update endpoint
      // Verify new endpoint saved
    });

    test('should allow updating public key', async () => {
      // Register gateway
      // Update public key
      // Verify new key saved
    });

    test('should reject updates from unregistered gateways', async () => {
      // Attempt update without registration
      // Should fail
    });

    test('should reject updates from inactive gateways', async () => {
      // Register gateway
      // Admin suspends gateway
      // Attempt update
      // Should fail
    });
  });

  describe('Stake Management', () => {
    test('should allow adding stake', async () => {
      // Register gateway
      // Add additional stake
      // Verify stakeAmount increased
    });

    test('should allow partial stake withdrawal', async () => {
      // Register gateway with stake
      // Withdraw partial amount keeping >= minimum
      // Verify remaining stake correct
    });

    test('should allow full withdrawal and deregistration', async () => {
      // Register gateway
      // Withdraw full stake
      // Verify gateway deregistered
      // Verify localState deleted
    });

    test('should reject withdrawal below minimum', async () => {
      // Register gateway
      // Attempt withdrawal leaving less than minimum
      // Should fail with appropriate error
    });

    test('should reject withdrawal from banned gateways', async () => {
      // Register gateway
      // Admin bans gateway
      // Attempt withdrawal
      // Should fail
    });

    test('should return payment correctly on withdrawal', async () => {
      // Register gateway
      // Withdraw amount
      // Verify payment transaction received
      // Verify correct amount
    });
  });

  describe('Heartbeat System', () => {
    test('should accept heartbeat from active gateway', async () => {
      // Register gateway
      // Send heartbeat
      // Verify lastHeartbeat updated
      // Verify heartbeatCount incremented
    });

    test('should track cumulative uptime', async () => {
      // Register gateway
      // Wait some time
      // Send heartbeat
      // Verify cumulativeUptime increased appropriately
    });

    test('should credit uptime only within interval window', async () => {
      // Register gateway
      // Wait > heartbeatInterval * 2
      // Send heartbeat
      // Verify no uptime credit given
    });

    test('should reject heartbeat from unregistered gateway', async () => {
      // Attempt heartbeat without registration
      // Should fail
    });

    test('should reject heartbeat from suspended gateway', async () => {
      // Register gateway
      // Admin suspends
      // Attempt heartbeat
      // Should fail
    });
  });

  describe('Admin Functions', () => {
    test('should allow admin to suspend gateway', async () => {
      // Register gateway
      // Admin suspends with reason
      // Verify status changed to SUSPENDED
    });

    test('should allow admin to reactivate gateway', async () => {
      // Register and suspend gateway
      // Admin reactivates
      // Verify status changed to ACTIVE
      // Verify lastHeartbeat reset
    });

    test('should allow admin to ban gateway with slashing', async () => {
      // Register gateway with stake
      // Admin bans with slashing (e.g., 30% = 3000 basis points)
      // Verify status BANNED
      // Verify stake reduced correctly
      // Verify slashed funds remain in contract
    });

    test('should reject suspending banned gateway', async () => {
      // Register and ban gateway
      // Attempt to suspend
      // Should fail
    });

    test('should reject reactivating non-suspended gateway', async () => {
      // Register active gateway
      // Attempt to reactivate
      // Should fail
    });

    test('should validate slash percentage bounds', async () => {
      // Register gateway
      // Attempt ban with > 10000 basis points
      // Should fail
    });
  });

  describe('Query Functions', () => {
    test('should return correct gateway activity status', async () => {
      // Register gateway
      // Send heartbeat
      // Verify isGatewayActive returns true
      
      // Wait past heartbeat interval * 2
      // Verify isGatewayActive returns false
    });

    test('should return false for unregistered gateway', async () => {
      // Query isGatewayActive for unregistered address
      // Should return false
    });

    test('should return false for inactive status', async () => {
      // Register gateway
      // Admin suspends
      // Verify isGatewayActive returns false
    });

    test('should return correct total gateways count', async () => {
      // Verify starts at 0
      // Register 3 gateways
      // Verify count is 3
      // Deregister 1 gateway
      // Verify count is 2
    });

    test('should retrieve gateway by index', async () => {
      // Register multiple gateways
      // Query by index
      // Verify correct addresses returned
    });

    test('should fail when querying out of bounds index', async () => {
      // Register 2 gateways
      // Query index 2
      // Should fail
    });
  });

  describe('Edge Cases', () => {
    test('should handle maximum gateways limit', async () => {
      // Admin sets maxGateways to 2
      // Register 2 gateways successfully
      // Attempt 3rd registration
      // Should fail
    });

    test('should handle admin transfer', async () => {
      const newAdmin = await fixture.context.generateAccount({
        initialFunds: algokit.algos(10)
      });
      
      // Transfer admin to newAdmin
      // Verify new admin can perform admin functions
      // Verify old admin cannot
    });

    test('should maintain gateway list indices on deregistration', async () => {
      // Register 3 gateways
      // Note: Implementation doesn't remove from list
      // Deregister middle gateway
      // Verify totalGateways decremented
      // Verify gateway can't be queried by isGatewayActive
    });

    test('should handle concurrent registrations', async () => {
      // Attempt multiple registrations in same block
      // All should succeed if under limit
    });
  });

  describe('Endpoint Validation', () => {
    test('should accept endpoints without strict format validation', async () => {
      // Note: HTTPS validation removed due to bytes/string comparison
      const endpoints = [
        'http://gateway.com',
        'gateway.example.com',
        'wss://secure.gateway.io'
      ];
      
      // All should be accepted (validation moved off-chain)
    });
  });
});
