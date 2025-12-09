import { createContext, useContext, useMemo, ReactNode } from 'react';
import { AlgorandClient } from '@algorandfoundation/algokit-utils/types/algorand-client';

/**
 * Orange context value
 */
export interface OrangeContextValue {
  /** AlgorandClient instance */
  algorandClient: AlgorandClient;
  /** Subscriptions contract app ID */
  subscriptionsAppId: bigint;
}

const OrangeContext = createContext<OrangeContextValue | null>(null);

/**
 * Props for OrangeProvider
 */
export interface OrangeProviderProps {
  /** AlgorandClient instance for blockchain interaction */
  algorandClient: AlgorandClient;
  /** Orange Subscriptions contract app ID */
  subscriptionsAppId: bigint;
  /** Child components */
  children: ReactNode;
}

/** @deprecated Use OrangeProviderProps instead */
export type OrangeConfig = Omit<OrangeProviderProps, 'children'>;

/**
 * Orange Provider Component
 * 
 * Provides Orange Network context to child components.
 * 
 * @example
 * ```tsx
 * import { AlgorandClient } from '@algorandfoundation/algokit-utils';
 * import { OrangeProvider } from 'orange-react';
 * 
 * function App() {
 *   const algorandClient = AlgorandClient.testNet();
 *   
 *   return (
 *     <OrangeProvider 
 *       algorandClient={algorandClient}
 *       subscriptionsAppId={123456789n}
 *     >
 *       <YourApp />
 *     </OrangeProvider>
 *   );
 * }
 * ```
 */
export function OrangeProvider({ algorandClient, subscriptionsAppId, children }: OrangeProviderProps) {
  const value = useMemo<OrangeContextValue>(() => ({
    algorandClient,
    subscriptionsAppId,
  }), [algorandClient, subscriptionsAppId]);

  return (
    <OrangeContext.Provider value={value}>
      {children}
    </OrangeContext.Provider>
  );
}

/**
 * Hook to access Orange context
 * 
 * @returns Orange context value
 * @throws Error if used outside of OrangeProvider
 */
export function useOrange(): OrangeContextValue {
  const context = useContext(OrangeContext);
  
  if (!context) {
    throw new Error('useOrange must be used within an OrangeProvider');
  }
  
  return context;
}

export default OrangeProvider;
