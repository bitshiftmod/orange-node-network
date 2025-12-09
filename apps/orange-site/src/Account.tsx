import { useWallet } from "@txnlab/use-wallet";
import AccountName from "./components/AccountName";
import { useOrangeAccount } from "orange-react";

const Account = () => {
  const { activeAccount, providers } = useWallet();
  const { subscription, loading, error } = useOrangeAccount(activeAccount?.address);

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
            {loading && <div>Loading subscription status...</div>}
            {error && <div className="text-error">Error: {error.message}</div>}
            {subscription && (
              <>
                <div>
                  Account Status: {subscription.isActive ? "Active" : "Inactive"}
                </div>
                {subscription.expirationDate && (
                  <div>
                    Subscription Expires: {subscription.expirationDate.toDateString()}
                  </div>
                )}
                {subscription.daysRemaining !== undefined && subscription.daysRemaining > 0 && (
                  <div>Days Remaining: {subscription.daysRemaining}</div>
                )}
              </>
            )}
          </div>
          <div className="card card-normal bg-base-300 my-4">
            <div className="grid grid-cols-[auto_120px] gap-4 ">
              <div className="m-auto">Add 30-Day Subscription</div>
              <button
                className="btn btn-primary btn-disabled"
                disabled
                title="Subscribe functionality coming soon"
              >
                Subscribe
              </button>
              <div className="m-auto">Add 1-Year Subscription</div>
              <button
                className="btn btn-primary btn-disabled"
                disabled
                title="Subscribe functionality coming soon"
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
