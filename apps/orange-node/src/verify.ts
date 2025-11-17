import crypto from "crypto";
import { decodeSignedTransaction, encodeAddress, verifyBytes, decodeAddress } from 'algosdk';

const nonces: { [key: string]: string } = {};

export const generateNonce = (): string => {
  return crypto.randomBytes(16).toString("hex");
};

export const verifyUser = (userId: string, signedTransaction: string): boolean => {
//   const { address, nonce, signedTransaction } = req.body;
//   const userId = "example_user_id"; // Replace with actual user identifier

//   if (nonces[userId] !== nonce) {
//     // return res.status(400).json({ success: false, message: "Invalid nonce" });
//     return false;
//   }

  try {
    const decodedTxn = decodeSignedTransaction(Buffer.from(signedTransaction, "base64"));
    // const txnBytes = Buffer.from(signedTransaction, "base64");
    // const signatureBytes = decodedTxn.sig;
    // const msgpackEncodedTxn = decode(Buffer.from(decodedTxn.txn));

    decodedTxn.sig

    // Verify the transaction details
    const txnNote = new TextDecoder().decode(decodedTxn.txn.note);

    if(txnNote !== nonces[userId]) {
        throw new Error("Invalid nonce");
    }

    

    if (
      msgpackEncodedTxn.from === decodeAddress(address).publicKey &&
      txnNote === nonce &&
      msgpackEncodedTxn.amount === 0
    ) {
      // Verify the signature
      const verified = verifyBytes(
        txnBytes,
        signatureBytes,
        decodeAddress(address).publicKey
      );
      if (verified) {
        return res.json({ success: true, message: "Signature verified" });
      } else {
        return res
          .status(400)
          .json({ success: false, message: "Invalid signature" });
      }
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid transaction" });
    }
  } catch (error) {
    console.error("Verification failed:", error);
    res.status(400).json({ success: false, message: "Verification failed" });
  }

  return true;
};
