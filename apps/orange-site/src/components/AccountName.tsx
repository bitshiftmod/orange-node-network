import React, { useEffect, useState } from "react";
import axios from "axios";

interface AccountNameProps {
  account?: string;
  className?: string;
}

const AccountName: React.FC<AccountNameProps> = ({ account }) => {
//   const [copied, setCopied] = useState(false);
  const [nfd, setNfd] = useState("");

  const address = account || "";

  const checkNFD = async (acc: string) => {
    try {
      const response = await axios.get(
        `https://api.nf.domains/nfd/lookup?address=${acc}`
      );
      setNfd(response.data[acc].name || "");
    } catch {
      setNfd("");
    }
  };

  useEffect(() => {
    if (account) {
      checkNFD(account);
    }
  }, [account]);

  const copy = () => {
    // setCopied(true);
    navigator.clipboard.writeText(address || "");
    // setTimeout(() => setCopied(false), 500);
  };

  return (
    <div className="relative flex flex-col items-center select-none">
      <div className={"flex cursor-pointer items-center pt-2"} onClick={copy}>
        {nfd ? (
          <span className="font-bold break-word max-w-sm">{nfd}</span>
        ) : (
          <>
            <b>{address.slice(0, 4)}</b>
            <span className="opacity-80">{address.slice(4, 6)}</span>
            <span className="opacity-50">
              {address.slice(6, 8)}⋯{address.slice(50, 52)}
            </span>
            <span className="opacity-80">{address.slice(52, 54)}</span>
            <b>{address.slice(54)}</b>
          </>
        )}
      </div>
    </div>
  );
};

export default AccountName;
