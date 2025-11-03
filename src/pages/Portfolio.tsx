import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Wallet } from "lucide-react";

export default function Portfolio() {
  return (
    <div className="min-h-screen bg-gray-950 text-white py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
            Portfolio
          </h1>
          <p className="text-gray-400 text-lg">Track your token holdings and performance</p>
        </div>

        <div className="grid gap-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-400 mb-1">Total Value</div>
                <div className="text-2xl font-bold">$0.00</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-400 mb-1">24h Change</div>
                <div className="text-2xl font-bold text-green-400">+0.00%</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-400 mb-1">Total Tokens</div>
                <div className="text-2xl font-bold">0</div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Wallet className="mr-2 h-5 w-5 text-purple-500" />
                Your Holdings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-gray-400">
                <User className="h-16 w-16 mx-auto mb-4 text-gray-600" />
                <p className="text-lg">Connect your wallet to view your portfolio</p>
                <p className="text-sm mt-2">See your token balances, liquidity positions, and more</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

