import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Droplets,
  Plus,
  Minus,
  TrendingUp,
  DollarSign,
  Loader2,
  Coins,
  RefreshCw,
} from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import poolfactory from "@/contracts/poolfactory";
import pool from "@/contracts/pool";
import token from "@/contracts/token";
import { CONTRACT_ADDRESSES } from "@/lib/contract-addresses";

// Interface for pool data
interface PoolData {
  id: string;
  poolAddress: string;
  tokenA: string;
  tokenB: string;
  tokenASymbol: string;
  tokenBSymbol: string;
  reserves: [bigint, bigint];
  tvl: string;
  tvlNum?: number;
  myLiquidity: string;
  lpTokenBalance: string;
  lpBalanceRaw?: bigint;
  isXlmPool: boolean;
}

export default function Liquidity() {
  const { address, signTransaction } = useWallet();
  const [pools, setPools] = useState<PoolData[]>([]);
  const [selectedPool, setSelectedPool] = useState<PoolData | null>(null);
  const [tokenAAmount, setTokenAAmount] = useState("");
  const [tokenBAmount, setTokenBAmount] = useState("");
  const [removePercentage, setRemovePercentage] = useState(25);
  const [isLoadingPools, setIsLoadingPools] = useState(false);
  const [isAddingLiquidity, setIsAddingLiquidity] = useState(false);
  const [isRemovingLiquidity, setIsRemovingLiquidity] = useState(false);

  // Balance state
  const [tokenABalance, setTokenABalance] = useState<string>("0");
  const [tokenBBalance, setTokenBBalance] = useState<string>("0");
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);

  // User position state
  const [totalLiquidity, setTotalLiquidity] = useState<string>("$0.00");
  const [totalFees, setTotalFees] = useState<string>("$0.00");
  const [activePositions, setActivePositions] = useState<number>(0);
  const [isLoadingPositions, setIsLoadingPositions] = useState(false);

  // Liquidity step modal
  const [showLiquidityModal, setShowLiquidityModal] = useState(false);
  const [liquiditySteps, setLiquiditySteps] = useState<
    Array<{
      id: string;
      title: string;
      description: string;
      status: "pending" | "processing" | "completed" | "error";
    }>
  >([
    {
      id: "approve-a",
      title: "Approve Token A",
      description: "Allow pool to spend tokens",
      status: "pending",
    },
    {
      id: "approve-b",
      title: "Approve Token B",
      description: "Allow pool to spend tokens",
      status: "pending",
    },
    {
      id: "add-liquidity",
      title: "Add Liquidity",
      description: "Adding tokens to pool",
      status: "pending",
    },
  ]);
  const [liquidityError, setLiquidityError] = useState<string | null>(null);

  // Calculate proportional amount when adding liquidity to existing pool
  const calculateProportionalAmount = (
    amountIn: number,
    isTokenA: boolean,
  ): number => {
    if (!selectedPool || amountIn <= 0) return 0;

    const rawReserveA = selectedPool.reserves[0];
    const rawReserveB = selectedPool.reserves[1];

    if (rawReserveA === BigInt(0) || rawReserveB === BigInt(0)) {
      console.log(
        "No existing liquidity, cannot calculate proportional amount",
      );
      return 0; // No existing liquidity
    }

    // Get token decimals
    const tokenADecimals =
      selectedPool.isXlmPool && selectedPool.tokenASymbol === "XLM"
        ? 7
        : selectedPool.tokenASymbol === "USDT"
          ? 6
          : 18;
    const tokenBDecimals =
      selectedPool.isXlmPool && selectedPool.tokenBSymbol === "XLM"
        ? 7
        : selectedPool.tokenBSymbol === "USDT"
          ? 6
          : 18;

    let reserveIn: bigint;
    let reserveOut: bigint;
    let decimalsIn: number;
    let decimalsOut: number;

    if (isTokenA) {
      // Calculating proportional amount of token B based on token A input
      reserveIn = rawReserveA; // Token A reserve
      reserveOut = rawReserveB; // Token B reserve
      decimalsIn = tokenADecimals;
      decimalsOut = tokenBDecimals;
    } else {
      // Calculating proportional amount of token A based on token B input
      reserveIn = rawReserveB; // Token B reserve
      reserveOut = rawReserveA; // Token A reserve
      decimalsIn = tokenBDecimals;
      decimalsOut = tokenADecimals;
    }

    // Convert input amount to raw format (with token decimals)
    const amountInRaw = BigInt(Math.round(amountIn * Math.pow(10, decimalsIn)));

    // Calculate proportional amount: amountOut = (amountIn * reserveOut) / reserveIn
    const amountOutRaw = (amountInRaw * reserveOut) / reserveIn;

    // Convert back to human readable format
    const result = Number(amountOutRaw) / Math.pow(10, decimalsOut);

    console.log("Proportional calculation:", {
      amountIn,
      isTokenA,
      reserveIn: reserveIn.toString(),
      reserveOut: reserveOut.toString(),
      amountOutRaw: amountOutRaw.toString(),
      result,
      calculation: `${amountIn} → ${result}`,
    });

    return result;
  };

  // Handle token A amount change with proportional calculation
  const handleTokenAChange = (value: string) => {
    setTokenAAmount(value);

    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0 && selectedPool) {
      const proportionalB = calculateProportionalAmount(numValue, true);
      if (proportionalB > 0) {
        setTokenBAmount(proportionalB.toString());
      }
    } else if (value === "") {
      setTokenBAmount("");
    }
  };

  // Handle token B amount change with proportional calculation
  const handleTokenBChange = (value: string) => {
    setTokenBAmount(value);

    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0 && selectedPool) {
      const proportionalA = calculateProportionalAmount(numValue, false);
      if (proportionalA > 0) {
        setTokenAAmount(proportionalA.toString());
      }
    } else if (value === "") {
      setTokenAAmount("");
    }
  };

  // Fetch all pools
  const fetchPools = async () => {
    try {
      setIsLoadingPools(true);

      console.log("=== Fetching All Pools ===");

      // Get all pools from poolfactory (read-only, no wallet needed)
      const tx = await poolfactory.get_all_pools();

      console.log("Raw pools response:", tx);

      // Read-only function - result available from simulation
      let allPools: string[] = [];
      if (tx.result) {
        allPools = tx.result;
        console.log("Pools from simulation:", allPools);
      } else if (address) {
        // Fallback - try signing if needed
        poolfactory.options.publicKey = address;
        const signed = await tx.signAndSend();
        allPools = signed.result;
        console.log("Pools from signed tx:", allPools);
      }

      console.log("Total pools found:", allPools.length);

      if (!allPools || allPools.length === 0) {
        console.log("No pools available");
        setPools([]);
        return;
      }

      // Fetch details for each pool
      const poolPromises = allPools.map(async (poolAddr, index) => {
        try {
          console.log(
            `Fetching pool ${index + 1}/${allPools.length}: ${poolAddr}`,
          );

          // Get token addresses - set contractId before each call
          pool.options.contractId = poolAddr;
          const tokenATx = await pool.get_token_a();
          const tokenA = tokenATx.result;
          console.log(`  Token A: ${tokenA}`);

          pool.options.contractId = poolAddr;
          const tokenBTx = await pool.get_token_b();
          const tokenB = tokenBTx.result;
          console.log(`  Token B: ${tokenB}`);

          // Get reserves
          pool.options.contractId = poolAddr;
          const reservesTx = await pool.get_reserves();
          const reserves = reservesTx.result as [bigint, bigint];
          console.log(`  Reserves: [${reserves[0]}, ${reserves[1]}]`);

          // Get token symbols
          token.options.contractId = tokenA;
          const symbolATx = await token.symbol();
          let tokenASymbol = symbolATx.result || "TOKEN";

          // Check if token A is XLM
          const isXlmPoolA = tokenA === CONTRACT_ADDRESSES.NativeXLM;
          if (isXlmPoolA) tokenASymbol = "XLM";

          token.options.contractId = tokenB;
          const symbolBTx = await token.symbol();
          let tokenBSymbol = symbolBTx.result || "TOKEN";

          // Check if token B is XLM
          const isXlmPoolB = tokenB === CONTRACT_ADDRESSES.NativeXLM;
          if (isXlmPoolB) tokenBSymbol = "XLM";

          const isXlmPool = isXlmPoolA || isXlmPoolB;

          // Calculate TVL from reserves (in USD equivalent)
          let tvl = "$0.00";
          let tvlNum = 0;

          try {
            // Determine which reserve is the stablecoin/XLM
            let stablecoinReserve: bigint;
            let stablecoinDecimals: number;

            if (isXlmPoolA) {
              // XLM is token A
              stablecoinReserve = reserves[0];
              stablecoinDecimals = 7;
            } else if (isXlmPoolB) {
              // XLM is token B
              stablecoinReserve = reserves[1];
              stablecoinDecimals = 7;
            } else {
              // USDC pool - determine which is USDC by magnitude
              const reserveAMagnitude = reserves[0].toString().length;
              const reserveBMagnitude = reserves[1].toString().length;

              if (reserveAMagnitude < reserveBMagnitude) {
                // Reserve A is USDC (smaller magnitude)
                stablecoinReserve = reserves[0];
                stablecoinDecimals = 6;
              } else {
                // Reserve B is USDC
                stablecoinReserve = reserves[1];
                stablecoinDecimals = 6;
              }
            }

            // TVL = 2x the stablecoin reserve (both sides of pool)
            const stablecoinValue =
              Number(stablecoinReserve) / Math.pow(10, stablecoinDecimals);
            tvlNum = stablecoinValue * 2;

            // Format TVL
            if (tvlNum >= 1000000) {
              tvl = `$${(tvlNum / 1000000).toFixed(1)}M`;
            } else if (tvlNum >= 1000) {
              tvl = `$${(tvlNum / 1000).toFixed(1)}K`;
            } else {
              tvl = `$${tvlNum.toFixed(0)}`;
            }
            console.log(`  TVL: ${tvl} (${tvlNum})`);
          } catch (error) {
            console.log(`  Could not calculate TVL:`, error);
          }

          // Get user's LP balance and calculate position value (matching cosmoUI)
          let myLiquidity = "0.00";
          let lpTokenBalance = "0.00";
          let lpBalanceRaw = BigInt(0);

          if (address) {
            try {
              // IMPORTANT: Set contractId for THIS specific pool before EACH call
              pool.options.contractId = poolAddr;
              pool.options.publicKey = address;

              // Get user's LP balance using balance_of
              const balanceTx = await pool.balance_of({ id: address });
              lpBalanceRaw = BigInt(balanceTx.result);

              console.log(
                `  LP Balance for ${poolAddr}: ${lpBalanceRaw.toString()}`,
              );

              if (lpBalanceRaw > BigInt(0) && tvlNum > 0) {
                // Format LP balance (18 decimals) - use 6 decimal places like cosmoUI
                const lpBalanceFormatted =
                  Number(lpBalanceRaw) / Math.pow(10, 18);
                lpTokenBalance = lpBalanceFormatted.toFixed(6); // Changed from .toFixed(4) to .toFixed(6)

                // Get total LP supply - reset contractId again for safety
                pool.options.contractId = poolAddr;
                const supplyTx = await pool.supply();
                const totalSupply = BigInt(supplyTx.result);

                console.log(`  LP Balance (raw): ${lpBalanceRaw.toString()}`);
                console.log(`  LP Balance (formatted): ${lpBalanceFormatted}`);
                console.log(`  Total Supply (raw): ${totalSupply.toString()}`);
                console.log(
                  `  Total Supply (formatted): ${Number(totalSupply) / Math.pow(10, 18)}`,
                );

                if (totalSupply > BigInt(0)) {
                  // Calculate position value: (lpBalance / totalSupply) * TVL
                  const positionValue =
                    (Number(lpBalanceRaw) / Number(totalSupply)) * tvlNum;
                  myLiquidity = `$${positionValue.toFixed(2)}`;

                  const sharePercent =
                    (Number(lpBalanceRaw) / Number(totalSupply)) * 100;
                  console.log(`  Share: ${sharePercent.toFixed(6)}%`);
                  console.log(`  Position Value: $${positionValue.toFixed(2)}`);
                  console.log(
                    `  ✅ Summary: ${lpBalanceFormatted.toFixed(6)} LP (${sharePercent.toFixed(2)}% of pool) = $${positionValue.toFixed(2)}`,
                  );
                }
              } else {
                console.log(`  ℹ️ No LP balance for this pool`);
              }
            } catch (error) {
              console.log(`  ❌ Error fetching position:`, error);
            }
          } else {
            console.log(`  ⚠️ Wallet not connected - skipping position fetch`);
          }

          console.log(`  ✓ Pool: ${tokenASymbol}/${tokenBSymbol}`);

          return {
            id: `pool-${index}`,
            poolAddress: poolAddr,
            tokenA,
            tokenB,
            tokenASymbol,
            tokenBSymbol,
            reserves,
            tvl, // Real TVL from contract
            tvlNum: tvlNum || 0, // Numeric value for calculations
            myLiquidity,
            lpTokenBalance,
            lpBalanceRaw: lpBalanceRaw || BigInt(0), // Raw LP balance for calculations
            isXlmPool,
          };
        } catch (error) {
          console.error(`Error fetching pool ${poolAddr}:`, error);
          return null;
        }
      });

      const poolResults = await Promise.all(poolPromises);
      const validPools = poolResults.filter(
        (p): p is NonNullable<typeof p> => p !== null,
      ) as PoolData[];

      console.log("=== Pools Loaded ===");
      console.log("Valid pools:", validPools.length);

      // Reverse to show newest pools first
      setPools(validPools.reverse());

      // Calculate position summary if wallet connected
      if (address) {
        void calculatePositionSummary(validPools);
      }
    } catch (error) {
      console.error("=== Error Fetching Pools ===");
      console.error("Error:", error);
    } finally {
      setIsLoadingPools(false);
    }
  };

  // Calculate position summary
  const calculatePositionSummary = async (poolsList: PoolData[]) => {
    if (!address) {
      setTotalLiquidity("$0.00");
      setTotalFees("$0.00");
      setActivePositions(0);
      return;
    }

    try {
      setIsLoadingPositions(true);
      console.log("=== Calculating Position Summary ===");

      let totalLiquidityValue = 0;
      let totalFeesValue = 0;
      let activeCount = 0;

      for (const poolData of poolsList) {
        try {
          console.log(
            `  Checking pool ${poolData.tokenASymbol}/${poolData.tokenBSymbol}:`,
            {
              lpBalanceRaw: poolData.lpBalanceRaw?.toString(),
              myLiquidity: poolData.myLiquidity,
              lpTokenBalance: poolData.lpTokenBalance,
            },
          );

          // Use already-fetched LP balance
          if (poolData.lpBalanceRaw && poolData.lpBalanceRaw > BigInt(0)) {
            activeCount++;

            // Use already-calculated position value from myLiquidity
            const liquidityStr = poolData.myLiquidity.replace(/[$,]/g, "");
            const positionValue = parseFloat(liquidityStr);

            console.log(
              `  Parsed value: liquidityStr="${liquidityStr}", positionValue=${positionValue}`,
            );

            if (!isNaN(positionValue) && positionValue > 0) {
              totalLiquidityValue += positionValue;
              console.log(
                `  ✅ ${poolData.tokenASymbol}/${poolData.tokenBSymbol}: $${positionValue.toFixed(2)}`,
              );
            } else {
              console.log(
                `  ⚠️ Invalid position value for ${poolData.tokenASymbol}/${poolData.tokenBSymbol}`,
              );
            }

            // Get unclaimed fees
            try {
              pool.options.contractId = poolData.poolAddress;
              pool.options.publicKey = address;
              const feesTx = await pool.get_user_unclaimed_fees({
                user: address,
              });
              const unclaimedFees = feesTx.result;

              if (unclaimedFees > BigInt(0)) {
                // Fees are typically in USDC (6 decimals)
                const feesNum = Number(unclaimedFees) / Math.pow(10, 6);
                totalFeesValue += feesNum;
                console.log(
                  `  Unclaimed fees in ${poolData.tokenASymbol}/${poolData.tokenBSymbol}: $${feesNum.toFixed(2)}`,
                );
              }
            } catch {
              console.log(
                `  No unclaimed fees for pool ${poolData.poolAddress}`,
              );
            }
          }
        } catch {
          console.log(
            `  Error calculating position for pool ${poolData.poolAddress}`,
          );
        }
      }

      setTotalLiquidity(`$${totalLiquidityValue.toFixed(2)}`);
      setTotalFees(`$${totalFeesValue.toFixed(2)}`);
      setActivePositions(activeCount);

      console.log("=== Position Summary ===");
      console.log(`Total Liquidity: $${totalLiquidityValue.toFixed(2)}`);
      console.log(`Total Fees: $${totalFeesValue.toFixed(2)}`);
      console.log(`Active Positions: ${activeCount}`);
    } catch (error) {
      console.error("Error calculating position summary:", error);
    } finally {
      setIsLoadingPositions(false);
    }
  };

  // Fetch balances for selected pool
  const fetchBalances = async () => {
    if (!address || !selectedPool) return;

    try {
      setIsLoadingBalances(true);
      console.log("=== Fetching Balances ===");

      // Fetch token A balance
      token.options.publicKey = address;
      token.options.contractId = selectedPool.tokenA;

      const balanceATx = await token.balance({ id: address });
      const balanceAResult = balanceATx.result;

      // Format based on decimals (assume 18 for custom tokens, 6 for USDC, 7 for XLM)
      let decimalsA = 18;
      if (
        selectedPool.tokenASymbol === "USDT" ||
        selectedPool.tokenASymbol === "USDC"
      ) {
        decimalsA = 6;
      } else if (selectedPool.tokenASymbol === "XLM") {
        decimalsA = 7;
      }

      const balanceA = Number(balanceAResult) / Math.pow(10, decimalsA);
      setTokenABalance(balanceA.toFixed(4));
      console.log(
        `  Token A (${selectedPool.tokenASymbol}): ${balanceA.toFixed(4)}`,
      );

      // Fetch token B balance
      token.options.contractId = selectedPool.tokenB;
      const balanceBTx = await token.balance({ id: address });
      const balanceBResult = balanceBTx.result;

      let decimalsB = 18;
      if (
        selectedPool.tokenBSymbol === "USDT" ||
        selectedPool.tokenBSymbol === "USDC"
      ) {
        decimalsB = 6;
      } else if (selectedPool.tokenBSymbol === "XLM") {
        decimalsB = 7;
      }

      const balanceB = Number(balanceBResult) / Math.pow(10, decimalsB);
      setTokenBBalance(balanceB.toFixed(4));
      console.log(
        `  Token B (${selectedPool.tokenBSymbol}): ${balanceB.toFixed(4)}`,
      );

      console.log("=== Balances Loaded ===");
    } catch (error) {
      console.error("Error fetching balances:", error);
      setTokenABalance("0");
      setTokenBBalance("0");
    } finally {
      setIsLoadingBalances(false);
    }
  };

  // Fetch pools on mount (doesn't require wallet for read-only)
  useEffect(() => {
    void fetchPools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch balances when pool is selected or wallet connects
  useEffect(() => {
    if (selectedPool && address) {
      void fetchBalances();
    } else {
      setTokenABalance("0");
      setTokenBBalance("0");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPool, address]);

  // Recalculate position summary when wallet connects
  useEffect(() => {
    if (address && pools.length > 0) {
      void calculatePositionSummary(pools);
    } else {
      setTotalLiquidity("$0.00");
      setTotalFees("$0.00");
      setActivePositions(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, pools.length]);

  // Handle add liquidity
  const handleAddLiquidity = async () => {
    if (!selectedPool || !address || !signTransaction) {
      alert("Please connect wallet and select a pool");
      return;
    }

    if (
      !tokenAAmount ||
      !tokenBAmount ||
      Number(tokenAAmount) <= 0 ||
      Number(tokenBAmount) <= 0
    ) {
      alert("Please enter valid amounts for both tokens");
      return;
    }

    setShowLiquidityModal(true);
    setLiquidityError(null);
    setIsAddingLiquidity(true);

    // Reset steps
    setLiquiditySteps([
      {
        id: "approve-a",
        title: `Approve ${selectedPool.tokenASymbol}`,
        description: "Allow pool to spend your tokens",
        status: "pending",
      },
      {
        id: "approve-b",
        title: `Approve ${selectedPool.tokenBSymbol}`,
        description:
          selectedPool.isXlmPool && selectedPool.tokenBSymbol === "XLM"
            ? "Native XLM ready"
            : "Allow pool to spend your tokens",
        status: "pending",
      },
      {
        id: "add-liquidity",
        title: "Add Liquidity",
        description: "Adding tokens to pool",
        status: "pending",
      },
    ]);

    try {
      console.log("=== Starting Add Liquidity ===");
      console.log("Pool:", selectedPool.poolAddress);
      console.log("Amounts:", { tokenA: tokenAAmount, tokenB: tokenBAmount });

      // Get current ledger for expiration
      const { rpc } = await import("@stellar/stellar-sdk");
      const rpcServer = new rpc.Server("https://soroban-testnet.stellar.org");
      const latestLedger = await rpcServer.getLatestLedger();
      const expirationLedger = latestLedger.sequence + 100000;

      console.log("Expiration ledger:", expirationLedger);

      // Determine decimals
      let decimalsA = 18;
      if (
        selectedPool.tokenASymbol === "USDT" ||
        selectedPool.tokenASymbol === "USDC"
      ) {
        decimalsA = 6;
      } else if (selectedPool.tokenASymbol === "XLM") {
        decimalsA = 7;
      }

      let decimalsB = 18;
      if (
        selectedPool.tokenBSymbol === "USDT" ||
        selectedPool.tokenBSymbol === "USDC"
      ) {
        decimalsB = 6;
      } else if (selectedPool.tokenBSymbol === "XLM") {
        decimalsB = 7;
      }

      const amountARaw = BigInt(
        Math.floor(Number(tokenAAmount) * Math.pow(10, decimalsA)),
      );
      const amountBRaw = BigInt(
        Math.floor(Number(tokenBAmount) * Math.pow(10, decimalsB)),
      );

      console.log("Raw amounts:", {
        amountARaw: amountARaw.toString(),
        amountBRaw: amountBRaw.toString(),
      });

      // Step 1: Approve Token A
      setLiquiditySteps((prev) =>
        prev.map((step) =>
          step.id === "approve-a" ? { ...step, status: "processing" } : step,
        ),
      );

      token.options.publicKey = address;
      token.options.signTransaction = signTransaction;
      token.options.contractId = selectedPool.tokenA;

      const approveATx = await token.approve({
        from: address,
        spender: selectedPool.poolAddress,
        amount: amountARaw,
        expiration_ledger: expirationLedger,
      });

      await approveATx.signAndSend();
      console.log(`${selectedPool.tokenASymbol} approved`);

      setLiquiditySteps((prev) =>
        prev.map((step) =>
          step.id === "approve-a" ? { ...step, status: "completed" } : step,
        ),
      );

      // Step 2: Approve Token B (skip if XLM)
      setLiquiditySteps((prev) =>
        prev.map((step) =>
          step.id === "approve-b" ? { ...step, status: "processing" } : step,
        ),
      );

      const isTokenBXLM =
        selectedPool.tokenBSymbol === "XLM" && selectedPool.isXlmPool;

      if (!isTokenBXLM) {
        token.options.contractId = selectedPool.tokenB;

        const approveBTx = await token.approve({
          from: address,
          spender: selectedPool.poolAddress,
          amount: amountBRaw,
          expiration_ledger: expirationLedger,
        });

        await approveBTx.signAndSend();
        console.log(`${selectedPool.tokenBSymbol} approved`);
      } else {
        console.log("XLM pool - no approval needed for native XLM");
      }

      setLiquiditySteps((prev) =>
        prev.map((step) =>
          step.id === "approve-b" ? { ...step, status: "completed" } : step,
        ),
      );

      // Step 3: Add liquidity
      setLiquiditySteps((prev) =>
        prev.map((step) =>
          step.id === "add-liquidity"
            ? { ...step, status: "processing" }
            : step,
        ),
      );

      pool.options.publicKey = address;
      pool.options.signTransaction = signTransaction;
      pool.options.contractId = selectedPool.poolAddress;

      const addLiqTx = await pool.add_liquidity({
        caller: address,
        amount_a: amountARaw,
        amount_b: amountBRaw,
      });

      const { result } = await addLiqTx.signAndSend();
      console.log("Liquidity added:", result);

      setLiquiditySteps((prev) =>
        prev.map((step) =>
          step.id === "add-liquidity" ? { ...step, status: "completed" } : step,
        ),
      );

      // Success! Refresh balances and pools
      setTimeout(() => {
        setShowLiquidityModal(false);
        setTokenAAmount("");
        setTokenBAmount("");
        void fetchBalances();
        void fetchPools();
      }, 2000);
    } catch (error) {
      console.error("Error adding liquidity:", error);
      setLiquidityError(
        error instanceof Error ? error.message : "Failed to add liquidity",
      );
      setLiquiditySteps((prev) =>
        prev.map((step) =>
          step.status === "processing" ? { ...step, status: "error" } : step,
        ),
      );
    } finally {
      setIsAddingLiquidity(false);
    }
  };

  // Handle remove liquidity
  const handleRemoveLiquidity = async () => {
    if (!selectedPool || !address || !signTransaction) {
      alert("Please connect wallet and select a pool");
      return;
    }

    // Validate user has LP tokens
    if (!selectedPool.lpBalanceRaw || selectedPool.lpBalanceRaw === BigInt(0)) {
      alert("You don't have any liquidity in this pool");
      return;
    }

    if (removePercentage <= 0 || removePercentage > 100) {
      alert("Please select a valid percentage (1-100%)");
      return;
    }

    try {
      setIsRemovingLiquidity(true);

      const percentage = removePercentage / 100;

      console.log("=== Starting Remove Liquidity ===");
      console.log("Pool:", selectedPool.poolAddress);
      console.log("LP Balance (raw):", selectedPool.lpBalanceRaw.toString());
      console.log(
        "Percentage to remove:",
        `${removePercentage}% (${percentage})`,
      );

      // Calculate LP amount to burn: lpAmountToRemove = userLpBalance * percentage
      const percentageRaw = BigInt(Math.floor(percentage * Math.pow(10, 18)));
      const lpAmountRaw =
        (selectedPool.lpBalanceRaw * percentageRaw) / BigInt(Math.pow(10, 18));

      console.log("LP Amount to remove (raw):", lpAmountRaw.toString());
      console.log("LP Amount (human):", Number(lpAmountRaw) / Math.pow(10, 18));

      if (lpAmountRaw <= BigInt(0)) {
        alert("Amount too small to remove");
        return;
      }

      // Calculate expected token returns
      const tokenADecimals =
        selectedPool.isXlmPool && selectedPool.tokenASymbol === "XLM"
          ? 7
          : selectedPool.tokenASymbol === "USDT"
            ? 6
            : 18;
      const tokenBDecimals =
        selectedPool.isXlmPool && selectedPool.tokenBSymbol === "XLM"
          ? 7
          : selectedPool.tokenBSymbol === "USDT"
            ? 6
            : 18;

      const expectedTokenA =
        (Number(selectedPool.reserves[0]) * percentage) /
        Math.pow(10, tokenADecimals);
      const expectedTokenB =
        (Number(selectedPool.reserves[1]) * percentage) /
        Math.pow(10, tokenBDecimals);

      console.log("Expected returns:", {
        tokenA: `${expectedTokenA.toFixed(6)} ${selectedPool.tokenASymbol}`,
        tokenB: `${expectedTokenB.toFixed(6)} ${selectedPool.tokenBSymbol}`,
      });

      // Call pool.remove_liquidity
      pool.options.contractId = selectedPool.poolAddress;
      pool.options.publicKey = address;
      pool.options.signTransaction = signTransaction;

      const removeTx = await pool.remove_liquidity({
        caller: address,
        liquidity: lpAmountRaw,
      });

      console.log("Signing and sending transaction...");
      const { result } = await removeTx.signAndSend();
      console.log("✅ Liquidity removed successfully:", result);

      // Success message
      alert(
        `✅ Successfully removed ${removePercentage}% of your liquidity!\n\n` +
          `You received:\n` +
          `• ~${expectedTokenA.toFixed(6)} ${selectedPool.tokenASymbol}\n` +
          `• ~${expectedTokenB.toFixed(6)} ${selectedPool.tokenBSymbol}`,
      );

      // Refresh data
      setRemovePercentage(25);
      void fetchBalances();
      void fetchPools();
    } catch (error) {
      console.error("Error removing liquidity:", error);
      const errorMsg =
        error instanceof Error ? error.message : "Failed to remove liquidity";
      alert(`❌ Error: ${errorMsg}`);
    } finally {
      setIsRemovingLiquidity(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white py-8">
      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          background: #3b82f6;
          cursor: pointer;
          border-radius: 50%;
        }
        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: #3b82f6;
          cursor: pointer;
          border-radius: 50%;
        }
      `}</style>

      <div className="container mx-auto px-4 max-w-7xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Liquidity Pools
          </h1>
          <p className="text-gray-400 text-lg">
            Add or remove liquidity from pools to earn trading fees
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Pool List */}
          <div className="lg:col-span-1">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center">
                    <Droplets className="mr-2 h-5 w-5 text-blue-500" />
                    Available Pools
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void fetchPools()}
                    disabled={isLoadingPools}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${isLoadingPools ? "animate-spin" : ""}`}
                    />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!address ? (
                  <div className="text-center py-8 text-gray-400">
                    <Droplets className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                    <p>Connect wallet to see pools</p>
                  </div>
                ) : isLoadingPools ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-500" />
                    <p className="text-gray-400">Loading pools...</p>
                  </div>
                ) : pools.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Droplets className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                    <p>No pools found</p>
                    <p className="text-sm mt-2">Create a pool to get started</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {pools.map((pool) => (
                      <div
                        key={pool.id}
                        onClick={() => setSelectedPool(pool)}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedPool?.id === pool.id
                            ? "border-blue-500 bg-blue-500/10"
                            : "border-gray-700 bg-gray-800 hover:border-gray-600"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <div className="flex items-center">
                              <span className="font-bold">
                                {pool.tokenASymbol}
                              </span>
                              <span className="mx-1 text-gray-500">/</span>
                              <span className="font-bold">
                                {pool.tokenBSymbol}
                              </span>
                            </div>
                            {pool.isXlmPool && (
                              <Badge
                                variant="outline"
                                className="text-yellow-400 border-yellow-400"
                              >
                                <Coins className="h-3 w-3 mr-1" />
                                XLM
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1 text-xs text-gray-400">
                          <div className="flex justify-between">
                            <span>TVL:</span>
                            <span className="text-white">{pool.tvl}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>My Liquidity:</span>
                            <span
                              className={`font-medium ${
                                pool.myLiquidity !== "0.00" &&
                                pool.myLiquidity !== "$0.00"
                                  ? "text-green-400"
                                  : "text-gray-400"
                              }`}
                            >
                              {pool.myLiquidity}
                            </span>
                          </div>
                          {pool.lpTokenBalance !== "0.00" && (
                            <div className="flex justify-between">
                              <span>LP Tokens:</span>
                              <span className="text-blue-400">
                                {pool.lpTokenBalance}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Liquidity Management */}
          <div className="lg:col-span-2">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle>
                  {selectedPool
                    ? `${selectedPool.tokenASymbol}/${selectedPool.tokenBSymbol} Pool`
                    : "Select a Pool"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedPool ? (
                  <div className="text-center py-12 text-gray-400">
                    <Droplets className="h-16 w-16 mx-auto mb-4 text-gray-600" />
                    <p className="text-lg">
                      Select a pool from the list to manage liquidity
                    </p>
                  </div>
                ) : (
                  <Tabs defaultValue="add" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-gray-800">
                      <TabsTrigger value="add">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Liquidity
                      </TabsTrigger>
                      <TabsTrigger value="remove">
                        <Minus className="h-4 w-4 mr-2" />
                        Remove Liquidity
                      </TabsTrigger>
                    </TabsList>

                    {/* Add Liquidity Tab */}
                    <TabsContent value="add" className="space-y-6 mt-6">
                      <div>
                        <Label className="flex items-center justify-between mb-2">
                          <span>
                            Token A Amount ({selectedPool.tokenASymbol})
                          </span>
                          <div className="flex items-center space-x-2 text-xs">
                            {isLoadingBalances ? (
                              <div className="flex items-center space-x-1 text-gray-400">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Loading...</span>
                              </div>
                            ) : (
                              <>
                                <span className="text-gray-400">Balance:</span>
                                <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full font-medium">
                                  {tokenABalance}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void fetchBalances()}
                                  className="text-gray-400 hover:text-blue-400 transition-colors"
                                  title="Refresh balance"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </Label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={tokenAAmount}
                          onChange={(e) => handleTokenAChange(e.target.value)}
                          className="bg-gray-800 border-gray-700"
                        />
                      </div>

                      <div>
                        <Label className="flex items-center justify-between mb-2">
                          <span>
                            Token B Amount ({selectedPool.tokenBSymbol})
                          </span>
                          <div className="flex items-center space-x-2 text-xs">
                            {isLoadingBalances ? (
                              <div className="flex items-center space-x-1 text-gray-400">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Loading...</span>
                              </div>
                            ) : (
                              <>
                                <span className="text-gray-400">Balance:</span>
                                <span
                                  className={`px-2 py-1 rounded-full font-medium ${
                                    selectedPool.isXlmPool &&
                                    selectedPool.tokenBSymbol === "XLM"
                                      ? "bg-yellow-500/20 text-yellow-400"
                                      : "bg-green-500/20 text-green-400"
                                  }`}
                                >
                                  {tokenBBalance}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void fetchBalances()}
                                  className={`transition-colors ${
                                    selectedPool.isXlmPool &&
                                    selectedPool.tokenBSymbol === "XLM"
                                      ? "text-gray-400 hover:text-yellow-400"
                                      : "text-gray-400 hover:text-green-400"
                                  }`}
                                  title="Refresh balance"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </Label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={tokenBAmount}
                          onChange={(e) => handleTokenBChange(e.target.value)}
                          className="bg-gray-800 border-gray-700"
                        />
                      </div>

                      <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <DollarSign className="h-4 w-4 text-blue-400" />
                          <span className="text-sm font-medium text-blue-300">
                            Liquidity Info
                          </span>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Pool Share:</span>
                            <span className="text-white">0.00%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">LP Tokens:</span>
                            <span className="text-white">0.00</span>
                          </div>
                        </div>
                      </div>

                      <Button
                        onClick={() => void handleAddLiquidity()}
                        disabled={isAddingLiquidity || !address}
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3"
                      >
                        {isAddingLiquidity ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Adding Liquidity...
                          </>
                        ) : !address ? (
                          "Connect Wallet"
                        ) : (
                          "Add Liquidity"
                        )}
                      </Button>
                    </TabsContent>

                    {/* Remove Liquidity Tab */}
                    <TabsContent value="remove" className="space-y-6 mt-6">
                      <div>
                        <Label className="flex justify-between">
                          <span>Amount to Remove</span>
                          <span className="text-blue-400">
                            {removePercentage}%
                          </span>
                        </Label>
                        <div className="mt-4">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={removePercentage}
                            onChange={(e) =>
                              setRemovePercentage(parseInt(e.target.value))
                            }
                            className="slider w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-xs text-gray-500 mt-2">
                            <button
                              type="button"
                              onClick={() => setRemovePercentage(25)}
                              className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                            >
                              25%
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemovePercentage(50)}
                              className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                            >
                              50%
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemovePercentage(75)}
                              className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                            >
                              75%
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemovePercentage(100)}
                              className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                            >
                              100%
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-800 p-4 rounded-lg space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">
                            LP Tokens to Remove:
                          </span>
                          <span className="text-white">0.00</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">
                            You will receive:
                          </span>
                          <div className="text-right">
                            <div className="text-white">
                              0.00 {selectedPool.tokenASymbol}
                            </div>
                            <div className="text-white">
                              0.00 {selectedPool.tokenBSymbol}
                            </div>
                          </div>
                        </div>
                      </div>

                      <Button
                        onClick={() => void handleRemoveLiquidity()}
                        disabled={isRemovingLiquidity || !address}
                        className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3"
                      >
                        {isRemovingLiquidity ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Removing Liquidity...
                          </>
                        ) : !address ? (
                          "Connect Wallet"
                        ) : (
                          "Remove Liquidity"
                        )}
                      </Button>
                    </TabsContent>
                  </Tabs>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Your Positions Summary */}
        {address && pools.length > 0 && (
          <Card className="bg-gray-900 border-gray-800 mt-6">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center">
                  <TrendingUp className="mr-2 h-5 w-5 text-green-500" />
                  Your Liquidity Positions
                </span>
                {isLoadingPositions && (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-800 p-4 rounded-lg">
                  <div className="text-xs text-gray-400 mb-1">
                    Total Liquidity
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {isLoadingPositions ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      totalLiquidity
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Across all pools</p>
                </div>
                <div className="bg-gray-800 p-4 rounded-lg">
                  <div className="text-xs text-gray-400 mb-1">
                    Total Fees Earned
                  </div>
                  <div className="text-2xl font-bold text-green-400">
                    {isLoadingPositions ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      totalFees
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Unclaimed fees</p>
                </div>
                <div className="bg-gray-800 p-4 rounded-lg">
                  <div className="text-xs text-gray-400 mb-1">
                    Active Positions
                  </div>
                  <div className="text-2xl font-bold text-blue-400">
                    {isLoadingPositions ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      activePositions
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Pools with liquidity
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Liquidity Step Modal */}
        {showLiquidityModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <Card className="bg-gray-900 border-gray-800 max-w-md w-full">
              <CardHeader>
                <CardTitle>Adding Liquidity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {liquiditySteps.map((step, index) => (
                    <div key={step.id} className="flex items-start space-x-3">
                      <div
                        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                          step.status === "completed"
                            ? "bg-green-500"
                            : step.status === "processing"
                              ? "bg-blue-500"
                              : step.status === "error"
                                ? "bg-red-500"
                                : "bg-gray-700"
                        }`}
                      >
                        {step.status === "completed" ? (
                          <span className="text-white text-xs">✓</span>
                        ) : step.status === "processing" ? (
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                        ) : (
                          <span className="text-xs text-white">
                            {index + 1}
                          </span>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{step.title}</div>
                        <div className="text-xs text-gray-400">
                          {step.description}
                        </div>
                      </div>
                    </div>
                  ))}

                  {liquidityError && (
                    <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm mt-4">
                      {liquidityError}
                    </div>
                  )}

                  {liquiditySteps.every((s) => s.status === "completed") && (
                    <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm mt-4">
                      ✓ Liquidity added successfully! Refreshing...
                    </div>
                  )}

                  {liquiditySteps.some((s) => s.status === "error") && (
                    <Button
                      onClick={() => setShowLiquidityModal(false)}
                      variant="outline"
                      className="w-full mt-4"
                    >
                      Close
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
