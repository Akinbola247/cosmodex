import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Wallet, Loader2, RefreshCw, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/useWallet";
import tokenfactory from "@/contracts/tokenfactory";
import token from "@/contracts/token";
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

// Interface for portfolio token data
interface PortfolioToken {
  symbol: string;
  name: string;
  image: string;
  contractAddress: string;
  balance: string;
  decimals: number;
  balanceRaw: bigint;
}

export default function Portfolio() {
  const { address } = useWallet();
  const [tokens, setTokens] = useState<PortfolioToken[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch metadata from IPFS
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

  // Fetch token balance
  const fetchTokenBalance = async (tokenAddress: string): Promise<bigint> => {
    if (!address) return BigInt(0);

    try {
      token.options.contractId = tokenAddress;
      token.options.publicKey = address;

      const balanceTx = await token.balance({ id: address });
      const balance = BigInt(balanceTx.result || 0);

      return balance;
    } catch (error) {
      console.error(`Error fetching balance for ${tokenAddress}:`, error);
      return BigInt(0);
    }
  };

  // Fetch all tokens with balances
  const fetchAllTokens = async () => {
    if (!address) {
      setTokens([]);
      return;
    }

    try {
      setIsLoading(true);
      console.log("=== Fetching Portfolio Tokens ===");

      // Get all deployed tokens
      const tokensTx = await tokenfactory.get_all_deployed_tokens();

      let tokenAddresses: string[] = [];
      if (tokensTx.result) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        tokenAddresses = tokensTx.result as string[];
      }

      console.log("Token addresses:", tokenAddresses);

      // Add USDT token
      const usdtToken: PortfolioToken = {
        symbol: "USDT",
        name: "USD Tether",
        image: "/placeholder.svg",
        contractAddress: CONTRACT_ADDRESSES.USDTToken,
        balance: "0",
        decimals: 6,
        balanceRaw: BigInt(0),
      };

      // Fetch metadata and balances for all tokens in parallel
      const tokenPromises = tokenAddresses.map(async (tokenAddr) => {
        try {
          // Get metadata
          const metadataTx = await tokenfactory.get_token_metadata({
            token_addr: tokenAddr,
          });
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          const ipfsUrl = metadataTx.result as string;

          if (!ipfsUrl) return null;

          const metadata = await fetchMetadataFromIPFS(ipfsUrl);
          if (!metadata) return null;

          // Get balance
          const balanceRaw = await fetchTokenBalance(tokenAddr);
          const balance =
            Number(balanceRaw) / Math.pow(10, metadata.attributes.decimals);

          return {
            symbol: metadata.symbol,
            name: metadata.name,
            image: metadata.image,
            contractAddress: tokenAddr,
            balance: balance.toFixed(6),
            decimals: metadata.attributes.decimals,
            balanceRaw,
          };
        } catch (error) {
          console.error(`Error fetching token ${tokenAddr}:`, error);
          return null;
        }
      });

      const tokenResults = await Promise.all(tokenPromises);
      const validTokens = tokenResults.filter(
        (t): t is PortfolioToken => t !== null,
      );

      // Fetch USDT balance
      const usdtBalance = await fetchTokenBalance(CONTRACT_ADDRESSES.USDTToken);
      usdtToken.balanceRaw = usdtBalance;
      usdtToken.balance = (Number(usdtBalance) / Math.pow(10, 6)).toFixed(6);

      // Combine all tokens
      const allTokens = [usdtToken, ...validTokens];

      // Filter out tokens with zero balance (keep at least USDT)
      const tokensWithBalance = allTokens.filter(
        (t) => t.symbol === "USDT" || t.balanceRaw > BigInt(0),
      );

      setTokens(tokensWithBalance);

      console.log("Portfolio loaded:", tokensWithBalance.length, "tokens");
    } catch (error) {
      console.error("Error fetching portfolio:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch tokens when wallet connects
  useEffect(() => {
    void fetchAllTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  return (
    <div className="min-h-screen bg-gray-950 text-white py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
            Portfolio
          </h1>
          <p className="text-gray-400 text-lg">
            Track your token holdings and performance
          </p>
        </div>

        <div className="grid gap-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-400 mb-1">Total Tokens</div>
                <div className="text-2xl font-bold">{tokens.length}</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-400 mb-1">
                  Tokens with Balance
                </div>
                <div className="text-2xl font-bold text-green-400">
                  {tokens.filter((t) => t.balanceRaw > BigInt(0)).length}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-400 mb-1">
                  Wallet Connected
                </div>
                <div className="text-xl font-bold">
                  {address ? "✓ Yes" : "✗ No"}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <Wallet className="mr-2 h-5 w-5 text-purple-500" />
                  Your Holdings
                </div>
                {address && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void fetchAllTokens()}
                    disabled={isLoading}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                    />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!address ? (
                <div className="text-center py-12 text-gray-400">
                  <User className="h-16 w-16 mx-auto mb-4 text-gray-600" />
                  <p className="text-lg">
                    Connect your wallet to view your portfolio
                  </p>
                  <p className="text-sm mt-2">
                    See your token balances and holdings
                  </p>
                </div>
              ) : isLoading ? (
                <div className="text-center py-12">
                  <Loader2 className="h-12 w-12 mx-auto mb-4 text-purple-500 animate-spin" />
                  <p className="text-gray-400">Loading your tokens...</p>
                </div>
              ) : tokens.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Coins className="h-16 w-16 mx-auto mb-4 text-gray-600" />
                  <p className="text-lg">No tokens found</p>
                  <p className="text-sm mt-2">
                    Visit the Minter page to get test USDT
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-800">
                    <div className="col-span-5">Token</div>
                    <div className="col-span-3 text-right">Balance</div>
                    <div className="col-span-4 text-right">Contract</div>
                  </div>

                  {/* Token Rows */}
                  {tokens.map((tokenData) => (
                    <div
                      key={tokenData.contractAddress}
                      className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-gray-800/50 transition-colors rounded-lg"
                    >
                      {/* Token Info */}
                      <div className="col-span-5 flex items-center space-x-3">
                        {tokenData.image ? (
                          <img
                            src={tokenData.image}
                            alt={tokenData.name}
                            className="w-10 h-10 rounded-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = "/placeholder.svg";
                            }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center">
                            <Coins className="h-5 w-5 text-gray-600" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{tokenData.name}</p>
                          <p className="text-sm text-gray-400">
                            {tokenData.symbol}
                          </p>
                        </div>
                      </div>

                      {/* Balance */}
                      <div className="col-span-3 text-right flex flex-col justify-center">
                        <p className="font-medium">{tokenData.balance}</p>
                        <p className="text-xs text-gray-400">
                          {tokenData.symbol}
                        </p>
                      </div>

                      {/* Contract Address */}
                      <div className="col-span-4 text-right flex flex-col justify-center">
                        <p className="font-mono text-xs text-gray-400">
                          {tokenData.contractAddress.slice(0, 4)}...
                          {tokenData.contractAddress.slice(-4)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
