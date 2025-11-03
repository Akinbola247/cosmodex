import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, TrendingUp, TrendingDown, Flame, Clock, Zap, BarChart3, Loader2, RefreshCw } from "lucide-react";
import { NavLink } from "react-router-dom";
import tokenfactory from "@/contracts/tokenfactory";
import poolfactory from "@/contracts/poolfactory";
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
}

export default function Home() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTab, setFilterTab] = useState("all");
  const [tokens, setTokens] = useState<DisplayToken[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);

  // Fetch token metadata from IPFS
  const fetchMetadataFromIPFS = async (ipfsUrl: string): Promise<TokenMetadata | null> => {
    try {
      const response = await fetch(ipfsUrl);
      if (!response.ok) return null;
      const metadata = await response.json() as TokenMetadata;
      return metadata;
    } catch (error) {
      console.error("Error fetching metadata:", error);
      return null;
    }
  };

  // Fetch pool for a token
  const fetchPoolForToken = async (tokenAddress: string): Promise<string | null> => {
    try {
      // Try USDC pool first
      const usdcPoolTx = await poolfactory.get_pool({
        token_a: CONTRACT_ADDRESSES.USDTToken,
        token_b: tokenAddress,
      });
      
      // get_pool is read-only, check simulation result
      const usdcPool = usdcPoolTx.result;
      if (usdcPool && usdcPool !== null) {
        console.log(`    Found USDC pool: ${usdcPool}`);
        return usdcPool;
      }

      // Try reverse order
      const reversePoolTx = await poolfactory.get_pool({
        token_a: tokenAddress,
        token_b: CONTRACT_ADDRESSES.USDTToken,
      });
      
      const reversePool = reversePoolTx.result;
      if (reversePool && reversePool !== null) {
        console.log(`    Found USDC pool (reverse): ${reversePool}`);
        return reversePool;
      }

      // Try XLM pool
      const xlmPoolTx = await poolfactory.get_pool({
        token_a: CONTRACT_ADDRESSES.NativeXLM,
        token_b: tokenAddress,
      });
      
      const xlmPool = xlmPoolTx.result;
      if (xlmPool && xlmPool !== null) {
        console.log(`    Found XLM pool: ${xlmPool}`);
        return xlmPool;
      }

      // Try XLM reverse
      const xlmReversePoolTx = await poolfactory.get_pool({
        token_a: tokenAddress,
        token_b: CONTRACT_ADDRESSES.NativeXLM,
      });
      
      const xlmReversePool = xlmReversePoolTx.result;
      if (xlmReversePool && xlmReversePool !== null) {
        console.log(`    Found XLM pool (reverse): ${xlmReversePool}`);
        return xlmReversePool;
      }

      console.log(`    No pool found for token`);
      return null;
    } catch (error) {
      console.error("    Error fetching pool for token:", error);
      return null;
    }
  };

  // Fetch token metadata and pool data
  const fetchTokenData = async (tokenAddress: string): Promise<DisplayToken | null> => {
    try {
      console.log(`Fetching data for token: ${tokenAddress}`);
      
      // Get metadata URL from tokenfactory
      const metadataTx = await tokenfactory.get_token_metadata({
        token_addr: tokenAddress,
      });
      
      // Read-only function, check simulation result first
      let ipfsUrl = "";
      if (metadataTx.result) {
        ipfsUrl = metadataTx.result;
        console.log(`  IPFS URL from simulation: ${ipfsUrl}`);
      } else {
        const signedResult = await metadataTx.signAndSend();
        ipfsUrl = signedResult.result;
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

      // Get pool if exists
      console.log(`  Checking for pools...`);
      const poolAddress = await fetchPoolForToken(tokenAddress);
      console.log(`  Pool: ${poolAddress || "none"}`);

      const tokenData = {
        id: tokenAddress,
        name: metadata.name,
        symbol: metadata.symbol,
        image: metadata.image,
        price: "$0.00",
        change: "+0.0%",
        marketCap: "$0",
        volume: "$0",
        liquidity: poolAddress ? "$100" : "$0",
        trending: false,
        contractAddress: tokenAddress,
        poolAddress: poolAddress || undefined,
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
        tokenAddresses = tokensTx.result;
        console.log("Got tokens from simulation:", tokenAddresses);
      } else {
        // Try signing if needed
        const signedResult = await tokensTx.signAndSend();
        console.log("Signed result:", signedResult);
        
        if (signedResult && typeof signedResult === "object" && "result" in signedResult) {
          tokenAddresses = signedResult.result;
        } else if (Array.isArray(signedResult)) {
          tokenAddresses = signedResult;
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

      // Filter out null results
      const validTokens = tokenResults.filter((t: DisplayToken | null): t is DisplayToken => t !== null);
      setTokens(validTokens);

      console.log("=== Tokens Loaded Successfully ===");
      console.log("Valid tokens:", validTokens.length);
      console.log("Tokens:", validTokens);
    } catch (error) {
      console.error("=== Error Fetching Tokens ===");
      console.error("Error:", error);
      console.error("Error message:", error instanceof Error ? error.message : String(error));
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
      token.symbol.toLowerCase().includes(searchTerm.toLowerCase())
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
            The ultimate platform for launching, trading, and managing tokens on Stellar
          </p>
        </div>

        {/* Stats Bar */}
        <div className="flex flex-wrap items-center justify-between mb-6 p-4 bg-gray-900/50 border border-gray-800 rounded-lg gap-4">
          <div className="flex flex-wrap items-center gap-6 text-sm text-gray-400">
            <span className="flex items-center">
              <span className="text-green-500 font-semibold">
                {isLoadingTokens ? <Loader2 className="h-4 w-4 animate-spin" /> : tokens.length}
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
              <RefreshCw className={`h-4 w-4 ${isLoadingTokens ? 'animate-spin' : ''}`} />
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
                <p className="text-gray-400">Loading tokens from tokenfactory...</p>
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
                          e.currentTarget.src = '/placeholder.svg';
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
                        token.change.startsWith("+") ? "text-green-400" : "text-red-400"
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
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-green-400">
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
                <p className="text-sm mt-2">Be the first to launch a token on CosmoDex!</p>
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
            <h2 className="text-2xl font-bold mb-2">Ready to Launch Your Token?</h2>
            <p className="text-gray-400 mb-4">
              Create your own token, set up liquidity pools, and start trading in minutes
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
