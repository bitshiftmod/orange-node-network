import { useEffect, useState } from "react";
import { OrangeSubscription, getSubscription } from "orange-sdk";

const useOrangeAccount = (address: string | undefined) => {
  const [orangeAccount, setOrangeAccount] = useState<
    OrangeSubscription | undefined
  >(undefined);

  useEffect(() => {
    const update = async () => {
      if (address) {
        try {
          setOrangeAccount(await getSubscription(address));
        } catch (e) {
          setOrangeAccount(undefined);
        }
      } else {
        setOrangeAccount(undefined);
      }
    };

    update();
  }, [address]);

  return orangeAccount;
};

export default useOrangeAccount;
