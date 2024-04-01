import "./App.css";

import {
  WalletProvider,
  useInitializeProviders,
  PROVIDER_ID,
} from "@txnlab/use-wallet";
import { DeflyWalletConnect } from "@blockshake/defly-connect";
import { PeraWalletConnect } from "@perawallet/connect";
// import { DaffiWalletConnect } from '@daffiwallet/connect'
// import LuteConnect from 'lute-connect'
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

function App() {
  const providers = useInitializeProviders({
    providers: [
      { id: PROVIDER_ID.DEFLY, clientStatic: DeflyWalletConnect },
      { id: PROVIDER_ID.PERA, clientStatic: PeraWalletConnect },
      // { id: PROVIDER_ID.DAFFI, clientStatic: DaffiWalletConnect },
      // { id: PROVIDER_ID.EXODUS },
      // {
      //   id: PROVIDER_ID.LUTE,
      //   clientStatic: LuteConnect,
      //   clientOptions: { siteName: 'YourSiteName' }
      // },
      // { id: PROVIDER_ID.KIBISIS }
    ],
    nodeConfig: testnetNodeConfig,
  });

  return (
    <WalletProvider value={providers}>
      <div className="navbar bg-base-100">
      <a className="btn btn-ghost text-xl">Orange Accounts</a>

      </div>
      <Account />
    </WalletProvider>
  );
}

export default App;
