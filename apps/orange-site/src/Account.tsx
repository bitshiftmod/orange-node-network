import { useWallet } from "@txnlab/use-wallet";
import AccountName from "./components/AccountName";
import { useOrangeAccount } from "orange-react";
// import { useCallback } from "react";
import { Subscription30Day, SubscriptionYear, subscribe } from "orange-sdk";

const Account = () => {
  const { activeAccount, providers, signer } = useWallet();
  const orangeAccount = useOrangeAccount(activeAccount?.address);

  return (
    <div>
      {activeAccount ? (
        <>
          <div className="card card-normal bg-base-200">
            <AccountName account={activeAccount.address} />
            <div className="py-4">
              <button
                className="btn btn-primary"
                onClick={() => providers?.forEach((p) => p.disconnect())}
              >
                Disconnect
              </button>
            </div>
            <div>Account Status: {orangeAccount ? "Active" : "Inactive"}</div>
            { orangeAccount && (
              <div>
                Subscription Expires: {orangeAccount.expirationDate.toDateString()}
              </div>
              
            )}
          </div>
          <div className="card card-normal bg-base-300 my-4">
            <div className="grid grid-cols-[auto_120px] gap-4 ">
              <div className="m-auto">Add 30-Day Subscription</div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  subscribe(
                    Subscription30Day,
                    activeAccount.address,
                    signer,
                    // sendTransactions
                  );
                }}
              >
                Subscribe
              </button>
              <div className="m-auto">Add 1-Year Subscription</div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  subscribe(
                    SubscriptionYear,
                    activeAccount.address,
                    signer,
                    // sendTransactions
                  );
                }}
              >
                Subscribe
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-2 max-w-96 m-auto">
          {providers?.map((p) => (
            <button
              className="btn btn-primary"
              onClick={p.connect}
              key={`connect-${p.metadata.id}`}
            >
              <div className="flex space-x-2 items-center">
                <img className="w-8 h-8 rounded" src={p.metadata.icon} />
                <span>Connect {p.metadata.name}</span>{" "}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Account;
