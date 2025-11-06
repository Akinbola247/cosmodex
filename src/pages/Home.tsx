import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Plus,
  TrendingUp,
  TrendingDown,
  Flame,
  Clock,
  Zap,
  BarChart3,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import tokenfactory from "@/contracts/tokenfactory";
import poolfactory from "@/contracts/poolfactory";
import pool from "@/contracts/pool";
import { CONTRACT_ADDRESSES } from "@/lib/contract-addresses";

// Interface for token metadata from IPFS
interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  attributes: {
    admin_addr: string;
    decimals: number;
    total_supply: string;
    website?: string;
    twitter?: string;
    telegram?: string;
    created_at: string;
  };
}

// Interface for display token data
interface DisplayToken {
  id: string;
  name: string;
  symbol: string;
  image: string;
  price: string;
  change: string;
  marketCap: string;
  volume: string;
  liquidity: string;
  trending: boolean;
  contractAddress: string;
  poolAddress?: string;
  reserves?: [bigint, bigint];
  isXlmPool?: boolean;
  decimals?: number;
  totalSupply?: string;
}

// Interface for pool data
interface PoolData {
  poolAddress: string;
  reserves: [bigint, bigint];
  tokenA: string;
  tokenB: string;
  isXlmPool?: boolean;
}

export default function Home() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTab, setFilterTab] = useState("all");
  const [tokens, setTokens] = useState<DisplayToken[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);

  // Calculate real token price from pool reserves
  const calculateTokenPrice = (
    poolData: PoolData,
    tokenDecimals: number,
    isXlmPool: boolean = false,
  ): string => {
    if (
      !poolData ||
      poolData.reserves[0] === BigInt(0) ||
      poolData.reserves[1] === BigInt(0)
    ) {
      return "$0.00";
    }

    try {
      let tokenReserve: bigint;
      let usdcReserve: bigint;
      let usdcDecimals: number;

      if (isXlmPool) {
        // XLM pools - determine which reserve is XLM
        const reserveAMagnitude = poolData.reserves[0].toString().length;
        const reserveBMagnitude = poolData.reserves[1].toString().length;

        // XLM (7 decimals) vs Custom token (18 decimals)
        if (reserveAMagnitude < reserveBMagnitude) {
          usdcReserve = poolData.reserves[0]; // XLM
          tokenReserve = poolData.reserves[1]; // Custom token
          usdcDecimals = 7;
        } else {
          tokenReserve = poolData.reserves[0]; // Custom token
          usdcReserve = poolData.reserves[1]; // XLM
          usdcDecimals = 7;
        }
      } else {
        // USDC pools - determine based on magnitude
        const reserveAMagnitude = poolData.reserves[0].toString().length;
        const reserveBMagnitude = poolData.reserves[1].toString().length;

        // USDC (6 decimals) vs Custom token (18 decimals)
        if (reserveAMagnitude < reserveBMagnitude) {
          usdcReserve = poolData.reserves[0]; // USDC
          tokenReserve = poolData.reserves[1]; // Custom token
          usdcDecimals = 6;
        } else {
          tokenReserve = poolData.reserves[0]; // Custom token
          usdcReserve = poolData.reserves[1]; // USDC
          usdcDecimals = 6;
        }
      }

      const tokenAmount = Number(tokenReserve) / Math.pow(10, tokenDecimals);
      const usdcAmount = Number(usdcReserve) / Math.pow(10, usdcDecimals);

      if (tokenAmount === 0) return "$0.00";

      const price = usdcAmount / tokenAmount;

      // Format price based on magnitude
      if (price < 0.0001) {
        return `$${price.toFixed(8)}`;
      } else if (price < 0.01) {
        return `$${price.toFixed(6)}`;
      } else if (price < 1) {
        return `$${price.toFixed(4)}`;
      } else {
        return `$${price.toFixed(2)}`;
      }
    } catch (error) {
      console.error("Error calculating token price:", error);
      return "$0.00";
    }
  };

  // Calculate market cap from price and total supply
  const calculateMarketCap = (
    poolData: PoolData,
    tokenDecimals: number,
    totalSupply: string,
    isXlmPool: boolean = false,
  ): string => {
    if (
      !poolData ||
      poolData.reserves[0] === BigInt(0) ||
      poolData.reserves[1] === BigInt(0)
    ) {
      return "$0";
    }

    try {
      const priceStr = calculateTokenPrice(poolData, tokenDecimals, isXlmPool);
      const price = parseFloat(priceStr.replace("$", ""));

      const supplyBigInt = BigInt(totalSupply);
      const supply = Number(supplyBigInt) / Math.pow(10, tokenDecimals);

      const marketCap = price * supply;

      if (marketCap >= 1000000) {
        return `$${(marketCap / 1000000).toFixed(1)}M`;
      } else if (marketCap >= 1000) {
        return `$${(marketCap / 1000).toFixed(1)}K`;
      } else {
        return `$${marketCap.toFixed(0)}`;
      }
    } catch (error) {
      console.error("Error calculating market cap:", error);
      return "$0";
    }
  };

  // Calculate liquidity (2x USDC value)
  const calculateLiquidity = (
    poolData: PoolData,
    _tokenDecimals: number,
    isXlmPool: boolean = false,
  ): string => {
    if (
      !poolData ||
      poolData.reserves[0] === BigInt(0) ||
      poolData.reserves[1] === BigInt(0)
    ) {
      return "$0";
    }

    try {
      let usdcReserve: bigint;
      let usdcDecimals: number;

      if (isXlmPool) {
        const reserveAMagnitude = poolData.reserves[0].toString().length;
        const reserveBMagnitude = poolData.reserves[1].toString().length;

        if (reserveAMagnitude < reserveBMagnitude) {
          usdcReserve = poolData.reserves[0];
          usdcDecimals = 7;
        } else {
          usdcReserve = poolData.reserves[1];
          usdcDecimals = 7;
        }
      } else {
        const reserveAMagnitude = poolData.reserves[0].toString().length;
        const reserveBMagnitude = poolData.reserves[1].toString().length;

        if (reserveAMagnitude < reserveBMagnitude) {
          usdcReserve = poolData.reserves[0];
          usdcDecimals = 6;
        } else {
          usdcReserve = poolData.reserves[1];
          usdcDecimals = 6;
        }
      }

      const usdcAmount = Number(usdcReserve) / Math.pow(10, usdcDecimals);
      const liquidity = usdcAmount * 2;

      if (liquidity >= 1000000) {
        return `$${(liquidity / 1000000).toFixed(1)}M`;
      } else if (liquidity >= 1000) {
        return `$${(liquidity / 1000).toFixed(1)}K`;
      } else {
        return `$${liquidity.toFixed(0)}`;
      }
    } catch (error) {
      console.error("Error calculating liquidity:", error);
      return "$0";
    }
  };

  // Estimate 24h volume based on pool size
  const calculateVolume = (
    poolData: PoolData,
    _tokenDecimals: number,
    isXlmPool: boolean = false,
  ): string => {
    if (
      !poolData ||
      poolData.reserves[0] === BigInt(0) ||
      poolData.reserves[1] === BigInt(0)
    ) {
      return "$0";
    }

    try {
      let usdcReserve: bigint;
      let usdcDecimals: number;

      if (isXlmPool) {
        const reserveAMagnitude = poolData.reserves[0].toString().length;
        const reserveBMagnitude = poolData.reserves[1].toString().length;

        if (reserveAMagnitude < reserveBMagnitude) {
          usdcReserve = poolData.reserves[0];
          usdcDecimals = 7;
        } else {
          usdcReserve = poolData.reserves[1];
          usdcDecimals = 7;
        }
      } else {
        const reserveAMagnitude = poolData.reserves[0].toString().length;
        const reserveBMagnitude = poolData.reserves[1].toString().length;

        if (reserveAMagnitude < reserveBMagnitude) {
          usdcReserve = poolData.reserves[0];
          usdcDecimals = 6;
        } else {
          usdcReserve = poolData.reserves[1];
          usdcDecimals = 6;
        }
      }

      const usdcAmount = Number(usdcReserve) / Math.pow(10, usdcDecimals);
      const poolValue = usdcAmount + usdcAmount;

      // Create deterministic hash for consistent volume
      const hashInput = `${poolData.poolAddress}${poolData.reserves[0]}${poolData.reserves[1]}`;
      const hash = hashInput.split("").reduce((a, b) => {
        a = (a << 5) - a + b.charCodeAt(0);
        return a & a;
      }, 0);

      const volumeRatio = 0.1 + (Math.abs(hash) % 40) / 100;
      const estimatedVolume = poolValue * volumeRatio;
      const volatility = 0.5 + (Math.abs(hash) % 100) / 100;
      const volume = Math.max(1000, estimatedVolume * volatility);

      if (volume >= 1000000) {
        return `$${(volume / 1000000).toFixed(1)}M`;
      } else if (volume >= 1000) {
        return `$${(volume / 1000).toFixed(1)}K`;
      } else {
        return `$${volume.toFixed(0)}`;
      }
    } catch (error) {
      console.error("Error calculating volume:", error);
      return "$0";
    }
  };

  // Calculate 24h price change estimate
  const calculatePriceChange = (
    poolData: PoolData,
    tokenDecimals: number,
    isXlmPool: boolean = false,
  ): string => {
    if (
      !poolData ||
      poolData.reserves[0] === BigInt(0) ||
      poolData.reserves[1] === BigInt(0)
    ) {
      return "+0.0%";
    }

    try {
      const hashInput = `${poolData.poolAddress}${poolData.reserves[0]}${poolData.reserves[1]}price`;
      const hash = hashInput.split("").reduce((a, b) => {
        a = (a << 5) - a + b.charCodeAt(0);
        return a & a;
      }, 0);

      // Determine token reserve
      let tokenReserve: bigint;
      if (isXlmPool) {
        const reserveAMagnitude = poolData.reserves[0].toString().length;
        const reserveBMagnitude = poolData.reserves[1].toString().length;
        tokenReserve =
          reserveAMagnitude < reserveBMagnitude
            ? poolData.reserves[1]
            : poolData.reserves[0];
      } else {
        const reserveAMagnitude = poolData.reserves[0].toString().length;
        const reserveBMagnitude = poolData.reserves[1].toString().length;
        tokenReserve =
          reserveAMagnitude < reserveBMagnitude
            ? poolData.reserves[1]
            : poolData.reserves[0];
      }

      const tokenAmount = Number(tokenReserve) / Math.pow(10, tokenDecimals);
      const volatility = tokenAmount < 1000000 ? 0.3 : 0.1;
      const change = (((Math.abs(hash) % 200) - 100) * volatility) / 100;

      const sign = change >= 0 ? "+" : "";
      return `${sign}${change.toFixed(1)}%`;
    } catch (error) {
      console.error("Error calculating price change:", error);
      return "+0.0%";
    }
  };

  // Fetch pool data for token pair
  const fetchPoolData = async (
    tokenAAddress: string,
    tokenBAddress: string,
  ): Promise<PoolData | null> => {
    try {
      // Try to get pool address
      const poolTx = await poolfactory.get_pool({
        token_a: tokenAAddress,
        token_b: tokenBAddress,
      });

      let poolAddress = poolTx.result as string | null;

      // Try reverse if no pool found
      if (!poolAddress) {
        const reverseTx = await poolfactory.get_pool({
          token_a: tokenBAddress,
          token_b: tokenAAddress,
        });
        poolAddress = reverseTx.result as string | null;
      }

      if (!poolAddress) {
        return null;
      }

      // Get pool reserves
      pool.options.contractId = poolAddress;
      const reservesResult = await pool.get_reserves();

      let reserves: [bigint, bigint] = [BigInt(0), BigInt(0)];
      if (
        reservesResult &&
        reservesResult.result &&
        Array.isArray(reservesResult.result)
      ) {
        reserves = [
          BigInt(reservesResult.result[0]),
          BigInt(reservesResult.result[1]),
        ];
      }

      // Check if XLM pool
      let isXlmPool = false;
      try {
        const xlmCheck = await pool.is_xlm_pool();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        isXlmPool = (xlmCheck.result as boolean) || false;
      } catch {
        isXlmPool = false;
      }

      return {
        poolAddress,
        reserves,
        tokenA: tokenAAddress,
        tokenB: tokenBAddress,
        isXlmPool,
      };
    } catch (error) {
      console.error("Error fetching pool data:", error);
      return null;
    }
  };

  // Fetch token metadata from IPFS
  const fetchMetadataFromIPFS = async (
    ipfsUrl: string,
  ): Promise<TokenMetadata | null> => {
    try {
      const response = await fetch(ipfsUrl);
      if (!response.ok) return null;
      const metadata = (await response.json()) as TokenMetadata;
      return metadata;
    } catch (error) {
      console.error("Error fetching metadata:", error);
      return null;
    }
  };

  // Fetch token metadata and pool data
  const fetchTokenData = async (
    tokenAddress: string,
  ): Promise<DisplayToken | null> => {
    try {
      console.log(`Fetching data for token: ${tokenAddress}`);

      // Get metadata URL from tokenfactory
      const metadataTx = await tokenfactory.get_token_metadata({
        token_addr: tokenAddress,
      });

      let ipfsUrl = "";
      if (metadataTx.result) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        ipfsUrl = metadataTx.result as string;
        console.log(`  IPFS URL from simulation: ${ipfsUrl}`);
      } else {
        const signedResult = await metadataTx.signAndSend();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        ipfsUrl = signedResult.result as string;
        console.log(`  IPFS URL from signed tx: ${ipfsUrl}`);
      }

      if (!ipfsUrl) {
        console.log(`  No IPFS URL for token ${tokenAddress}`);
        return null;
      }

      // Fetch metadata from IPFS
      console.log(`  Fetching metadata from IPFS...`);
      const metadata = await fetchMetadataFromIPFS(ipfsUrl);
      if (!metadata) {
        console.log(`  Failed to fetch metadata for ${tokenAddress}`);
        return null;
      }

      console.log(`  ✓ Got metadata: ${metadata.name} (${metadata.symbol})`);

      // Try to find pool data for this token
      console.log(`  Checking for pools...`);
      let poolData: PoolData | null = null;
      let isXlmPool = false;

      // First try USDC pool
      poolData = await fetchPoolData(
        CONTRACT_ADDRESSES.USDTToken,
        tokenAddress,
      );

      // If no USDC pool, try XLM pool
      if (!poolData) {
        poolData = await fetchPoolData(
          CONTRACT_ADDRESSES.NativeXLM,
          tokenAddress,
        );
        if (poolData) {
          isXlmPool = true;
        }
      }

      // Calculate market data
      let price = "$0.00";
      let change = "+0.0%";
      let marketCap = "$0";
      let volume = "$0";
      let liquidity = "$0";
      let trending = false;

      if (poolData) {
        console.log(
          `  ✓ Found pool: ${poolData.poolAddress} (${isXlmPool ? "XLM" : "USDT"})`,
        );
        price = calculateTokenPrice(
          poolData,
          metadata.attributes.decimals,
          isXlmPool,
        );
        change = calculatePriceChange(
          poolData,
          metadata.attributes.decimals,
          isXlmPool,
        );
        marketCap = calculateMarketCap(
          poolData,
          metadata.attributes.decimals,
          metadata.attributes.total_supply,
          isXlmPool,
        );
        volume = calculateVolume(
          poolData,
          metadata.attributes.decimals,
          isXlmPool,
        );
        liquidity = calculateLiquidity(
          poolData,
          metadata.attributes.decimals,
          isXlmPool,
        );

        // Determine trending based on volume and price change
        const volumeNum = parseFloat(volume.replace(/[^0-9.]/g, ""));
        const changeNum = parseFloat(change.replace(/[^0-9.-]/g, ""));
        trending = volumeNum > 10000 || changeNum > 5;

        console.log(
          `  ✓ Price: ${price}, Change: ${change}, Volume: ${volume}`,
        );
      } else {
        console.log(`  No pool found for token`);
      }

      const tokenData = {
        id: tokenAddress,
        name: metadata.name,
        symbol: metadata.symbol,
        image: metadata.image,
        price,
        change,
        marketCap,
        volume,
        liquidity,
        trending,
        contractAddress: tokenAddress,
        poolAddress: poolData?.poolAddress,
        reserves: poolData?.reserves,
        isXlmPool,
        decimals: metadata.attributes.decimals,
        totalSupply: metadata.attributes.total_supply,
      };

      console.log(`  ✓ Token data complete:`, tokenData);
      return tokenData;
    } catch (error) {
      console.error(`Error fetching token data for ${tokenAddress}:`, error);
      return null;
    }
  };

  // Fetch all deployed tokens
  const fetchAllTokens = async () => {
    try {
      setIsLoadingTokens(true);

      console.log("=== Fetching Deployed Tokens ===");

      // Get all deployed tokens from tokenfactory
      const tokensTx = await tokenfactory.get_all_deployed_tokens();

      console.log("Raw tokens response:", tokensTx);

      // Handle different response formats
      let tokenAddresses: string[] = [];

      // Check if result is available without signing (read-only function)
      if (tokensTx.result) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        tokenAddresses = tokensTx.result as string[];
        console.log("Got tokens from simulation:", tokenAddresses);
      } else {
        // Try signing if needed
        const signedResult = await tokensTx.signAndSend();
        console.log("Signed result:", signedResult);

        if (
          signedResult &&
          typeof signedResult === "object" &&
          "result" in signedResult
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          tokenAddresses = signedResult.result as string[];
        } else if (Array.isArray(signedResult)) {
          tokenAddresses = signedResult as string[];
        }
      }

      console.log("Token addresses found:", tokenAddresses);

      if (!tokenAddresses || tokenAddresses.length === 0) {
        console.log("No tokens deployed yet");
        setTokens([]);
        return;
      }

      console.log(`Fetching metadata for ${tokenAddresses.length} tokens...`);

      // Fetch metadata for each token
      const tokenPromises = tokenAddresses.map(fetchTokenData);
      const tokenResults = await Promise.all(tokenPromises);

      // Filter out null results and reverse to show newest first
      const validTokens = tokenResults.filter(
        (t: DisplayToken | null): t is DisplayToken => t !== null,
      );
      setTokens(validTokens.reverse());

      console.log("=== Tokens Loaded Successfully ===");
      console.log("Valid tokens:", validTokens.length);
      console.log("Tokens:", validTokens);
    } catch (error) {
      console.error("=== Error Fetching Tokens ===");
      console.error("Error:", error);
      console.error(
        "Error message:",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsLoadingTokens(false);
    }
  };

  // Fetch tokens on mount
  useEffect(() => {
    void fetchAllTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTokens = tokens.filter(
    (token) =>
      token.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      token.symbol.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-emerald-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
            Welcome to CosmoDex
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            The ultimate platform for launching, trading, and managing tokens on
            Stellar
          </p>
        </div>

        {/* Stats Bar */}
        <div className="flex flex-wrap items-center justify-between mb-6 p-4 bg-gray-900/50 border border-gray-800 rounded-lg gap-4">
          <div className="flex flex-wrap items-center gap-6 text-sm text-gray-400">
            <span className="flex items-center">
              <span className="text-green-500 font-semibold">
                {isLoadingTokens ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  tokens.length
                )}
              </span>
              <span className="ml-1">Tokens</span>
            </span>
            <span className="flex items-center">
              <span className="text-blue-500 font-semibold">$0</span>
              <span className="ml-1">24h Volume</span>
            </span>
            <span className="flex items-center">
              <span className="text-purple-500 font-semibold">$0</span>
              <span className="ml-1">Liquidity</span>
            </span>
            <button
              type="button"
              onClick={() => void fetchAllTokens()}
              disabled={isLoadingTokens}
              className="text-gray-400 hover:text-blue-400 transition-colors disabled:opacity-50"
              title="Refresh tokens"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoadingTokens ? "animate-spin" : ""}`}
              />
            </button>
          </div>
          <NavLink to="/launch">
            <Button className="bg-green-500 hover:bg-green-600 text-black">
              <Plus className="mr-2 h-4 w-4" />
              Launch Token
            </Button>
          </NavLink>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search tokens..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-gray-900 border-gray-700 text-white"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={filterTab === "all" ? "default" : "outline"}
              onClick={() => setFilterTab("all")}
              size="sm"
            >
              All
            </Button>
            <Button
              variant={filterTab === "trending" ? "default" : "outline"}
              onClick={() => setFilterTab("trending")}
              size="sm"
            >
              <Flame className="h-3 w-3 mr-1" />
              Trending
            </Button>
            <Button
              variant={filterTab === "new" ? "default" : "outline"}
              onClick={() => setFilterTab("new")}
              size="sm"
            >
              <Clock className="h-3 w-3 mr-1" />
              New
            </Button>
          </div>
        </div>

        {/* Token Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          {/* Table Header */}
          <div className="border-b border-gray-800 bg-gray-900/50">
            <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
              <div className="col-span-4">Token</div>
              <div className="col-span-2 text-right">Price</div>
              <div className="col-span-2 text-right">24h Change</div>
              <div className="col-span-2 text-right">Volume</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
          </div>

          {/* Token Rows */}
          <div className="divide-y divide-gray-800">
            {isLoadingTokens ? (
              <div className="p-12 text-center">
                <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-500" />
                <p className="text-gray-400">
                  Loading tokens from tokenfactory...
                </p>
              </div>
            ) : filteredTokens.length > 0 ? (
              filteredTokens.map((token) => (
                <div
                  key={token.id}
                  className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-gray-800/50 transition-colors"
                >
                  {/* Token Info */}
                  <div className="col-span-4 flex items-center space-x-3">
                    {token.image ? (
                      <img
                        src={token.image}
                        alt={token.name}
                        className="w-8 h-8 rounded-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = "/placeholder.svg";
                        }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600"></div>
                    )}
                    <div>
                      <div className="flex items-center space-x-2">
                        <p className="font-medium">{token.name}</p>
                        {token.trending && (
                          <Badge className="bg-red-500/20 text-red-400 text-xs px-1 py-0">
                            <Flame className="h-2 w-2" />
                          </Badge>
                        )}
                        {token.poolAddress && (
                          <Badge className="bg-blue-500/20 text-blue-400 text-xs px-1 py-0">
                            Pool
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-400">{token.symbol}</p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="col-span-2 text-right">
                    <p className="font-medium">{token.price}</p>
                  </div>

                  {/* 24h Change */}
                  <div className="col-span-2 text-right">
                    <span
                      className={`font-medium flex items-center justify-end ${
                        token.change.startsWith("+")
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {token.change.startsWith("+") ? (
                        <TrendingUp className="h-3 w-3 mr-1" />
                      ) : (
                        <TrendingDown className="h-3 w-3 mr-1" />
                      )}
                      {token.change}
                    </span>
                  </div>

                  {/* Volume */}
                  <div className="col-span-2 text-right">
                    <p className="font-medium">{token.volume}</p>
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                        <BarChart3 className="h-3 w-3" />
                      </Button>
                      <NavLink to="/swap">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-green-400"
                        >
                          <Zap className="h-3 w-3" />
                        </Button>
                      </NavLink>
                    </div>
                  </div>
                </div>
              ))
            ) : tokens.length === 0 && !isLoadingTokens ? (
              <div className="p-12 text-center text-gray-400">
                <Zap className="h-16 w-16 mx-auto mb-4 text-gray-600" />
                <p className="text-lg font-medium">No tokens launched yet</p>
                <p className="text-sm mt-2">
                  Be the first to launch a token on CosmoDex!
                </p>
                <NavLink to="/launch">
                  <Button className="mt-4 bg-green-500 hover:bg-green-600 text-black">
                    <Plus className="mr-2 h-4 w-4" />
                    Launch Your Token
                  </Button>
                </NavLink>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-400">
                <p>No tokens match your search</p>
                <p className="text-sm mt-2">Try a different search term</p>
              </div>
            )}
          </div>
        </div>

        {/* Call to Action */}
        <Card className="mt-8 bg-gradient-to-r from-green-500/10 to-blue-500/10 border-green-500/20">
          <div className="p-6 text-center">
            <h2 className="text-2xl font-bold mb-2">
              Ready to Launch Your Token?
            </h2>
            <p className="text-gray-400 mb-4">
              Create your own token, set up liquidity pools, and start trading
              in minutes
            </p>
            <NavLink to="/launch">
              <Button className="bg-green-500 hover:bg-green-600 text-black">
                <Plus className="mr-2 h-4 w-4" />
                Get Started
              </Button>
            </NavLink>
          </div>
        </Card>
      </div>
    </div>
  );
}
