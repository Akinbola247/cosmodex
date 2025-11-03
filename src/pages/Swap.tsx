import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, Loader2, Settings, RefreshCw } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import tokenfactory from "@/contracts/tokenfactory";
import poolfactory from "@/contracts/poolfactory";
import pool from "@/contracts/pool";
import token from "@/contracts/token";
import { CONTRACT_ADDRESSES } from "@/lib/contract-addresses";
import { rpc } from "@stellar/stellar-sdk";

interface TokenData {
  symbol: string;
  name: string;
  contractAddress: string;
  decimals: number;
  balance: string;
}

export default function Swap() {
  const { address, signTransaction } = useWallet();
  const [fromToken, setFromToken] = useState<TokenData | null>(null);
  const [toToken, setToToken] = useState<TokenData | null>(null);
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [availableTokens, setAvailableTokens] = useState<TokenData[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [poolAddress, setPoolAddress] = useState<string | null>(null);
  const [reserves, setReserves] = useState<[bigint, bigint] | null>(null);

  // Fetch available tokens on mount
  useEffect(() => {
    void fetchAvailableTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch balances when wallet connects or tokens change
  useEffect(() => {
    if (address && availableTokens.length > 0) {
      void fetchBalances();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, availableTokens.length]);

  // Calculate to amount when from amount or tokens change
  useEffect(() => {
    if (fromAmount && fromToken && toToken && reserves && poolAddress) {
      calculateToAmount();
    } else if (!fromAmount || fromAmount === "0" || fromAmount === "") {
      setToAmount("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAmount, fromToken, toToken, reserves, poolAddress]);

  // Fetch available tokens (optimized for speed)
  const fetchAvailableTokens = async () => {
    try {
      setIsLoadingTokens(true);
      console.log("Fetching available tokens...");

      // Add USDT first (available immediately)
      const tokens: TokenData[] = [
        {
          symbol: "USDT",
          name: "USD Tether",
          contractAddress: CONTRACT_ADDRESSES.USDTToken,
          decimals: 6,
          balance: "0"
        }
      ];

      setAvailableTokens([...tokens]);
      setFromToken(tokens[0]);

      // Get all deployed tokens
      const tokensTx = await tokenfactory.get_all_deployed_tokens();
      let tokenAddresses: string[] = [];

      if (tokensTx.result) {
        tokenAddresses = tokensTx.result;
      } else if (address) {
        tokenfactory.options.publicKey = address;
        const { result } = await tokensTx.signAndSend();
        tokenAddresses = result;
      }

      console.log(`Fetching metadata for ${tokenAddresses.length} tokens...`);

      // Fetch metadata for all tokens in parallel
      const tokenPromises = tokenAddresses.map(async (tokenAddr) => {
        try {
          token.options.contractId = tokenAddr;
          
          // Fetch all metadata in parallel for each token
          const [symbolTx, nameTx, decimalsTx] = await Promise.all([
            token.symbol(),
            token.name(),
            token.decimals()
          ]);

          return {
            symbol: (symbolTx.result) || "TOKEN",
            name: (nameTx.result) || "Unknown",
            contractAddress: tokenAddr,
            decimals: Number(decimalsTx.result) || 18,
            balance: "0"
          };
        } catch (error) {
          console.error(`Error fetching token ${tokenAddr}:`, error);
          return null;
        }
      });

      // Wait for all tokens to load
      const tokenResults = await Promise.all(tokenPromises);
      const validTokens = tokenResults.filter((t): t is TokenData => t !== null);

      // Add custom tokens to USDT
      const allTokens = [...tokens, ...validTokens];
      setAvailableTokens(allTokens);
      
      // Set default "to" token if not set
      if (validTokens.length > 0 && !toToken) {
        setToToken(validTokens[0]);
      }

      console.log(`✅ Loaded ${allTokens.length} tokens (${validTokens.length} custom + 1 USDT)`);
    } catch (error) {
      console.error("Error fetching tokens:", error);
    } finally {
      setIsLoadingTokens(false);
    }
  };

  // Fetch token balances
  const fetchBalances = async () => {
    if (!address) return;

    for (const tkn of availableTokens) {
      try {
        token.options.contractId = tkn.contractAddress;
        token.options.publicKey = address;
        const balanceTx = await token.balance({ id: address });
        const balance = BigInt(balanceTx.result);
        const balanceFormatted = Number(balance) / Math.pow(10, tkn.decimals);
        tkn.balance = balanceFormatted.toFixed(4);
      } catch (error) {
        console.error(`Error fetching balance for ${tkn.symbol}:`, error);
      }
    }

    setAvailableTokens([...availableTokens]);
  };

  // Fetch pool and reserves
  const fetchPoolData = async (tokenA: TokenData, tokenB: TokenData) => {
    try {
      console.log(`=== Fetching Pool Data ===`);
      console.log(`Tokens: ${tokenA.symbol}/${tokenB.symbol}`);
      console.log(`Addresses: ${tokenA.contractAddress} / ${tokenB.contractAddress}`);

      // Get pool address
      const poolTx = await poolfactory.get_pool({
        token_a: tokenA.contractAddress,
        token_b: tokenB.contractAddress
      });

      let poolAddr = poolTx.result as string;
      console.log(`Pool result (direction 1):`, poolAddr);

      if (!poolAddr) {
        // Try reverse
        console.log(`Trying reverse direction...`);
        const poolTx2 = await poolfactory.get_pool({
          token_a: tokenB.contractAddress,
          token_b: tokenA.contractAddress
        });
        poolAddr = poolTx2.result as string;
        console.log(`Pool result (direction 2):`, poolAddr);
      }

      if (!poolAddr || poolAddr === "") {
        console.error(`No pool found for ${tokenA.symbol}/${tokenB.symbol}`);
        setSwapError(`No pool found for ${tokenA.symbol}/${tokenB.symbol}`);
        setPoolAddress(null);
        setReserves(null);
        return;
      }

      console.log(`✅ Pool found: ${poolAddr}`);
      setPoolAddress(poolAddr);

      // Get reserves
      pool.options.contractId = poolAddr;
      const reservesTx = await pool.get_reserves();
      
      console.log("Reserves TX result:", reservesTx);
      console.log("Reserves TX result type:", typeof reservesTx.result);
      
      // Handle different result formats
      let poolReserves: [bigint, bigint];
      
      if (Array.isArray(reservesTx.result)) {
        poolReserves = [
          BigInt(reservesTx.result[0]),
          BigInt(reservesTx.result[1])
        ];
      } else {
        console.error("Unexpected reserves format:", reservesTx.result);
        setSwapError("Error fetching pool reserves");
        return;
      }

      console.log(`✅ Reserves fetched:`, {
        reserveA: poolReserves[0].toString(),
        reserveB: poolReserves[1].toString(),
        reserveAHuman: Number(poolReserves[0]) / Math.pow(10, 18),
        reserveBHuman: Number(poolReserves[1]) / Math.pow(10, 6)
      });

      setReserves(poolReserves);
      setSwapError(null);
    } catch (error) {
      console.error("=== Error Fetching Pool ===");
      console.error("Error:", error);
      setSwapError("Error fetching pool data");
      setPoolAddress(null);
      setReserves(null);
    }
  };

  // Calculate output amount (matching cosmoUI's implementation)
  const calculateToAmount = () => {
    if (!reserves || !fromAmount || !fromToken || !toToken || !poolAddress) {
      setToAmount("");
      return;
    }

    const amount = parseFloat(fromAmount);
    if (amount <= 0 || isNaN(amount)) {
      setToAmount("0");
      return;
    }

    try {
      console.log("=== Calculating Swap Output ===");
      console.log(`Input: ${fromAmount} ${fromToken.symbol} → ${toToken.symbol}`);
      
      const [rawReserveA, rawReserveB] = reserves;
      
      console.log("Reserves:", {
        reserveA: rawReserveA.toString(),
        reserveB: rawReserveB.toString(),
        fromDecimals: fromToken.decimals,
        toDecimals: toToken.decimals
      });

      // Determine which reserve corresponds to which token based on decimals
      let reserveIn: bigint;
      let reserveOut: bigint;
      let decimalsIn: number;
      let decimalsOut: number;
      
      // Identify USDT and custom token reserves by magnitude and decimals
      const reserveAMagnitude = rawReserveA.toString().length;
      const reserveBMagnitude = rawReserveB.toString().length;
      
      // USDT has 6 decimals (smaller magnitude), Custom tokens have 18 decimals (larger magnitude)
      const reserveAIsUSDT = reserveAMagnitude < reserveBMagnitude;
      
      let usdtReserve: bigint;
      let customTokenReserve: bigint;
      
      if (reserveAIsUSDT) {
        usdtReserve = rawReserveA;
        customTokenReserve = rawReserveB;
      } else {
        usdtReserve = rawReserveB;
        customTokenReserve = rawReserveA;
      }
      
      // Map based on swap direction
      if (fromToken.decimals === 6 && toToken.decimals === 18) {
        // USDT → Custom Token
        reserveIn = usdtReserve;
        reserveOut = customTokenReserve;
        decimalsIn = 6;
        decimalsOut = 18;
        console.log("Direction: USDT → Custom Token");
      } else if (fromToken.decimals === 18 && toToken.decimals === 6) {
        // Custom Token → USDT
        reserveIn = customTokenReserve;
        reserveOut = usdtReserve;
        decimalsIn = 18;
        decimalsOut = 6;
        console.log("Direction: Custom Token → USDT");
      } else {
        // Both have same decimals or different pairing
        console.log("Using fallback reserve mapping");
        if (fromToken.decimals === 6) {
          reserveIn = usdtReserve;
          reserveOut = customTokenReserve;
        } else {
          reserveIn = customTokenReserve;
          reserveOut = usdtReserve;
        }
        decimalsIn = fromToken.decimals;
        decimalsOut = toToken.decimals;
      }
      
      // Convert input amount to BigInt with proper decimals
      const amountInBigInt = BigInt(Math.floor(amount * Math.pow(10, decimalsIn)));
      
      console.log("Calculation inputs:", {
        amountInBigInt: amountInBigInt.toString(),
        reserveIn: reserveIn.toString(),
        reserveOut: reserveOut.toString(),
        decimalsIn,
        decimalsOut
      });
      
      // Calculate with 0.3% fee
      const fee = BigInt(30); // 0.3% = 30 basis points
      const feeDenominator = BigInt(10000);
      const amountInWithFee = (amountInBigInt * (feeDenominator - fee)) / feeDenominator;
      
      // Constant product formula: (reserveOut * amountInWithFee) / (reserveIn + amountInWithFee)
      const numerator = reserveOut * amountInWithFee;
      const denominator = reserveIn + amountInWithFee;
      const amountOut = numerator / denominator;
      
      console.log("AMM Calculation:", {
        amountInWithFee: amountInWithFee.toString(),
        numerator: numerator.toString(),
        denominator: denominator.toString(),
        amountOut: amountOut.toString()
      });
      
      // Convert back to human readable format
      const amountOutHuman = Number(amountOut) / Math.pow(10, decimalsOut);
      const result = amountOutHuman.toFixed(6);
      
      console.log(`✅ Result: ${fromAmount} ${fromToken.symbol} → ${result} ${toToken.symbol}`);
      
      setToAmount(result);
    } catch (error) {
      console.error("Error calculating amount:", error);
      setToAmount("0");
    }
  };

  // Handle from amount change
  const handleFromAmountChange = (value: string) => {
    setFromAmount(value);
    // calculateToAmount will be triggered by useEffect
  };

  // Handle token swap (flip from and to)
  const handleFlipTokens = () => {
    const tempToken = fromToken;
    setFromToken(toToken);
    setToToken(tempToken);
    setFromAmount(toAmount);
    setToAmount("");
  };

  // Handle token selection
  useEffect(() => {
    if (fromToken && toToken) {
      void fetchPoolData(fromToken, toToken);
    }
  }, [fromToken, toToken]);

  // Execute swap
  const executeSwap = async () => {
    if (!address || !signTransaction || !fromToken || !toToken || !fromAmount || !toAmount || !poolAddress) {
      setSwapError("Missing required data for swap");
      return;
    }

    // Validate amount is positive
    const amount = parseFloat(fromAmount);
    if (amount <= 0 || isNaN(amount)) {
      setSwapError("Amount must be greater than 0");
      return;
    }

    // Validate sufficient balance
    const userBalance = parseFloat(fromToken.balance);
    if (amount > userBalance) {
      setSwapError(`Insufficient ${fromToken.symbol} balance. You have ${fromToken.balance} but trying to swap ${fromAmount}`);
      return;
    }

    try {
      setIsSwapping(true);
      setSwapError(null);

      const amountIn = BigInt(Math.floor(parseFloat(fromAmount) * Math.pow(10, fromToken.decimals)));

      // Get expiration ledger
      const server = new rpc.Server("https://soroban-testnet.stellar.org");
      const latestLedger = await server.getLatestLedger();
      const expirationLedger = latestLedger.sequence + 100000;

      console.log("=== Executing Swap ===");
      console.log(`From: ${fromAmount} ${fromToken.symbol}`);
      console.log(`To: ~${toAmount} ${toToken.symbol}`);
      console.log(`Amount (raw): ${amountIn.toString()}`);
      console.log(`Pool: ${poolAddress}`);

      // Step 1: Approve token spending
      console.log("Step 1: Approving token...");
      token.options.contractId = fromToken.contractAddress;
      token.options.publicKey = address;
      token.options.signTransaction = signTransaction;

      const approveTx = await token.approve({
        from: address,
        spender: poolAddress,
        amount: amountIn,
        expiration_ledger: expirationLedger
      });

      await approveTx.signAndSend();
      console.log("✅ Approval successful");

      // Step 2: Execute swap
      console.log("Step 2: Executing swap...");
      pool.options.contractId = poolAddress;
      pool.options.publicKey = address;
      pool.options.signTransaction = signTransaction;

      const swapTx = await pool.swap({
        caller: address,
        input_token: fromToken.contractAddress,
        amount_in: amountIn
      });

      const swapResult = await swapTx.signAndSend();
      console.log("✅ Swap successful:", swapResult);

      // Success message
      alert(`✅ Successfully swapped!\n\n${fromAmount} ${fromToken.symbol} → ~${toAmount} ${toToken.symbol}`);

      // Clear form
      setFromAmount("");
      setToAmount("");

      // Refresh balances
      console.log("Refreshing balances...");
      await fetchBalances();

      // Refresh pool data
      if (fromToken && toToken) {
        console.log("Refreshing pool data...");
        await fetchPoolData(fromToken, toToken);
      }

      console.log("=== Swap Complete ===");

    } catch (error) {
      console.error("=== Swap Failed ===");
      console.error("Error:", error);
      
      let errorMessage = "Swap failed";
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // Parse common error messages
        if (errorMessage.includes("User declined")) {
          errorMessage = "Transaction was cancelled";
        } else if (errorMessage.includes("insufficient")) {
          errorMessage = "Insufficient balance or allowance";
        } else if (errorMessage.includes("slippage")) {
          errorMessage = "Price changed too much. Try again with higher slippage";
        }
      }
      
      setSwapError(errorMessage);
      alert(`❌ Swap failed: ${errorMessage}`);
    } finally {
      setIsSwapping(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white py-8">
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
            Swap Tokens
          </h1>
          <p className="text-gray-400 text-lg">Trade tokens with minimal slippage and low fees</p>
        </div>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center">
                <ArrowUpDown className="mr-2 h-5 w-5 text-green-500" />
                Swap
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void fetchBalances()}
                  disabled={!address || isLoadingTokens}
                  type="button"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" type="button">
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingTokens ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <span className="ml-2">Loading tokens...</span>
              </div>
            ) : (
              <>
                {/* From Token */}
                <div className="bg-gray-800 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <select
                      className="bg-gray-700 text-white px-3 py-1 rounded-lg font-semibold"
                      value={fromToken?.contractAddress || ""}
                      onChange={(e) => {
                        const selected = availableTokens.find(t => t.contractAddress === e.target.value);
                        setFromToken(selected || null);
                      }}
                    >
                      <option value="">Select token</option>
                      {availableTokens.map((tkn) => (
                        <option key={tkn.contractAddress} value={tkn.contractAddress}>
                          {tkn.symbol}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">
                        Balance: {fromToken?.balance || "0"}
                      </span>
                      {fromToken && parseFloat(fromToken.balance) > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-green-400 hover:text-green-300"
                          onClick={() => setFromAmount(fromToken.balance)}
                          type="button"
                        >
                          MAX
                        </Button>
                      )}
                    </div>
                  </div>
                  <Input
                    placeholder="0.0"
                    value={fromAmount}
                    onChange={(e) => handleFromAmountChange(e.target.value)}
                    className="bg-transparent border-none text-2xl font-semibold p-0"
                    type="number"
                    step="any"
                  />
                </div>

                {/* Swap Button */}
                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full bg-gray-800 hover:bg-gray-700"
                    onClick={handleFlipTokens}
                    type="button"
                  >
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                </div>

                {/* To Token */}
                <div className="bg-gray-800 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <select
                      className="bg-gray-700 text-white px-3 py-1 rounded-lg font-semibold"
                      value={toToken?.contractAddress || ""}
                      onChange={(e) => {
                        const selected = availableTokens.find(t => t.contractAddress === e.target.value);
                        setToToken(selected || null);
                      }}
                    >
                      <option value="">Select token</option>
                      {availableTokens.map((tkn) => (
                        <option key={tkn.contractAddress} value={tkn.contractAddress}>
                          {tkn.symbol}
                        </option>
                      ))}
                    </select>
                    <span className="text-sm text-gray-400">
                      Balance: {toToken?.balance || "0"}
                    </span>
                  </div>
                  <Input
                    placeholder="0.0"
                    value={toAmount}
                    readOnly
                    className="bg-transparent border-none text-2xl font-semibold p-0"
                  />
                </div>

                {/* Pool Info */}
                {poolAddress && reserves && (
                  <div className="bg-gray-800 p-3 rounded-lg text-sm">
                    <div className="flex justify-between text-gray-400">
                      <span>Pool:</span>
                      <span className="text-green-400">Found ✓</span>
                    </div>
                    <div className="flex justify-between text-gray-400 mt-1">
                      <span>Fee:</span>
                      <span>0.3%</span>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {swapError && (
                  <div className="bg-red-900/20 border border-red-500 p-3 rounded-lg text-sm text-red-400">
                    {swapError}
                  </div>
                )}

                {/* Low Balance Warning with Mint Link */}
                {address && fromToken && fromToken.symbol === "USDT" && parseFloat(fromToken.balance) < 10 && (
                  <div className="bg-blue-900/20 border border-blue-500 p-3 rounded-lg text-sm">
                    <div className="text-blue-400">
                      💡 Low USDT balance: {fromToken.balance}
                    </div>
                    <div className="text-gray-400 mt-1">
                      Visit the <a href="/minter" className="text-blue-400 hover:underline">Minter page</a> to get test USDT
                    </div>
                  </div>
                )}

                {/* Swap Button */}
                {!address ? (
                  <Button className="w-full bg-green-500 hover:bg-green-600 text-black font-semibold py-3" disabled>
                    Connect Wallet to Swap
                  </Button>
                ) : !fromToken || !toToken ? (
                  <Button className="w-full bg-gray-700 text-gray-400 font-semibold py-3" disabled>
                    Select Tokens
                  </Button>
                ) : !poolAddress ? (
                  <Button className="w-full bg-gray-700 text-gray-400 font-semibold py-3" disabled>
                    No Pool Available
                  </Button>
                ) : !fromAmount || parseFloat(fromAmount) <= 0 ? (
                  <Button className="w-full bg-gray-700 text-gray-400 font-semibold py-3" disabled>
                    Enter Amount
                  </Button>
                ) : parseFloat(fromAmount) > parseFloat(fromToken.balance) ? (
                  <Button className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3" disabled>
                    Insufficient {fromToken.symbol} Balance
                  </Button>
                ) : (
                  <Button
                    className="w-full bg-green-500 hover:bg-green-600 text-black font-semibold py-3"
                    onClick={() => void executeSwap()}
                    disabled={isSwapping}
                  >
                    {isSwapping ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Swapping...
                      </>
                    ) : (
                      `Swap ${fromToken?.symbol} for ${toToken?.symbol}`
                    )}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
