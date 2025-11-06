import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Rocket,
  Upload,
  Loader2,
  Droplets,
  Coins,
  CheckCircle,
  RefreshCw,
} from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import tokenfactory from "@/contracts/tokenfactory";
import poolfactory from "@/contracts/poolfactory";
import pool from "@/contracts/pool";
import token from "@/contracts/token";
import { CONTRACT_ADDRESSES } from "@/lib/contract-addresses";
import { uploadTokenToPinata, validateImageFile } from "@/lib/pinata";
import { rpc } from "@stellar/stellar-sdk";

export default function Launch() {
  const { address, signTransaction } = useWallet();
  const [currentStep, setCurrentStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<string | null>(
    null,
  );

  // Token data
  const [tokenData, setTokenData] = useState({
    name: "",
    symbol: "",
    description: "",
    totalSupply: "",
    website: "",
    twitter: "",
    telegram: "",
  });

  const [poolData] = useState({
    slippageTolerance: 1,
    fee: 0.3,
  });

  const [liquidityData, setLiquidityData] = useState({
    tokenAmount: 0,
    xlmAmount: 0,
    lockDuration: 365,
    useXlm: false,
  });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);
  const [poolAddress, setPoolAddress] = useState<string | null>(null);

  // Balance tracking
  const [tokenBalance, setTokenBalance] = useState<string>("0");
  const [usdcBalance, setUsdcBalance] = useState<string>("0");
  const [xlmBalance, setXlmBalance] = useState<string>("0");
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);

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
      id: "approve-custom",
      title: "Approve Custom Token",
      description: "Allow pool to spend your tokens",
      status: "pending",
    },
    {
      id: "approve-second",
      title: "Approve Second Token",
      description: "Allow pool to spend USDC/XLM",
      status: "pending",
    },
    {
      id: "add-liquidity",
      title: "Add Liquidity",
      description: "Add tokens to pool",
      status: "pending",
    },
  ]);
  const [liquidityError, setLiquidityError] = useState<string | null>(null);

  // Fetch balances for Step 3
  const fetchBalances = async () => {
    if (!address || !tokenAddress) return;

    try {
      setIsLoadingBalances(true);

      // Fetch custom token balance
      token.options.publicKey = address;
      token.options.contractId = tokenAddress;
      const tokenBalTx = await token.balance({ id: address });
      const tokenBalResult = await tokenBalTx.signAndSend();
      const tokenBal = Number(tokenBalResult.result) / Math.pow(10, 18);
      setTokenBalance(tokenBal.toFixed(2));

      // Fetch USDC balance
      token.options.contractId = CONTRACT_ADDRESSES.USDTToken;
      const usdcBalTx = await token.balance({ id: address });
      const usdcBalResult = await usdcBalTx.signAndSend();
      const usdcBal = Number(usdcBalResult.result) / Math.pow(10, 6);
      setUsdcBalance(usdcBal.toFixed(2));

      // Fetch XLM balance via Horizon
      const response = await fetch(
        `https://horizon-testnet.stellar.org/accounts/${address}`,
      );
      const accountData = (await response.json()) as {
        balances: Array<{ asset_type: string; balance: string }>;
      };
      const xlmBal = accountData.balances.find(
        (b) => b.asset_type === "native",
      );
      if (xlmBal) {
        setXlmBalance(parseFloat(xlmBal.balance).toFixed(2));
      }
    } catch (error) {
      console.error("Error fetching balances:", error);
    } finally {
      setIsLoadingBalances(false);
    }
  };

  // Fetch balances when reaching Step 3
  useEffect(() => {
    if (currentStep === 3 && address && tokenAddress) {
      void fetchBalances();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, address, tokenAddress]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validation = validateImageFile(file);
      if (!validation.valid) {
        setTransactionStatus(validation.error || "Invalid image file");
        return;
      }

      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLaunchToken = async () => {
    if (!address || !signTransaction) {
      setTransactionStatus("Please connect your wallet first");
      return;
    }

    if (!imageFile) {
      setTransactionStatus("Please upload a token image");
      return;
    }

    try {
      setIsProcessing(true);
      setTransactionStatus("Uploading metadata to IPFS...");

      // Upload to IPFS
      const uploadResult = await uploadTokenToPinata(imageFile, {
        name: tokenData.name,
        symbol: tokenData.symbol,
        description: tokenData.description,
        admin_addr: address,
        decimals: 18,
        total_supply: BigInt(
          Math.floor(Number(tokenData.totalSupply) * Math.pow(10, 18)),
        ).toString(),
        website: tokenData.website,
        twitter: tokenData.twitter,
        telegram: tokenData.telegram,
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || "Failed to upload to IPFS");
      }

      setTransactionStatus("Creating token on Stellar...");

      // Set wallet options on the contract
      tokenfactory.options.publicKey = address;
      tokenfactory.options.signTransaction = signTransaction;

      // Generate salt
      const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(32)));

      // Create token using the default exported client
      const tx = await tokenfactory.create_token({
        admin_addr: address,
        token_name: tokenData.name,
        token_symbol: tokenData.symbol,
        token_decimals: 18,
        token_supply: BigInt(
          Math.floor(Number(tokenData.totalSupply) * Math.pow(10, 18)),
        ),
        token_owner: address,
        token_metadata: uploadResult.metadataUrl || "",
        salt,
      });

      const { result } = await tx.signAndSend();
      setTokenAddress(result);
      setTransactionStatus("Token created successfully!");
      console.log("Token address:", result);

      // Move to next step
      setTimeout(() => {
        setCurrentStep(2);
        setTransactionStatus(null);
      }, 2000);
    } catch (error) {
      console.error("Error launching token:", error);
      setTransactionStatus(
        `Error: ${error instanceof Error ? error.message : "Failed to launch token"}`,
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreatePool = async () => {
    console.log("=== Pool Creation Started ===");
    console.log("Wallet address:", address);
    console.log("Token address:", tokenAddress);
    console.log("Token symbol:", tokenData.symbol);

    if (!address || !signTransaction) {
      setTransactionStatus("Please connect your wallet first");
      return;
    }

    if (!tokenAddress) {
      setTransactionStatus(
        "Token address not found. Please launch token first.",
      );
      console.error("Token address is missing!");
      return;
    }

    if (!tokenData.symbol || tokenData.symbol.trim() === "") {
      setTransactionStatus("Token symbol is required");
      console.error("Token symbol is missing!");
      return;
    }

    try {
      setIsProcessing(true);
      setTransactionStatus("Creating pool...");

      // Set wallet options
      poolfactory.options.publicKey = address;
      poolfactory.options.signTransaction = signTransaction;

      // Generate salt - use same method as token creation
      const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(32)));

      // Choose second token based on pool type
      const secondToken = liquidityData.useXlm
        ? CONTRACT_ADDRESSES.NativeXLM // Native XLM
        : CONTRACT_ADDRESSES.USDTToken; // USDC

      // Validate second token
      if (!secondToken) {
        throw new Error(`Invalid second token address`);
      }

      const lpTokenName = `${tokenData.symbol}${liquidityData.useXlm ? "XLM" : "USDC"}LP`;
      const lpTokenSymbol = `${tokenData.symbol}${liquidityData.useXlm ? "XLM" : "USDC"}LP`;

      const poolParams = {
        token_a: tokenAddress,
        token_b: secondToken,
        lp_token_name: lpTokenName,
        lp_token_symbol: lpTokenSymbol,
        salt,
      };

      console.log("=== Pool Parameters ===");
      console.log("token_a:", poolParams.token_a);
      console.log("token_b:", poolParams.token_b);
      console.log("lp_token_name:", poolParams.lp_token_name);
      console.log("lp_token_symbol:", poolParams.lp_token_symbol);
      console.log("salt length:", poolParams.salt.length);
      console.log("poolType:", liquidityData.useXlm ? "XLM" : "USDC");

      // Validate all parameters
      if (
        !poolParams.token_a ||
        !poolParams.token_b ||
        !poolParams.lp_token_name ||
        !poolParams.lp_token_symbol
      ) {
        throw new Error("Missing required pool parameters");
      }

      console.log("Calling poolfactory.create_pool...");

      // Create pool
      const tx = await poolfactory.create_pool(poolParams);

      console.log("Transaction created, signing and sending...");
      const { result } = await tx.signAndSend();

      setPoolAddress(result);
      setTransactionStatus(`Pool created successfully!`);
      console.log("=== Pool Created Successfully ===");
      console.log("Pool address:", result);

      // Move to next step
      setTimeout(() => {
        setCurrentStep(3);
        setTransactionStatus(null);
      }, 2000);
    } catch (error) {
      console.error("=== Pool Creation Error ===");
      console.error("Error object:", error);
      console.error(
        "Error message:",
        error instanceof Error ? error.message : String(error),
      );
      setTransactionStatus(
        `Error: ${error instanceof Error ? error.message : "Failed to create pool"}`,
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddLiquidity = async () => {
    if (!address || !signTransaction || !tokenAddress || !poolAddress) {
      setLiquidityError(
        "Missing required data. Please complete previous steps.",
      );
      return;
    }

    // Validate amounts
    if (!liquidityData.tokenAmount || !liquidityData.xlmAmount) {
      setLiquidityError("Please enter amounts for both tokens");
      return;
    }

    setShowLiquidityModal(true);
    setLiquidityError(null);
    setIsProcessing(true);

    // Reset steps
    setLiquiditySteps([
      {
        id: "approve-custom",
        title: `Approve ${tokenData.symbol}`,
        description: "Allow pool to spend your tokens",
        status: "pending",
      },
      {
        id: "approve-second",
        title: liquidityData.useXlm ? "Prepare XLM" : "Approve USDC",
        description: liquidityData.useXlm
          ? "Native XLM ready"
          : "Allow pool to spend USDC",
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

      // Get current ledger for expiration
      const rpcServer = new rpc.Server("https://soroban-testnet.stellar.org");
      const latestLedger = await rpcServer.getLatestLedger();
      const expirationLedger = latestLedger.sequence + 100000; // ~138 hours

      console.log("Current ledger:", latestLedger.sequence);
      console.log("Expiration ledger:", expirationLedger);

      // Step 1: Approve custom token
      setLiquiditySteps((prev) =>
        prev.map((step) =>
          step.id === "approve-custom"
            ? { ...step, status: "processing" }
            : step,
        ),
      );

      token.options.publicKey = address;
      token.options.signTransaction = signTransaction;
      token.options.contractId = tokenAddress;

      const tokenAmountRaw = BigInt(
        Math.floor(liquidityData.tokenAmount * Math.pow(10, 18)),
      );

      const approveTx = await token.approve({
        from: address,
        spender: poolAddress,
        amount: tokenAmountRaw,
        expiration_ledger: expirationLedger,
      });

      await approveTx.signAndSend();
      console.log("Custom token approved");

      setLiquiditySteps((prev) =>
        prev.map((step) =>
          step.id === "approve-custom"
            ? { ...step, status: "completed" }
            : step,
        ),
      );

      // Step 2: Approve second token (if USDC)
      setLiquiditySteps((prev) =>
        prev.map((step) =>
          step.id === "approve-second"
            ? { ...step, status: "processing" }
            : step,
        ),
      );

      if (!liquidityData.useXlm) {
        token.options.contractId = CONTRACT_ADDRESSES.USDTToken;
        const secondTokenAmountRaw = BigInt(
          Math.floor(liquidityData.xlmAmount * Math.pow(10, 6)),
        );

        const approveUsdcTx = await token.approve({
          from: address,
          spender: poolAddress,
          amount: secondTokenAmountRaw,
          expiration_ledger: expirationLedger,
        });

        await approveUsdcTx.signAndSend();
        console.log("USDC approved");
      } else {
        console.log("XLM pool - no approval needed");
      }

      setLiquiditySteps((prev) =>
        prev.map((step) =>
          step.id === "approve-second"
            ? { ...step, status: "completed" }
            : step,
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
      pool.options.contractId = poolAddress;

      const secondTokenAmount = liquidityData.useXlm
        ? BigInt(Math.floor(liquidityData.xlmAmount * Math.pow(10, 7)))
        : BigInt(Math.floor(liquidityData.xlmAmount * Math.pow(10, 6)));

      const addLiqTx = await pool.add_liquidity({
        caller: address,
        amount_a: tokenAmountRaw,
        amount_b: secondTokenAmount,
      });

      const { result } = await addLiqTx.signAndSend();
      console.log("Liquidity added:", result);

      setLiquiditySteps((prev) =>
        prev.map((step) =>
          step.id === "add-liquidity" ? { ...step, status: "completed" } : step,
        ),
      );

      setTransactionStatus("Liquidity added successfully!");

      // Move to completion after 2 seconds
      setTimeout(() => {
        setCurrentStep(4);
        setShowLiquidityModal(false);
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
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
            Launch Your Token
          </h1>
          <p className="text-gray-400 text-lg">
            Create your token, set up a pool, and add liquidity in a few simple
            steps
          </p>
          {!address && (
            <p className="text-yellow-400 text-sm mt-2">
              ⚠️ Please connect your wallet to continue
            </p>
          )}
        </div>

        {/* Transaction Status */}
        {transactionStatus && (
          <div
            className={`mb-4 p-4 rounded-lg ${
              transactionStatus.includes("Error") ||
              transactionStatus.includes("Please")
                ? "bg-red-900/20 border border-red-500/30 text-red-400"
                : transactionStatus.includes("successfully")
                  ? "bg-green-900/20 border border-green-500/30 text-green-400"
                  : "bg-blue-900/20 border border-blue-500/30 text-blue-400"
            }`}
          >
            <p className="text-center">{transactionStatus}</p>
          </div>
        )}

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    currentStep >= step ? "bg-green-500" : "bg-gray-700"
                  }`}
                >
                  {step}
                </div>
                <span className="text-sm mt-2">
                  {step === 1
                    ? "Token Details"
                    : step === 2
                      ? "Create Pool"
                      : step === 3
                        ? "Add Liquidity"
                        : "Complete"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Token Details */}
        {currentStep === 1 && (
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Rocket className="mr-2 h-5 w-5 text-green-500" />
                Token Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Token Image */}
              <div>
                <Label htmlFor="image">
                  Token Image <span className="text-red-400">*</span>
                </Label>
                <div className="mt-2 flex items-center gap-4">
                  <div className="w-20 h-20 rounded-full bg-gray-800 border-2 border-dashed border-gray-600 flex items-center justify-center overflow-hidden">
                    {imagePreview ? (
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Upload className="h-8 w-8 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <Input
                      id="image"
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="bg-gray-800 border-gray-700"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      PNG, JPG, GIF, or WebP (max 10MB)
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Token Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., PepeCoin"
                    value={tokenData.name}
                    onChange={(e) =>
                      setTokenData({ ...tokenData, name: e.target.value })
                    }
                    className="bg-gray-800 border-gray-700"
                  />
                </div>
                <div>
                  <Label htmlFor="symbol">Token Symbol</Label>
                  <Input
                    id="symbol"
                    placeholder="e.g., PEPE"
                    value={tokenData.symbol}
                    onChange={(e) =>
                      setTokenData({ ...tokenData, symbol: e.target.value })
                    }
                    className="bg-gray-800 border-gray-700"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe your token..."
                  value={tokenData.description}
                  onChange={(e) =>
                    setTokenData({ ...tokenData, description: e.target.value })
                  }
                  className="bg-gray-800 border-gray-700"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="supply">Total Supply</Label>
                <Input
                  id="supply"
                  type="number"
                  placeholder="1000000"
                  value={tokenData.totalSupply}
                  onChange={(e) =>
                    setTokenData({ ...tokenData, totalSupply: e.target.value })
                  }
                  className="bg-gray-800 border-gray-700"
                />
              </div>

              <div className="space-y-3">
                <Label>Social Links (Optional)</Label>
                <Input
                  placeholder="Website URL"
                  value={tokenData.website}
                  onChange={(e) =>
                    setTokenData({ ...tokenData, website: e.target.value })
                  }
                  className="bg-gray-800 border-gray-700"
                />
                <Input
                  placeholder="Twitter URL"
                  value={tokenData.twitter}
                  onChange={(e) =>
                    setTokenData({ ...tokenData, twitter: e.target.value })
                  }
                  className="bg-gray-800 border-gray-700"
                />
                <Input
                  placeholder="Telegram URL"
                  value={tokenData.telegram}
                  onChange={(e) =>
                    setTokenData({ ...tokenData, telegram: e.target.value })
                  }
                  className="bg-gray-800 border-gray-700"
                />
              </div>

              <Button
                onClick={() => void handleLaunchToken()}
                disabled={
                  !address ||
                  isProcessing ||
                  !imageFile ||
                  !tokenData.name ||
                  !tokenData.symbol ||
                  !tokenData.totalSupply
                }
                className="w-full bg-green-500 hover:bg-green-600 text-black font-semibold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : !address ? (
                  "Connect Wallet First"
                ) : !imageFile ? (
                  "Upload Image First"
                ) : (
                  "Launch Token"
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Create Pool */}
        {currentStep === 2 && (
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Droplets className="mr-2 h-5 w-5 text-blue-500" />
                Create Pool
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Pool Type Selection */}
              <div>
                <Label className="flex items-center justify-between mb-2">
                  <span>Pool Type</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-400">
                      Choose the second token for your pool:
                    </span>
                  </div>
                </Label>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() =>
                      setLiquidityData({ ...liquidityData, useXlm: false })
                    }
                    className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                      !liquidityData.useXlm
                        ? "border-green-500 bg-green-500/10 text-green-400"
                        : "border-gray-600 bg-gray-800 text-gray-400 hover:border-gray-500"
                    }`}
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <span className="font-medium">USDC Pool</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setLiquidityData({ ...liquidityData, useXlm: true })
                    }
                    className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                      liquidityData.useXlm
                        ? "border-yellow-500 bg-yellow-500/10 text-yellow-400"
                        : "border-gray-600 bg-gray-800 text-gray-400 hover:border-gray-500"
                    }`}
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <Coins className="w-5 h-5 text-yellow-400" />
                      <span className="font-medium">XLM Pool</span>
                    </div>
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  You're creating a {liquidityData.useXlm ? "XLM" : "USDC"} pool
                  for {tokenData.symbol || "your token"}
                </p>
              </div>

              <div>
                <Label>Slippage Tolerance (%)</Label>
                <Input
                  type="number"
                  value={poolData.slippageTolerance}
                  disabled={true}
                  className="bg-gray-700 border-gray-600 text-gray-300 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Default value: 1%. Protects against price fluctuations during
                  pool creation.
                </p>
              </div>

              <div>
                <Label>Pool Fee (%)</Label>
                <Input
                  type="number"
                  value={poolData.fee}
                  disabled={true}
                  className="bg-gray-700 border-gray-600 text-gray-300 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Default value: 0.3%. Standard AMM fee applied to all swaps.
                </p>
              </div>

              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
                <p className="text-sm text-blue-300">
                  💡 <strong>Ready to proceed?</strong> Creating a{" "}
                  {liquidityData.useXlm ? "XLM" : "USDC"} pool with optimized
                  settings. Pool pair: {tokenData.symbol || "TOKEN"}/
                  {liquidityData.useXlm ? "XLM" : "USDC"}
                </p>
              </div>

              <Button
                onClick={() => void handleCreatePool()}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3"
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  `Create ${liquidityData.useXlm ? "XLM" : "USDC"} Pool`
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Add Liquidity */}
        {currentStep === 3 && (
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Droplets className="mr-2 h-5 w-5 text-blue-500" />
                Add Liquidity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Pool Info */}
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {liquidityData.useXlm ? (
                      <Coins className="w-5 h-5 text-yellow-400" />
                    ) : (
                      <span className="text-sm">💵</span>
                    )}
                    <span className="text-sm font-medium">
                      {tokenData.symbol || "Your Token"}/
                      {liquidityData.useXlm ? "XLM" : "USDC"} Pool
                    </span>
                  </div>
                  <span className="text-xs text-blue-400">Pool Created ✓</span>
                </div>
                <p className="text-xs text-blue-300 mt-1">
                  Pool address:{" "}
                  {poolAddress
                    ? `${poolAddress.slice(0, 8)}...${poolAddress.slice(-8)}`
                    : "Loading..."}
                </p>
              </div>

              {/* Token Amount Input */}
              <div>
                <Label className="flex items-center justify-between mb-2">
                  <span>Token Amount</span>
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
                          {tokenBalance} {tokenData.symbol || "TOKEN"}
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
                  value={liquidityData.tokenAmount}
                  onChange={(e) =>
                    setLiquidityData({
                      ...liquidityData,
                      tokenAmount: Number(e.target.value),
                    })
                  }
                  className="bg-gray-800 border-gray-700"
                  placeholder="0.00"
                />
              </div>

              {/* Second Token Amount Input */}
              <div>
                <Label className="flex items-center justify-between mb-2">
                  <span>{liquidityData.useXlm ? "XLM" : "USDC"} Amount</span>
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
                            liquidityData.useXlm
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-green-500/20 text-green-400"
                          }`}
                        >
                          {liquidityData.useXlm ? xlmBalance : usdcBalance}{" "}
                          {liquidityData.useXlm ? "XLM" : "USDC"}
                        </span>
                        <button
                          type="button"
                          onClick={() => void fetchBalances()}
                          className={`transition-colors ${
                            liquidityData.useXlm
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
                  value={liquidityData.xlmAmount}
                  onChange={(e) =>
                    setLiquidityData({
                      ...liquidityData,
                      xlmAmount: Number(e.target.value),
                    })
                  }
                  className="bg-gray-800 border-gray-700"
                  placeholder={`Enter ${liquidityData.useXlm ? "XLM" : "USDC"} amount`}
                />
              </div>

              {/* Pool Information */}
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-2">
                  <Droplets className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium text-blue-300">
                    Pool Information
                  </span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Token Pair:</span>
                    <span className="text-white">
                      {tokenData.symbol || "TOKEN"} /{" "}
                      {liquidityData.useXlm ? "XLM" : "USDC"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Pool Type:</span>
                    <span
                      className={`font-medium ${
                        liquidityData.useXlm
                          ? "text-yellow-400"
                          : "text-green-400"
                      }`}
                    >
                      {liquidityData.useXlm
                        ? "Native XLM Pool"
                        : "Standard Pool"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Your Token Amount:</span>
                    <span className="text-white">
                      {liquidityData.tokenAmount || 0}{" "}
                      {tokenData.symbol || "TOKEN"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">
                      {liquidityData.useXlm ? "XLM" : "USDC"} Amount:
                    </span>
                    <span className="text-white">
                      {liquidityData.xlmAmount || 0}{" "}
                      {liquidityData.useXlm ? "XLM" : "USDC"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Error Display */}
              {liquidityError && (
                <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                  {liquidityError}
                </div>
              )}

              {/* Add Liquidity Button */}
              <Button
                onClick={() => void handleAddLiquidity()}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3"
                disabled={
                  isProcessing ||
                  !liquidityData.tokenAmount ||
                  !liquidityData.xlmAmount
                }
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  `Add Liquidity with ${liquidityData.useXlm ? "XLM" : "USDC"}`
                )}
              </Button>

              {/* Skip Option */}
              <Button
                onClick={() => setCurrentStep(4)}
                variant="outline"
                className="w-full border-gray-600 text-gray-400 hover:bg-gray-800"
              >
                Skip & Complete Later
              </Button>
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
                          <CheckCircle className="w-4 h-4 text-white" />
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
                    <Button
                      onClick={() => setShowLiquidityModal(false)}
                      className="w-full mt-4 bg-green-500 hover:bg-green-600"
                    >
                      Continue
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 4: Complete */}
        {currentStep === 4 && (
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle className="mr-2 h-5 w-5 text-green-500" />
                Launch Complete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <h3 className="text-xl font-bold mb-2">Congratulations!</h3>
                <p className="text-gray-400">
                  Your token has been launched successfully with a liquidity
                  pool.
                </p>
              </div>

              <div className="bg-gray-800 p-4 rounded-lg space-y-3">
                <h4 className="font-semibold mb-3">Token Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Name:</span>
                    <span>{tokenData.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Symbol:</span>
                    <span>{tokenData.symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total Supply:</span>
                    <span>{tokenData.totalSupply}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Pool Type:</span>
                    <span>{liquidityData.useXlm ? "XLM" : "USDC"} Pool</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 p-4 rounded-lg space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Token Address:</span>
                  <span className="font-mono">
                    {tokenAddress
                      ? `${tokenAddress.slice(0, 8)}...${tokenAddress.slice(-8)}`
                      : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Pool Address:</span>
                  <span className="font-mono">
                    {poolAddress
                      ? `${poolAddress.slice(0, 8)}...${poolAddress.slice(-8)}`
                      : "N/A"}
                  </span>
                </div>
              </div>

              <Button
                onClick={() => (window.location.href = "/")}
                className="w-full bg-green-500 hover:bg-green-600 text-black font-semibold py-3"
              >
                Return to Home
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
