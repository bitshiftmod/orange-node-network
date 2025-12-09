import "./App.css";
import { useMemo } from "react";

import {
  WalletProvider,
  useInitializeProviders,
  PROVIDER_ID,
} from "@txnlab/use-wallet";
import { DeflyWalletConnect } from "@blockshake/defly-connect";
import { PeraWalletConnect } from "@perawallet/connect";
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { OrangeProvider } from "orange-react";
import Account from "./Account";

// const mainnetNodeConfig = {
//   nodeServer: 'https://xna-mainnet-api.algonode.cloud',
//   nodePort: 443,
//   network: 'mainnet',
// }

const testnetNodeConfig = {
  nodeServer: "https://testnet-api.algonode.cloud",
  nodePort: 443,
  network: "testnet",
};

// Orange Subscriptions contract app ID on testnet
// TODO: Update this with the actual deployed app ID
const ORANGE_SUBSCRIPTIONS_APP_ID = BigInt(0);

function App() {
  const providers = useInitializeProviders({
    providers: [
      { id: PROVIDER_ID.DEFLY, clientStatic: DeflyWalletConnect },
      { id: PROVIDER_ID.PERA, clientStatic: PeraWalletConnect },
    ],
    nodeConfig: testnetNodeConfig,
  });

  // Create AlgorandClient for testnet
  const algorandClient = useMemo(() => {
    return AlgorandClient.fromConfig({
      algodConfig: {
        server: testnetNodeConfig.nodeServer,
        port: testnetNodeConfig.nodePort,
      },
    });
  }, []);

  return (
    <WalletProvider value={providers}>
      <OrangeProvider
        algorandClient={algorandClient}
        subscriptionsAppId={ORANGE_SUBSCRIPTIONS_APP_ID}
      >
        <div className="navbar bg-base-100">
          <a className="btn btn-ghost text-xl">Orange Accounts</a>
        </div>
        <Account />
      </OrangeProvider>
    </WalletProvider>
  );
}

export default App;
