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
  Bytes,
  Uint64,
  emit,
} from '@algorandfoundation/algorand-typescript';

/**
 * Orange Gateway Registry - Algorand TypeScript v1.0
 * 
 * Purpose: Register gateways for decentralized discovery
 * 
 * Features:
 * - Gateway registration with endpoint and public key
 * - Configurable stake requirements (admin-controlled)
 * - Stake management (add stake, withdraw to minimum or full)
 * - Heartbeat system for availability tracking
 * - Status management (active/suspended/banned)
 * - BoxMap storage for discoverability (no LocalState)
 * 
 * Storage Design (optimized for 8-box reference limit):
 * - gatewayData: All variable-length data (endpoint, publicKey) stored as: len(2) + endpoint + len(2) + publicKey
 * - gatewayState: All numeric fields packed as 8 uint64 values (64 bytes total)
 *   [stake, registeredAt, lastHeartbeat, status, cumulativeUptime, heartbeatCount, reserved1, reserved2]
 * - gatewayList: index -> Account for enumeration
 * 
 * Note: Registrants pay MBR cost for box storage
 */

// Gateway status constants (module-level for Puya compatibility)
const GATEWAY_STATUS_ACTIVE: uint64 = 0;
const GATEWAY_STATUS_SUSPENDED: uint64 = 1;
const GATEWAY_STATUS_BANNED: uint64 = 2;

class OrangeGatewayRegistry extends Contract {
  // Global state
  admin = GlobalState<Account>();
  totalGateways = GlobalState<uint64>();
  minStakeGateways = GlobalState<uint64>();
  maxGateways = GlobalState<uint64>();
  heartbeatInterval = GlobalState<uint64>();
  
  // Box storage for gateway data (keyed by gateway account address)
  // gatewayData: variable-length blob = 2-byte len + endpoint + 2-byte len + publicKey
  gatewayData = BoxMap<Account, bytes>({ keyPrefix: 'gd' });
  // gatewayState: fixed 64 bytes = 8 x uint64 packed values
  gatewayState = BoxMap<Account, bytes>({ keyPrefix: 'gs' });
  
  // Box storage for index-based lookups
  gatewayList = BoxMap<uint64, Account>({ keyPrefix: 'gl' });

  // ===== Helper methods for packed state storage =====
  
  /**
   * Pack gateway state into 64 bytes (8 x uint64)
   */
  private packGatewayState(
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

  /**
   * Pack gateway data (endpoint + publicKey with length prefixes)
   */
  private packGatewayData(endpoint: bytes, publicKey: bytes): bytes {
    const endpointLen = op.extract(op.itob(endpoint.length), 6, 2);
    const publicKeyLen = op.extract(op.itob(publicKey.length), 6, 2);
    let result = op.concat(endpointLen, endpoint);
    result = op.concat(result, publicKeyLen);
    result = op.concat(result, publicKey);
    return result;
  }

  /**
   * Extract endpoint from packed data
   */
  private unpackEndpoint(data: bytes): bytes {
    const lenBytes = op.concat(Bytes('\x00\x00\x00\x00\x00\x00'), op.extract(data, 0, 2));
    const endpointLen = op.btoi(lenBytes);
    return op.extract(data, 2, endpointLen);
  }

  /**
   * Extract publicKey from packed data
   */
  private unpackPublicKey(data: bytes): bytes {
    const endpointLenBytes = op.concat(Bytes('\x00\x00\x00\x00\x00\x00'), op.extract(data, 0, 2));
    const endpointLen = op.btoi(endpointLenBytes);
    const pkOffset: uint64 = Uint64(2) + endpointLen;
    const pkLenBytes = op.concat(Bytes('\x00\x00\x00\x00\x00\x00'), op.extract(data, pkOffset, 2));
    const publicKeyLen = op.btoi(pkLenBytes);
    const pkDataOffset: uint64 = pkOffset + Uint64(2);
    return op.extract(data, pkDataOffset, publicKeyLen);
  }

  // ===== Contract methods =====

  /**
   * Create the contract with initial configuration
   */
  createApplication(): void {
    this.admin.value = Txn.sender;
    this.totalGateways.value = 0;
    this.minStakeGateways.value = 12_000_000_000; // 12000 ORA (assuming 6 decimals)
    this.maxGateways.value = 1_000; // Limit total gateways
    this.heartbeatInterval.value = 300; // 5 minutes
  }

  /**
   * Update minimum stake requirement for gateways (admin only)
   */
  updateMinStakeGateways(newMinStake: uint64): void {
    this.requireAdmin();
    assert(newMinStake > 0, 'Minimum stake must be greater than 0');
    this.minStakeGateways.value = newMinStake;
  }

  /**
   * Update maximum gateways allowed (admin only)
   */
  updateMaxGateways(newMaxGateways: uint64): void {
    this.requireAdmin();
    assert(newMaxGateways > this.totalGateways.value, 'Max gateways must be greater than current total');
    this.maxGateways.value = newMaxGateways;
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
   * Register a gateway with endpoint and public key
   * Requires payment transaction for stake + MBR for box storage
   */
  registerGateway(endpoint: bytes, publicKey: bytes): void {
    const sender = Txn.sender;
    
    // Validations - check if gateway already exists
    assert(!this.gatewayData(sender).exists, 'Gateway already registered');
    assert(this.totalGateways.value < this.maxGateways.value, 'Maximum gateways reached');
    assert(endpoint.length > 0, 'Endpoint required');
    assert(endpoint.length <= 256, 'Endpoint too long');
    assert(publicKey.length > 0, 'Public key required');
    assert(publicKey.length <= 128, 'Public key too long');
    
    // Verify payment transaction (must be in group)
    // Payment should cover stake + MBR for box storage
    assert(Txn.groupIndex > 0, 'Payment transaction required');
    const paymentTxn = gtxn.PaymentTxn(Txn.groupIndex - 1);
    assert(paymentTxn.receiver === Global.currentApplicationAddress, 'Payment must be to contract');
    assert(paymentTxn.amount >= this.minStakeGateways.value, 'Insufficient stake amount');
    
    const stakeAmount = paymentTxn.amount;
    
    // Store gateway data in packed format
    this.gatewayData(sender).value = this.packGatewayData(endpoint, publicKey);
    this.gatewayState(sender).value = this.packGatewayState(
      stakeAmount,
      Global.latestTimestamp,
      Global.latestTimestamp,
      GATEWAY_STATUS_ACTIVE,
      0,
      0
    );
    
    // Add to gateway list for enumeration
    this.gatewayList(this.totalGateways.value).value = sender;
    this.totalGateways.value = this.totalGateways.value + 1;

    // Emit ARC-28 event
    emit('GatewayRegistered', sender, stakeAmount, Global.latestTimestamp);
  }

  /**
   * Update gateway endpoint (gateway owner only)
   */
  updateEndpoint(newEndpoint: bytes): void {
    const sender = Txn.sender;
    assert(this.gatewayData(sender).exists, 'Gateway not registered');
    assert(newEndpoint.length > 0, 'Endpoint required');
    assert(newEndpoint.length <= 256, 'Endpoint too long');
    
    const state = this.gatewayState(sender).value;
    assert(this.getPackedStatus(state) === GATEWAY_STATUS_ACTIVE, 'Gateway must be active');
    
    // Extract current publicKey and repack with new endpoint
    const currentData = this.gatewayData(sender).value;
    const publicKey = this.unpackPublicKey(currentData);
    this.gatewayData(sender).value = this.packGatewayData(newEndpoint, publicKey);
  }

  /**
   * Update gateway public key (gateway owner only)
   */
  updatePublicKey(newPublicKey: bytes): void {
    const sender = Txn.sender;
    assert(this.gatewayData(sender).exists, 'Gateway not registered');
    assert(newPublicKey.length > 0, 'Public key required');
    assert(newPublicKey.length <= 128, 'Public key too long');
    
    const state = this.gatewayState(sender).value;
    assert(this.getPackedStatus(state) === GATEWAY_STATUS_ACTIVE, 'Gateway must be active');
    
    // Extract current endpoint and repack with new publicKey
    const currentData = this.gatewayData(sender).value;
    const endpoint = this.unpackEndpoint(currentData);
    this.gatewayData(sender).value = this.packGatewayData(endpoint, newPublicKey);
  }

  /**
   * Add additional stake to existing registration
   * Requires payment transaction
   */
  addStake(): void {
    const sender = Txn.sender;
    assert(this.gatewayData(sender).exists, 'Gateway not registered');
    
    const state = this.gatewayState(sender).value;
    assert(this.getPackedStatus(state) === GATEWAY_STATUS_ACTIVE, 'Gateway must be active to add stake');
    
    // Verify payment transaction
    assert(Txn.groupIndex > 0, 'Payment transaction required');
    const paymentTxn = gtxn.PaymentTxn(Txn.groupIndex - 1);
    assert(paymentTxn.receiver === Global.currentApplicationAddress, 'Payment must be to contract');
    assert(paymentTxn.amount > 0, 'Payment amount must be greater than 0');
    
    // Update stake amount
    const currentStake = this.getPackedStake(state);
    const newStake: uint64 = currentStake + paymentTxn.amount;
    this.gatewayState(sender).value = this.updatePackedField(state, Uint64(0), newStake);

    // Emit ARC-28 event
    emit('GatewayStakeAdded', sender, paymentTxn.amount, newStake);
  }

  /**
   * Withdraw stake
   * Can withdraw to minimum or full amount (which deregisters)
   */
  withdrawStake(amount: uint64): void {
    const sender = Txn.sender;
    assert(this.gatewayData(sender).exists, 'Gateway not registered');
    
    const state = this.gatewayState(sender).value;
    assert(this.getPackedStatus(state) !== GATEWAY_STATUS_BANNED, 'Banned gateways cannot withdraw');
    assert(amount > 0, 'Withdrawal amount must be greater than 0');
    
    const currentStake = this.getPackedStake(state);
    assert(amount <= currentStake, 'Insufficient stake balance');
    
    const remainingStake: uint64 = currentStake - amount;
    
    // Allow full withdrawal OR withdrawal to minimum
    if (remainingStake === 0) {
      // Full withdrawal - deregister gateway
      this.deregisterGateway(sender);
    } else {
      // Partial withdrawal - must maintain minimum
      assert(remainingStake >= this.minStakeGateways.value, 
             'Remaining stake must meet minimum requirement or withdraw full amount');
      
      this.gatewayState(sender).value = this.updatePackedField(state, 0, remainingStake);
    }
    
    // Send payment
    itxn.payment({
      receiver: sender,
      amount: amount,
      fee: Global.minTxnFee
    }).submit();

    // Emit ARC-28 event
    emit('GatewayStakeWithdrawn', sender, amount, remainingStake);
  }

  /**
   * Heartbeat to prove gateway is alive and update uptime
   */
  heartbeat(): void {
    const sender = Txn.sender;
    assert(this.gatewayData(sender).exists, 'Gateway not registered');
    
    const state = this.gatewayState(sender).value;
    assert(this.getPackedStatus(state) === GATEWAY_STATUS_ACTIVE, 'Only active gateways can send heartbeat');
    
    const lastBeat = this.getPackedLastHeartbeat(state);
    const timeSinceLastHeartbeat: uint64 = Global.latestTimestamp - lastBeat;
    
    // Calculate uptime credit (only if within reasonable interval)
    const maxInterval: uint64 = this.heartbeatInterval.value * 2;
    let newUptime = this.getPackedCumulativeUptime(state);
    if (timeSinceLastHeartbeat <= maxInterval) {
      newUptime = newUptime + timeSinceLastHeartbeat;
    }
    
    const newHeartbeatCount: uint64 = this.getPackedHeartbeatCount(state) + Uint64(1);
    
    // Update state with new values (update lastHeartbeat, uptime, and heartbeatCount)
    let newState = this.updatePackedField(state, Uint64(16), Global.latestTimestamp); // lastHeartbeat at offset 16
    newState = this.updatePackedField(newState, Uint64(32), newUptime); // cumulativeUptime at offset 32
    newState = this.updatePackedField(newState, Uint64(40), newHeartbeatCount); // heartbeatCount at offset 40
    this.gatewayState(sender).value = newState;

    // Emit ARC-28 event
    emit('GatewayHeartbeat', sender, Global.latestTimestamp, newHeartbeatCount);
  }

  /**
   * Suspend a gateway (admin only)
   */
  suspendGateway(gatewayAddress: Account, reason: bytes): void {
    this.requireAdmin();
    assert(this.gatewayData(gatewayAddress).exists, 'Gateway not registered');
    
    const state = this.gatewayState(gatewayAddress).value;
    assert(this.getPackedStatus(state) !== GATEWAY_STATUS_BANNED, 'Cannot suspend banned gateway');
    
    this.gatewayState(gatewayAddress).value = this.updatePackedField(state, 24, GATEWAY_STATUS_SUSPENDED);

    // Emit ARC-28 event
    emit('GatewaySuspended', gatewayAddress, Global.latestTimestamp);
  }

  /**
   * Reactivate a suspended gateway (admin only)
   */
  reactivateGateway(gatewayAddress: Account): void {
    this.requireAdmin();
    assert(this.gatewayData(gatewayAddress).exists, 'Gateway not registered');
    
    const state = this.gatewayState(gatewayAddress).value;
    assert(this.getPackedStatus(state) === GATEWAY_STATUS_SUSPENDED, 'Gateway must be suspended');
    
    // Update status and reset heartbeat
    let newState = this.updatePackedField(state, 24, GATEWAY_STATUS_ACTIVE); // status at offset 24
    newState = this.updatePackedField(newState, 16, Global.latestTimestamp); // lastHeartbeat at offset 16
    this.gatewayState(gatewayAddress).value = newState;

    // Emit ARC-28 event
    emit('GatewayReactivated', gatewayAddress, Global.latestTimestamp);
  }

  /**
   * Ban a gateway and slash stake (admin only)
   */
  banGateway(gatewayAddress: Account, slashPercentage: uint64): void {
    this.requireAdmin();
    assert(this.gatewayData(gatewayAddress).exists, 'Gateway not registered');
    assert(slashPercentage <= 10000, 'Slash percentage must be 0-10000 (basis points)');
    
    const state = this.gatewayState(gatewayAddress).value;
    const currentStake = this.getPackedStake(state);
    const slashAmount: uint64 = (currentStake * slashPercentage) / 10000;
    const remainingStake: uint64 = currentStake - slashAmount;
    
    // Update gateway status and stake
    let newState = this.updatePackedField(state, 24, GATEWAY_STATUS_BANNED); // status
    newState = this.updatePackedField(newState, 0, remainingStake); // stake
    this.gatewayState(gatewayAddress).value = newState;
    
    // Slashed funds stay in contract (could be sent to treasury in future)

    // Emit ARC-28 event
    emit('GatewayBanned', gatewayAddress, slashAmount, remainingStake);
  }

  /**
   * Check if gateway is active (registered and recently sent heartbeat)
   */
  isGatewayActive(gatewayAddress: Account): boolean {
    if (!this.gatewayData(gatewayAddress).exists) {
      return false;
    }
    
    const state = this.gatewayState(gatewayAddress).value;
    if (this.getPackedStatus(state) !== GATEWAY_STATUS_ACTIVE) {
      return false;
    }
    
    // Check if heartbeat is recent (within 2x the expected interval)
    const maxInterval: uint64 = this.heartbeatInterval.value * 2;
    const timeSinceHeartbeat: uint64 = Global.latestTimestamp - this.getPackedLastHeartbeat(state);
    
    return timeSinceHeartbeat <= maxInterval;
  }

  /**
   * Get gateway endpoint
   */
  getGatewayEndpoint(gatewayAddress: Account): bytes {
    assert(this.gatewayData(gatewayAddress).exists, 'Gateway not registered');
    return this.unpackEndpoint(this.gatewayData(gatewayAddress).value);
  }

  /**
   * Get gateway public key
   */
  getGatewayPublicKey(gatewayAddress: Account): bytes {
    assert(this.gatewayData(gatewayAddress).exists, 'Gateway not registered');
    return this.unpackPublicKey(this.gatewayData(gatewayAddress).value);
  }

  /**
   * Get gateway stake amount
   */
  getGatewayStake(gatewayAddress: Account): uint64 {
    assert(this.gatewayData(gatewayAddress).exists, 'Gateway not registered');
    return this.getPackedStake(this.gatewayState(gatewayAddress).value);
  }

  /**
   * Get gateway status
   */
  getGatewayStatus(gatewayAddress: Account): uint64 {
    assert(this.gatewayData(gatewayAddress).exists, 'Gateway not registered');
    return this.getPackedStatus(this.gatewayState(gatewayAddress).value);
  }

  /**
   * Get total registered gateways
   */
  getTotalGateways(): uint64 {
    return this.totalGateways.value;
  }

  /**
   * Get gateway address by index (for discovery/enumeration)
   */
  getGatewayByIndex(index: uint64): Account {
    assert(index < this.totalGateways.value, 'Index out of bounds');
    return this.gatewayList(index).value;
  }

  // Private helper methods

  private requireAdmin(): void {
    assert(Txn.sender === this.admin.value, 'Only admin can call this method');
  }

  private deregisterGateway(gatewayAddress: Account): void {
    // Remove gateway box storage
    this.gatewayData(gatewayAddress).delete();
    this.gatewayState(gatewayAddress).delete();
    
    // Note: We don't remove from gatewayList to preserve indices
    this.totalGateways.value = this.totalGateways.value - 1;

    // Emit ARC-28 event
    emit('GatewayDeregistered', gatewayAddress, Global.latestTimestamp);
  }
}
