import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap, Droplets, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import token from "@/contracts/token";
import { CONTRACT_ADDRESSES } from "@/lib/contract-addresses";

export default function Minter() {
  const { address, signTransaction } = useWallet();
  const [amount, setAmount] = useState("1000");
  const [isMinting, setIsMinting] = useState(false);
  const [status, setStatus] = useState<null | { type: "success" | "error"; message: string }>(null);

  return (
    <div className="min-h-screen bg-gray-950 text-white py-8">
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
            Test Token Faucet
          </h1>
          <p className="text-gray-400 text-lg">Get test USDT tokens for the testnet</p>
        </div>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Zap className="mr-2 h-5 w-5 text-yellow-500" />
              USDT Faucet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
              <p className="text-sm text-blue-300">
                💡 <strong>Testnet Only:</strong> These are test USDT tokens with no real value. Use them to test swaps, pools, and other platform features.
              </p>
              <p className="text-xs text-blue-400 mt-2">
                Contract: {CONTRACT_ADDRESSES.USDTToken.slice(0, 8)}...{CONTRACT_ADDRESSES.USDTToken.slice(-8)}
              </p>
            </div>

            <div>
              <Label htmlFor="amount">Amount (USDT)</Label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>

            <div className="bg-gray-800 p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Network:</span>
                <span>Stellar Testnet</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Token:</span>
                <span>USDT (Test)</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Daily Limit:</span>
                <span>Unlimited</span>
              </div>
            </div>

            {address && (
              <div className="bg-gray-800 p-3 rounded-lg">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Your Address:</span>
                  <span className="font-mono text-green-400">
                    {address.slice(0, 4)}...{address.slice(-4)}
                  </span>
                </div>
              </div>
            )}

            <Button
              onClick={async () => {
                if (!address || !signTransaction) {
                  setStatus({ type: "error", message: "Please connect your wallet first" });
                  return;
                }

                setIsMinting(true);
                setStatus(null);

                try {
                  // Set wallet options on token contract
                  token.options.publicKey = address;
                  token.options.signTransaction = signTransaction;

                  // Mint USDT (6 decimals)
                  const tx = await token.mint({
                    to: address,
                    amount: BigInt(amount) * BigInt(10 ** 6)
                  });

                  const { result } = await tx.signAndSend();
                  console.log("Mint result:", result);
                  
                  setStatus({ 
                    type: "success", 
                    message: `Successfully minted ${amount} USDT to your wallet!` 
                  });
                } catch (error: any) {
                  console.error("Mint error:", error);
                  setStatus({ 
                    type: "error", 
                    message: error?.message || "Minting failed. Make sure you have XLM for fees." 
                  });
                } finally {
                  setIsMinting(false);
                }
              }}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-semibold py-3"
              disabled={isMinting || !address || !amount || Number(amount) <= 0}
            >
              {isMinting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Minting...
                </>
              ) : !address ? (
                "Connect Wallet to Mint"
              ) : (
                <>
                  <Droplets className="mr-2 h-4 w-4" />
                  Mint {amount} USDT
                </>
              )}
            </Button>

            {status && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                status.type === "success" 
                  ? "bg-green-900/20 border border-green-500/30 text-green-400" 
                  : "bg-red-900/20 border border-red-500/30 text-red-400"
              }`}>
                {status.type === "success" ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <AlertCircle className="w-5 h-5" />
                )}
                <span className="text-sm">{status.message}</span>
              </div>
            )}

            {!address && (
              <p className="text-xs text-center text-gray-500">
                Connect your wallet to receive test tokens
              </p>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-400">
            Need XLM for transaction fees?{" "}
            <a href="https://laboratory.stellar.org/#account-creator?network=test" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
              Use Stellar Lab Friendbot →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

