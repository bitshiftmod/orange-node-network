import type { uint64, bytes } from '@algorandfoundation/algorand-typescript';
import {
  Contract,
  GlobalState,
  BoxMap,
  assert,
  Txn,
  Global,
  itxn,
  Account,
  gtxn,
  op,
  Uint64,
  emit,
} from '@algorandfoundation/algorand-typescript';

/**
 * Orange Node Registry - Algorand TypeScript v1.0
 * 
 * Purpose: Bind orange-nodes to unique Algorand node P2P IDs to prevent reuse
 * 
 * Features:
 * - Unique P2P ID enforcement (one orange-node per Algorand node)
 * - Configurable stake requirements (admin-controlled)
 * - Stake management (add stake, withdraw to minimum or full)
 * - Heartbeat system for uptime tracking
 * - Status management (active/suspended/banned)
 * - BoxMap storage for discoverability (no LocalState)
 * 
 * Storage Design (optimized for 8-box reference limit):
 * - nodeData: P2P ID (variable length, max 64 bytes)
 * - nodeState: All numeric fields packed as 8 uint64 values (64 bytes total)
 *   [stake, registeredAt, lastHeartbeat, status, cumulativeUptime, heartbeatCount, reserved1, reserved2]
 * - p2pIdOwner: P2P ID -> Account (for uniqueness check)
 * - nodeList: index -> Account for enumeration
 * 
 * Note: Registrants pay MBR cost for box storage
 */

// Node status constants (module-level for Puya compatibility)
const NODE_STATUS_ACTIVE: uint64 = 0;
const NODE_STATUS_SUSPENDED: uint64 = 1;
const NODE_STATUS_BANNED: uint64 = 2;

class OrangeNodeRegistry extends Contract {
  // Global state
  admin = GlobalState<Account>();
  totalNodes = GlobalState<uint64>();
  minStakeNodes = GlobalState<uint64>();
  maxNodes = GlobalState<uint64>();
  heartbeatInterval = GlobalState<uint64>();
  
  // Box storage for node data (keyed by node account address)
  // nodeData: P2P ID (variable length, stored directly)
  nodeData = BoxMap<Account, bytes>({ keyPrefix: 'nd' });
  // nodeState: fixed 64 bytes = 8 x uint64 packed values
  nodeState = BoxMap<Account, bytes>({ keyPrefix: 'ns' });
  
  // Box storage for lookups
  p2pIdOwner = BoxMap<bytes, Account>({ keyPrefix: 'p2p' });
  nodeList = BoxMap<uint64, Account>({ keyPrefix: 'nl' });

  // ===== Helper methods for packed state storage =====
  
  /**
   * Pack node state into 64 bytes (8 x uint64)
   */
  private packNodeState(
    stake: uint64,
    registeredAt: uint64,
    lastHeartbeat: uint64,
    status: uint64,
    cumulativeUptime: uint64,
    heartbeatCount: uint64
  ): bytes {
    // Build 64-byte packed state by concatenating all fields
    return op.concat(
      op.concat(
        op.concat(
          op.concat(
            op.concat(
              op.concat(
                op.concat(
                  op.itob(stake),
                  op.itob(registeredAt)
                ),
                op.itob(lastHeartbeat)
              ),
              op.itob(status)
            ),
            op.itob(cumulativeUptime)
          ),
          op.itob(heartbeatCount)
        ),
        op.itob(0) // reserved1
      ),
      op.itob(0) // reserved2
    );
  }

  /**
   * Extract stake from packed state (bytes 0-7)
   */
  private getPackedStake(state: bytes): uint64 {
    return op.btoi(op.extract(state, 0, 8));
  }

  /**
   * Extract lastHeartbeat from packed state (bytes 16-23)
   */
  private getPackedLastHeartbeat(state: bytes): uint64 {
    return op.btoi(op.extract(state, 16, 8));
  }

  /**
   * Extract status from packed state (bytes 24-31)
   */
  private getPackedStatus(state: bytes): uint64 {
    return op.btoi(op.extract(state, 24, 8));
  }

  /**
   * Extract cumulativeUptime from packed state (bytes 32-39)
   */
  private getPackedCumulativeUptime(state: bytes): uint64 {
    return op.btoi(op.extract(state, 32, 8));
  }

  /**
   * Extract heartbeatCount from packed state (bytes 40-47)
   */
  private getPackedHeartbeatCount(state: bytes): uint64 {
    return op.btoi(op.extract(state, 40, 8));
  }

  /**
   * Update a specific uint64 field in packed state
   */
  private updatePackedField(state: bytes, offset: uint64, newValue: uint64): bytes {
    const before = op.extract(state, 0, offset);
    const after = op.extract(state, offset + 8, 64 - offset - 8);
    return op.concat(op.concat(before, op.itob(newValue)), after);
  }

  // ===== Contract methods =====

  /**
   * Create the contract with initial configuration
   */
  createApplication(): void {
    this.admin.value = Txn.sender;
    this.totalNodes.value = 0;
    this.minStakeNodes.value = 1_000_000_000; // 1000 ORA (assuming 6 decimals)
    this.maxNodes.value = 10_000; // Limit total nodes
    this.heartbeatInterval.value = 300; // 5 minutes
  }

  /**
   * Update minimum stake requirement (admin only)
   */
  updateMinStakeNodes(newMinStake: uint64): void {
    this.requireAdmin();
    assert(newMinStake > 0, 'Minimum stake must be greater than 0');
    this.minStakeNodes.value = newMinStake;
  }

  /**
   * Update maximum nodes allowed (admin only)
   */
  updateMaxNodes(newMaxNodes: uint64): void {
    this.requireAdmin();
    assert(newMaxNodes > this.totalNodes.value, 'Max nodes must be greater than current total');
    this.maxNodes.value = newMaxNodes;
  }

  /**
   * Update heartbeat interval (admin only)
   */
  updateHeartbeatInterval(newInterval: uint64): void {
    this.requireAdmin();
    assert(newInterval > 0, 'Heartbeat interval must be greater than 0');
    this.heartbeatInterval.value = newInterval;
  }

  /**
   * Transfer admin to new address (admin only)
   */
  transferAdmin(newAdmin: Account): void {
    this.requireAdmin();
    assert(newAdmin !== this.admin.value, 'New admin must be different');
    this.admin.value = newAdmin;
  }

  /**
   * Register a node with P2P ID
   * Requires payment transaction for stake + MBR for box storage
   */
  registerNode(p2pId: bytes): void {
    const sender = Txn.sender;
    
    // Validations
    assert(!this.nodeData(sender).exists, 'Node already registered');
    assert(this.totalNodes.value < this.maxNodes.value, 'Maximum nodes reached');
    assert(p2pId.length > 0, 'P2P ID required');
    assert(p2pId.length <= 64, 'P2P ID too long');
    
    // Check P2P ID uniqueness
    assert(!this.p2pIdOwner(p2pId).exists, 'P2P ID already registered');
    
    // Verify payment transaction (must be in group)
    assert(Txn.groupIndex > 0, 'Payment transaction required');
    const paymentTxn = gtxn.PaymentTxn(Txn.groupIndex - 1);
    assert(paymentTxn.receiver === Global.currentApplicationAddress, 'Payment must be to contract');
    assert(paymentTxn.amount >= this.minStakeNodes.value, 'Insufficient stake amount');
    
    const stakeAmount = paymentTxn.amount;
    
    // Store node data
    this.nodeData(sender).value = p2pId;
    this.nodeState(sender).value = this.packNodeState(
      stakeAmount,
      Global.latestTimestamp,
      Global.latestTimestamp,
      NODE_STATUS_ACTIVE,
      0,
      0
    );
    
    // Register P2P ID -> owner mapping
    this.p2pIdOwner(p2pId).value = sender;
    
    // Add to node list for enumeration
    this.nodeList(this.totalNodes.value).value = sender;
    this.totalNodes.value = this.totalNodes.value + 1;

    // Emit ARC-28 event
    emit('NodeRegistered', sender, stakeAmount, Global.latestTimestamp);
  }

  /**
   * Add additional stake to existing registration
   * Requires payment transaction
   */
  addStake(): void {
    const sender = Txn.sender;
    assert(this.nodeData(sender).exists, 'Node not registered');
    
    const state = this.nodeState(sender).value;
    assert(this.getPackedStatus(state) === NODE_STATUS_ACTIVE, 'Node must be active to add stake');
    
    // Verify payment transaction
    assert(Txn.groupIndex > 0, 'Payment transaction required');
    const paymentTxn = gtxn.PaymentTxn(Txn.groupIndex - 1);
    assert(paymentTxn.receiver === Global.currentApplicationAddress, 'Payment must be to contract');
    assert(paymentTxn.amount > 0, 'Payment amount must be greater than 0');
    
    // Update stake amount
    const currentStake = this.getPackedStake(state);
    const newStake: uint64 = currentStake + paymentTxn.amount;
    this.nodeState(sender).value = this.updatePackedField(state, Uint64(0), newStake);

    // Emit ARC-28 event
    emit('StakeAdded', sender, paymentTxn.amount, newStake);
  }

  /**
   * Withdraw stake
   * Can withdraw to minimum or full amount (which deregisters)
   */
  withdrawStake(amount: uint64): void {
    const sender = Txn.sender;
    assert(this.nodeData(sender).exists, 'Node not registered');
    
    const state = this.nodeState(sender).value;
    assert(this.getPackedStatus(state) !== NODE_STATUS_BANNED, 'Banned nodes cannot withdraw');
    assert(amount > 0, 'Withdrawal amount must be greater than 0');
    
    const currentStake = this.getPackedStake(state);
    assert(amount <= currentStake, 'Insufficient stake balance');
    
    const remainingStake: uint64 = currentStake - amount;
    
    // Allow full withdrawal OR withdrawal to minimum
    if (remainingStake === 0) {
      // Full withdrawal - deregister node
      this.deregisterNode(sender);
    } else {
      // Partial withdrawal - must maintain minimum
      assert(remainingStake >= this.minStakeNodes.value, 
             'Remaining stake must meet minimum requirement or withdraw full amount');
      
      this.nodeState(sender).value = this.updatePackedField(state, 0, remainingStake);
    }
    
    // Send payment
    itxn.payment({
      receiver: sender,
      amount: amount,
      fee: Global.minTxnFee
    }).submit();

    // Emit ARC-28 event
    emit('StakeWithdrawn', sender, amount, remainingStake);
  }

  /**
   * Heartbeat to prove node is alive and update uptime
   */
  heartbeat(): void {
    const sender = Txn.sender;
    assert(this.nodeData(sender).exists, 'Node not registered');
    
    const state = this.nodeState(sender).value;
    assert(this.getPackedStatus(state) === NODE_STATUS_ACTIVE, 'Only active nodes can send heartbeat');
    
    const lastBeat = this.getPackedLastHeartbeat(state);
    const timeSinceLastHeartbeat: uint64 = Global.latestTimestamp - lastBeat;
    
    // Calculate uptime credit (only if within reasonable interval)
    const maxInterval: uint64 = this.heartbeatInterval.value * 2;
    let newUptime = this.getPackedCumulativeUptime(state);
    if (timeSinceLastHeartbeat <= maxInterval) {
      newUptime = newUptime + timeSinceLastHeartbeat;
    }
    
    const newHeartbeatCount: uint64 = this.getPackedHeartbeatCount(state) + Uint64(1);
    
    // Update state with new values
    let newState = this.updatePackedField(state, Uint64(16), Global.latestTimestamp); // lastHeartbeat at offset 16
    newState = this.updatePackedField(newState, Uint64(32), newUptime); // cumulativeUptime at offset 32
    newState = this.updatePackedField(newState, Uint64(40), newHeartbeatCount); // heartbeatCount at offset 40
    this.nodeState(sender).value = newState;

    // Emit ARC-28 event
    emit('Heartbeat', sender, Global.latestTimestamp, newHeartbeatCount);
  }

  /**
   * Suspend a node (admin only)
   */
  suspendNode(nodeAddress: Account, reason: bytes): void {
    this.requireAdmin();
    assert(this.nodeData(nodeAddress).exists, 'Node not registered');
    
    const state = this.nodeState(nodeAddress).value;
    assert(this.getPackedStatus(state) !== NODE_STATUS_BANNED, 'Cannot suspend banned node');
    
    this.nodeState(nodeAddress).value = this.updatePackedField(state, 24, NODE_STATUS_SUSPENDED);

    // Emit ARC-28 event
    emit('NodeSuspended', nodeAddress, Global.latestTimestamp);
  }

  /**
   * Reactivate a suspended node (admin only)
   */
  reactivateNode(nodeAddress: Account): void {
    this.requireAdmin();
    assert(this.nodeData(nodeAddress).exists, 'Node not registered');
    
    const state = this.nodeState(nodeAddress).value;
    assert(this.getPackedStatus(state) === NODE_STATUS_SUSPENDED, 'Node must be suspended');
    
    // Update status and reset heartbeat
    let newState = this.updatePackedField(state, 24, NODE_STATUS_ACTIVE); // status at offset 24
    newState = this.updatePackedField(newState, 16, Global.latestTimestamp); // lastHeartbeat at offset 16
    this.nodeState(nodeAddress).value = newState;

    // Emit ARC-28 event
    emit('NodeReactivated', nodeAddress, Global.latestTimestamp);
  }

  /**
   * Ban a node and slash stake (admin only)
   */
  banNode(nodeAddress: Account, slashPercentage: uint64): void {
    this.requireAdmin();
    assert(this.nodeData(nodeAddress).exists, 'Node not registered');
    assert(slashPercentage <= 10000, 'Slash percentage must be 0-10000 (basis points)');
    
    const state = this.nodeState(nodeAddress).value;
    const currentStake = this.getPackedStake(state);
    const slashAmount: uint64 = (currentStake * slashPercentage) / 10000;
    const remainingStake: uint64 = currentStake - slashAmount;
    
    // Update node status and stake
    let newState = this.updatePackedField(state, 24, NODE_STATUS_BANNED); // status
    newState = this.updatePackedField(newState, 0, remainingStake); // stake
    this.nodeState(nodeAddress).value = newState;
    
    // Slashed funds stay in contract

    // Emit ARC-28 event
    emit('NodeBanned', nodeAddress, slashAmount, remainingStake);
  }

  /**
   * Check if node is active (registered and recently sent heartbeat)
   */
  isNodeActive(nodeAddress: Account): boolean {
    if (!this.nodeData(nodeAddress).exists) {
      return false;
    }
    
    const state = this.nodeState(nodeAddress).value;
    if (this.getPackedStatus(state) !== NODE_STATUS_ACTIVE) {
      return false;
    }
    
    // Check if heartbeat is recent (within 2x the expected interval)
    const maxInterval: uint64 = this.heartbeatInterval.value * 2;
    const timeSinceHeartbeat: uint64 = Global.latestTimestamp - this.getPackedLastHeartbeat(state);
    
    return timeSinceHeartbeat <= maxInterval;
  }

  /**
   * Get node P2P ID
   */
  getNodeP2pId(nodeAddress: Account): bytes {
    assert(this.nodeData(nodeAddress).exists, 'Node not registered');
    return this.nodeData(nodeAddress).value;
  }

  /**
   * Get node stake amount
   */
  getNodeStake(nodeAddress: Account): uint64 {
    assert(this.nodeData(nodeAddress).exists, 'Node not registered');
    return this.getPackedStake(this.nodeState(nodeAddress).value);
  }

  /**
   * Get node status
   */
  getNodeStatus(nodeAddress: Account): uint64 {
    assert(this.nodeData(nodeAddress).exists, 'Node not registered');
    return this.getPackedStatus(this.nodeState(nodeAddress).value);
  }

  /**
   * Get total registered nodes
   */
  getTotalNodes(): uint64 {
    return this.totalNodes.value;
  }

  /**
   * Get node address by index (for discovery/enumeration)
   */
  getNodeByIndex(index: uint64): Account {
    assert(index < this.totalNodes.value, 'Index out of bounds');
    return this.nodeList(index).value;
  }

  /**
   * Get owner of a P2P ID (for reverse lookups)
   */
  getP2pIdOwner(p2pId: bytes): Account {
    assert(this.p2pIdOwner(p2pId).exists, 'P2P ID not registered');
    return this.p2pIdOwner(p2pId).value;
  }

  // Private helper methods

  private requireAdmin(): void {
    assert(Txn.sender === this.admin.value, 'Only admin can call this method');
  }

  private deregisterNode(nodeAddress: Account): void {
    // Get and remove P2P ID mapping
    const p2pId = this.nodeData(nodeAddress).value;
    this.p2pIdOwner(p2pId).delete();
    
    // Remove node box storage
    this.nodeData(nodeAddress).delete();
    this.nodeState(nodeAddress).delete();
    
    // Note: We don't remove from nodeList to preserve indices
    this.totalNodes.value = this.totalNodes.value - 1;

    // Emit ARC-28 event
    emit('NodeDeregistered', nodeAddress, Global.latestTimestamp);
  }
}
