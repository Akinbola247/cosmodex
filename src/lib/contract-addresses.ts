/**
 * Contract addresses and configuration
 * Deployed on Stellar Testnet
 * 
 * Usage:
 * ```ts
 * import { CONTRACT_ADDRESSES } from "@/lib/contract-addresses";
 * const factoryId = CONTRACT_ADDRESSES.TokenFactory;
 * ```
 */

/**
 * Testnet contract addresses
 * These are the deployed contract IDs from environments.toml
 */
export const CONTRACT_ADDRESSES = {
  // Core CosmoDex contracts
  TokenFactory: "CAZ7KEXHZDHP6ZZXOADXNBN4XY3TPRVWJSHU3UDXIN3GKJALJDAR2S6Y",
  PoolFactory: "CCA6WZEXVK2AFI2BIG5PSJODNL2U6727KHISBDGEXV2FTGPW4DPGNZH3",
  
  // Test USDT token (used for pool pairing)
  USDTToken: "CDHIKAGJD6MIGXGPCY26ZLHV44JOKK6YU2JPNEZO3TNSXR4IOPPL7CRY",
  
  // TokenLaunch contract
  TokenLaunch: "CAXEF6EPKTV6SX4QOO45DZIJBSXUN7G6HT5KVUVQDA6YZE772ZER6N4C",
  
  // Native XLM contract address (SAC for native asset on Stellar Testnet)
  NativeXLM: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
} as const;

/**
 * Get contract ID by name
 */
export function getContractId(contractName: keyof typeof CONTRACT_ADDRESSES): string {
  return CONTRACT_ADDRESSES[contractName] || "";
}

