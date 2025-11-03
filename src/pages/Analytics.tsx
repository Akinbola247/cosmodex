import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp } from "lucide-react";

export default function Analytics() {
  return (
    <div className="min-h-screen bg-gray-950 text-white py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">
            Analytics
          </h1>
          <p className="text-gray-400 text-lg">Explore market data and trends</p>
        </div>

        <div className="grid gap-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-400 mb-1">Total Volume</div>
                <div className="text-2xl font-bold">$0</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-400 mb-1">Total Liquidity</div>
                <div className="text-2xl font-bold">$0</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-400 mb-1">Active Tokens</div>
                <div className="text-2xl font-bold">0</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-400 mb-1">Active Pools</div>
                <div className="text-2xl font-bold">0</div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="mr-2 h-5 w-5 text-orange-500" />
                Top Performing Tokens
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-gray-400">
                <BarChart3 className="h-16 w-16 mx-auto mb-4 text-gray-600" />
                <p className="text-lg">No analytics data available</p>
                <p className="text-sm mt-2">Launch tokens to see analytics</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

