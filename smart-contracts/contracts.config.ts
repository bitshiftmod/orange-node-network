/**
 * Smart Contract Configuration File
 *
 * This configuration is used by puya-ts for compiling the smart contracts
 */

export default {
  // Contract compilation configuration
  contracts: {
    NodeRegistry: {
      path: './src/contracts/NodeRegistry.algo.ts',
      name: 'NodeRegistry',
      description: 'Manages registration and lifecycle of Orange Network nodes',
      appSpec: {
        version: '1.0.0',
        deletable: true,
        updatable: true,
        global: {
          numUint: 7,
          numByteSlice: 0
        },
        local: {
          numUint: 6,
          numByteSlice: 1
        }
      }
    },
    GatewayRegistry: {
      path: './src/contracts/GatewayRegistry.algo.ts',
      name: 'GatewayRegistry',
      description: 'Manages registration and lifecycle of Orange Network gateways',
      appSpec: {
        version: '1.0.0',
        deletable: true,
        updatable: true,
        global: {
          numUint: 6,
          numByteSlice: 1
        },
        local: {
          numUint: 5,
          numByteSlice: 1
        }
      }
    },
    TrustVerification: {
      path: './src/contracts/TrustVerification.algo.ts',
      name: 'TrustVerification',
      description: 'Manages trust verification and reputation scoring for network nodes',
      appSpec: {
        version: '1.0.0',
        deletable: true,
        updatable: true,
        global: {
          numUint: 7,
          numByteSlice: 0
        },
        local: {
          numUint: 5,
          numByteSlice: 0
        }
      }
    }
  },

  // Compiler options
  compiler: {
    target: 'algorand-typescript',
    optimize: true,
    debug: false,
    verbose: false
  },

  // Output configuration
  output: {
    directory: './artifacts',
    includeSpec: true,
    includeTeal: true,
    includeABI: true
  },

  // Network configurations
  networks: {
    development: {
      algod: {
        server: 'http://localhost:4001',
        token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      },
      indexer: {
        server: 'http://localhost:8980',
        token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      }
    },
    testnet: {
      algod: {
        server: 'https://testnet-api.algonode.cloud',
        token: ''
      },
      indexer: {
        server: 'https://testnet-idx.algonode.cloud',
        token: ''
      }
    },
    mainnet: {
      algod: {
        server: 'https://mainnet-api.algonode.cloud',
        token: ''
      },
      indexer: {
        server: 'https://mainnet-idx.algonode.cloud',
        token: ''
      }
    }
  },

  // Deployment configuration
  deployment: {
    minBalance: 100_000, // 0.1 ALGO minimum
    approvalProgramCost: 1_900,
    clearProgramCost: 900,
    extraPages: 0
  }
};