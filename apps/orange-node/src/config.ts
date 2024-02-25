import fs from 'fs';
import path from 'path';

interface AlgodConfig {
    ALGOD_URL: string | undefined;
    ALGOD_TOKEN: string | undefined;
}

const getConfigFromDataDir = ():AlgodConfig => {
    const ALGORAND_DATA = process.env.ALGORAND_DATA;

    if(ALGORAND_DATA && fs.existsSync(ALGORAND_DATA)) {
       const algod_net = fs.readFileSync(path.join(ALGORAND_DATA, "algod.net")).toString();
       const ALGOD_TOKEN = fs.readFileSync(path.join(ALGORAND_DATA, "algod.token")).toString();

       // Odd server value found in A1CN's algod.net, replace with localhost server value if found
       const ALGOD_URL = 'http://' + algod_net.replace("[::]", "127.0.0.1");
       return {ALGOD_TOKEN, ALGOD_URL}; 
    }
    return {ALGOD_TOKEN: undefined, ALGOD_URL: undefined};
}

// const ALGOD_URL = process.env.ALGOD_URL || "http://localhost:4160";
const ALGOD_CONFIG = getConfigFromDataDir();

export const ALGOD_URL = ALGOD_CONFIG.ALGOD_URL;
export const ALGOD_TOKEN = ALGOD_CONFIG.ALGOD_TOKEN;