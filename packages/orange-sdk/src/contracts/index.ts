/**
 * Smart Contract Clients
 * 
 * This module exports the generated smart contract clients for interacting
 * with Orange Network contracts on Algorand.
 * 
 * Run `npm run copy-contracts` to update the generated clients from the
 * smart-contracts package.
 */

// Re-export generated contract clients
export * from './generated';

// Subscription type constants
export const SUBSCRIPTION_30_DAY = 1;
export const SUBSCRIPTION_YEAR = 2;
export type SubscriptionType = 1 | 2;

// Duration constants (in seconds)
export const DURATION_30_DAYS = 2_592_000; // 30 * 24 * 60 * 60
export const DURATION_YEAR = 31_536_000; // 365 * 24 * 60 * 60
