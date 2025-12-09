import { useEffect, useState, useCallback, useMemo } from "react";
import { OrangeSubscriptionsContractClient } from "@orange-node-network/sdk";
import { useOrange } from "./OrangeProvider";

/**
 * Subscription status returned by the hook
 */
export interface SubscriptionStatus {
  /** Whether the user has an active subscription */
  isActive: boolean;
  /** Subscription expiration timestamp (seconds since epoch) */
  expirationTimestamp: bigint;
  /** Expiration as a Date object */
  expirationDate: Date;
  /** Whether the subscription is expired */
  isExpired: boolean;
  /** Days remaining until expiration (negative if expired) */
  daysRemaining: number;
}

/**
 * Return type for useOrangeAccount hook
 */
export interface UseOrangeAccountResult {
  /** Subscription status or undefined if not loaded */
  subscription: SubscriptionStatus | undefined;
  /** Whether the subscription check is in progress */
  loading: boolean;
  /** Error if the check failed */
  error: Error | undefined;
  /** Manually refresh the subscription status */
  refresh: () => Promise<void>;
}

/**
 * Hook to check Orange subscription status for an Algorand address
 * 
 * Requires the component to be wrapped in an OrangeProvider.
 * 
 * @param address - Algorand address to check subscription for
 * @returns Subscription status, loading state, error, and refresh function
 * 
 * @example
 * ```tsx
 * function SubscriptionBadge({ address }: { address: string }) {
 *   const { subscription, loading, error } = useOrangeAccount(address);
 *   
 *   if (loading) return <span>Loading...</span>;
 *   if (error) return <span>Error: {error.message}</span>;
 *   if (!subscription) return <span>No subscription data</span>;
 *   
 *   return (
 *     <span>
 *       {subscription.isActive 
 *         ? `Active - ${subscription.daysRemaining} days left`
 *         : 'Expired'}
 *     </span>
 *   );
 * }
 * ```
 */
const useOrangeAccount = (address: string | undefined): UseOrangeAccountResult => {
  const [subscription, setSubscription] = useState<SubscriptionStatus | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  
  const { algorandClient, subscriptionsAppId } = useOrange();

  // Create contract client
  const client = useMemo(() => {
    return new OrangeSubscriptionsContractClient({
      algorand: algorandClient,
      appId: subscriptionsAppId,
    });
  }, [algorandClient, subscriptionsAppId]);

  // Check subscription status
  const checkSubscription = useCallback(async () => {
    if (!address) {
      setSubscription(undefined);
      setError(undefined);
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      // Call the contract to get subscription expiration
      const result = await client.send.getSubscription({
        args: { user: address },
      });

      const expirationTimestamp = result.return ?? 0n;
      const expirationMs = Number(expirationTimestamp) * 1000;
      const expirationDate = new Date(expirationMs);
      const now = Date.now();
      const isExpired = expirationMs <= now;
      const isActive = !isExpired && expirationTimestamp > 0n;
      const daysRemaining = Math.floor((expirationMs - now) / (1000 * 60 * 60 * 24));

      setSubscription({
        isActive,
        expirationTimestamp,
        expirationDate,
        isExpired,
        daysRemaining,
      });
    } catch (e) {
      // If the user has no subscription, the contract may return 0 or throw
      // Treat as no subscription
      if (e instanceof Error && e.message.includes('box')) {
        // User has no subscription box - this is normal for new users
        setSubscription({
          isActive: false,
          expirationTimestamp: 0n,
          expirationDate: new Date(0),
          isExpired: true,
          daysRemaining: 0,
        });
      } else {
        setError(e instanceof Error ? e : new Error('Failed to check subscription'));
        setSubscription(undefined);
      }
    } finally {
      setLoading(false);
    }
  }, [address, client]);

  // Refresh function for manual refresh
  const refresh = useCallback(async () => {
    await checkSubscription();
  }, [checkSubscription]);

  // Check subscription on mount and when address changes
  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  return { subscription, loading, error, refresh };
};

export default useOrangeAccount;
