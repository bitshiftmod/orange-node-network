import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing';
import * as algokit from '@algorandfoundation/algokit-utils';
import { OrangeNodeRegistryFactory } from '../src/clients/OrangeNodeRegistryClient.js';

const fixture = algorandFixture({ testAccountFunding: algokit.algos(100) });
algokit.Config.configure({ populateAppCallResources: true });

// Note: With BoxMap storage, no OptIn is needed - registrants pay MBR via their payment transaction

describe('OrangeNodeRegistry', () => {
  beforeEach(fixture.beforeEach);

  let factory: OrangeNodeRegistryFactory;
  let appId: bigint;
  let appAddress: string;
  let adminAccount: ReturnType<typeof fixture.context.generateAccount> extends Promise<infer T> ? T : never;

  beforeAll(async () => {
    await fixture.beforeEach();
    const { algorand, testAccount } = fixture.context;
    adminAccount = testAccount; // Save for later use
    
    // Create factory with AlgorandClient
    factory = new OrangeNodeRegistryFactory({
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
      
      // Get app client from factory
      const appClient = factory.getAppClientById({ appId });
      
      // Read global state
      const globalState = await appClient.appClient.getGlobalState();
      // Verify default values
      const adminState = globalState.admin;
      expect(adminState).toBeDefined();
      expect(globalState.totalNodes?.value).toBe(0n);
      expect(globalState.minStakeNodes?.value).toBe(1_000_000_000n); // 1000 ORA
      expect(globalState.maxNodes?.value).toBe(10_000n);
      expect(globalState.heartbeatInterval?.value).toBe(300n); // 5 minutes
    });

    test('should allow admin to update minimum stake', async () => {
      const { algorand, testAccount } = fixture.context;
      const appClient = factory.getAppClientById({ appId });
      
      const newMinStake = 5_000_000_000n; // 5000 ORA
      
      await appClient.send.updateMinStakeNodes({
        args: { newMinStake },
        sender: adminAccount.addr,
        signer: adminAccount,
      });
      
      const globalState = await appClient.appClient.getGlobalState();
      expect(globalState.minStakeNodes?.value).toBe(newMinStake);
    });

    test('should reject non-admin stake updates', async () => {
      const { algorand, generateAccount } = fixture.context;
      const nonAdmin = await generateAccount({ initialFunds: algokit.algos(10) });
      const appClient = factory.getAppClientById({ appId });
      
      await expect(
        appClient.send.updateMinStakeNodes({
          args: { newMinStake: 5_000_000_000n },
          sender: nonAdmin.addr,
        })
      ).rejects.toThrow();
    });
  });

  describe('Node Registration', () => {
    // Lower min stake to a testable value (1 ALGO = 1,000,000 microALGO)
    const testMinStake = 1_000_000n; // 1 ALGO for testing

    beforeAll(async () => {
      const appClient = factory.getAppClientById({ appId });
      // Lower minimum stake for testing
      await appClient.send.updateMinStakeNodes({
        args: { newMinStake: testMinStake },
        sender: adminAccount.addr,
        signer: adminAccount,
      });
    });

    test('should register node with valid stake payment', async () => {
      const { algorand, generateAccount } = fixture.context;
      const node = await generateAccount({ initialFunds: algokit.algos(20) });
      const appClient = factory.getAppClientById({ appId });

      const p2pId = new Uint8Array(Buffer.from('test-p2p-id-1'));

      // Register node with payment transaction group (no OptIn needed - BoxMap storage)
      const result = await algorand.newGroup()
        .addPayment({
          sender: node.addr,
          receiver: appAddress,
          amount: algokit.algos(5), // 5 ALGO (exceeds test minimum of 1 ALGO)
        })
        .addAppCallMethodCall(await appClient.params.registerNode({
          args: {
            p2pId: p2pId,
          },
          sender: node.addr,
        }))
        .send();

      // Verify registration using getter methods (BoxMap storage)
      const stakeResult = await appClient.send.getNodeStake({
        args: { nodeAddress: node.addr.toString() },
      });
      expect(stakeResult.return).toBeGreaterThan(0n);
      
      const statusResult = await appClient.send.getNodeStatus({
        args: { nodeAddress: node.addr.toString() },
      });
      expect(statusResult.return).toBe(0n); // ACTIVE
    });

    test('should reject registration with insufficient stake', async () => {
      const { algorand, generateAccount } = fixture.context;
      const node = await generateAccount({ initialFunds: algokit.algos(10) });
      const appClient = factory.getAppClientById({ appId });

      const p2pId = new Uint8Array(Buffer.from('test-p2p-id-insufficient'));

      // Should fail - insufficient payment (0.5 ALGO < 1 ALGO test minimum)
      // No OptIn needed with BoxMap storage
      await expect(
        algorand.newGroup()
          .addPayment({
            sender: node.addr,
            receiver: appAddress,
            amount: algokit.microAlgos(500_000), // 0.5 ALGO - less than test min
          })
          .addAppCallMethodCall(await appClient.params.registerNode({
            args: {
              p2pId: p2pId,
            },
            sender: node.addr,
          }))
          .send()
      ).rejects.toThrow();
    });

    test('should reject duplicate node registration', async () => {
      const { algorand, generateAccount } = fixture.context;
      const node = await generateAccount({ initialFunds: algokit.algos(20) });
      const appClient = factory.getAppClientById({ appId });

      const p2pId = new Uint8Array(Buffer.from('test-p2p-duplicate'));

      // First registration (no OptIn needed - BoxMap storage)
      await algorand.newGroup()
        .addPayment({
          sender: node.addr,
          receiver: appAddress,
          amount: algokit.algos(5),
        })
        .addAppCallMethodCall(await appClient.params.registerNode({
          args: {
            p2pId: p2pId,
          },
          sender: node.addr,
        }))
        .send();

      // Second registration should fail
      await expect(
        algorand.newGroup()
          .addPayment({
            sender: node.addr,
            receiver: appAddress,
            amount: algokit.algos(5),
          })
          .addAppCallMethodCall(await appClient.params.registerNode({
            args: {
              p2pId: new Uint8Array(Buffer.from('different-id')),
            },
            sender: node.addr,
          }))
          .send()
      ).rejects.toThrow();
    });
  });

  describe('Stake Management', () => {
    test('should allow adding stake to existing registration', async () => {
      // Register node first
      // Add additional stake
      //  Verify stakeAmount increased
    });

    test('should allow partial stake withdrawal', async () => {
      // Register node with stake
      // Withdraw partial amount (keeping >= minimum)
      // Verify remaining stake
    });

    test('should allow full withdrawal and deregistration', async () => {
      // Register node
      // Withdraw full stake
      // Verify node is deregistered
    });

    test('should reject withdrawal below minimum', async () => {
      // Register node
      // Attempt withdrawal leaving less than minimum
      // Should fail
    });

    test('should reject withdrawal from banned nodes', async () => {
      // Register node
      // Admin bans node
      // Attempt withdrawal
      // Should fail
    });
  });

  describe('Heartbeat System', () => {
    test('should accept heartbeat from active node', async () => {
      // Register node
      // Send heartbeat
      // Verify lastHeartbeat updated
      // Verify heartbeatCount incremented
    });

    test('should track cumulative uptime', async () => {
      // Register node
      // Wait some time
      // Send heartbeat
      // Verify cumulativeUptime increased
    });

    test('should reject heartbeat from unregistered node', async () => {
      // Attempt heartbeat without registration
      // Should fail
    });

    test('should reject heartbeat from suspended node', async () => {
      // Register node
      // Admin suspends node
      // Attempt heartbeat
      // Should fail
    });
  });

  describe('Admin Functions', () => {
    test('should allow admin to suspend node', async () => {
      // Register node
      // Admin suspends with reason
      // Verify status changed to SUSPENDED
    });

    test('should allow admin to reactivate suspended node', async () => {
      // Register and suspend node
      // Admin reactivates
      // Verify status changed to ACTIVE
      // Verify lastHeartbeat reset
    });

    test('should allow admin to ban node with slashing', async () => {
      // Register node with stake
      // Admin bans with 50% slash (5000 basis points)
      // Verify status BANNED
      // Verify stake reduced by 50%
    });

    test('should reject suspending already banned node', async () => {
      // Register and ban node
      // Attempt to suspend
      // Should fail
    });

    test('should reject reactivating non-suspended node', async () => {
      // Register active node
      // Attempt to reactivate
      // Should fail
    });
  });

  describe('Query Functions', () => {
    test('should return correct node activity status', async () => {
      // Register node
      // Send heartbeat
      // Verify isNodeActive returns true
      
      // Wait past heartbeat interval * 2
      // Verify isNodeActive returns false
    });

    test('should return correct total nodes count', async () => {
      // Verify starts at 0
      // Register 3 nodes
      // Verify count is 3
    });

    test('should retrieve node by index', async () => {
      // Register multiple nodes
      // Query by index
      // Verify correct addresses returned
    });

    test('should look up owner by P2P ID', async () => {
      const p2pId = new Uint8Array(Buffer.from('unique-p2p-id'));
      // Register node with p2pId
      // Query getNodeByP2PId
      // Verify correct owner address returned
    });
  });

  describe('Edge Cases', () => {
    test('should handle maximum nodes limit', async () => {
      // Admin sets maxNodes to 2
      // Register 2 nodes successfully
      // Attempt 3rd registration
      // Should fail with "Maximum nodes reached"
    });

    test('should handle admin transfer', async () => {
      const newAdmin = await fixture.context.generateAccount({ 
        initialFunds: algokit.algos(10) 
      });
      
      // Transfer admin to newAdmin
      // Verify new admin can perform admin functions
      // Verify old admin cannot
    });

    test('should prevent heartbeat interval abuse', async () => {
      // Register node
      // Send heartbeat
      // Immediately send another heartbeat
      // Verify only reasonable uptime credited
    });
  });
});
