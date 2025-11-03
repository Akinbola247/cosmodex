/**
 * Contract Helper Functions

 * ```ts
 * import tokenfactory from "@/contracts/tokenfactory";
 * import { useWallet } from "@/hooks/useWallet";
 * 
 * const { address, signTransaction } = useWallet();
 * 
 * // Set wallet options
 * tokenfactory.options.publicKey = address;
 * tokenfactory.options.signTransaction = signTransaction;
 * 
 * // Call contract method
 * const tx = await tokenfactory.create_token({...});
 * const result = await tx.signAndSend();
 * ```
 */

import { rpcUrl } from "../contracts/util";

/**
 * Get the current ledger sequence for setting expiration
 */
export async function getCurrentLedger(): Promise<number> {
  const response = await fetch(`${rpcUrl}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getLatestLedger",
      params: [],
    }),
  });

  const data = await response.json();
  return data.result.sequence;
}

/**
 * Calculate expiration ledger (current + offset)
 */
export async function getExpirationLedger(
  offsetLedgers: number = 1000
): Promise<number> {
  const current = await getCurrentLedger();
  return current + offsetLedgers;
}

