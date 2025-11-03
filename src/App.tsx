import "./App.module.css";
import { Routes, Route, Outlet } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import Home from "./pages/Home";
import Debugger from "./pages/Debugger.tsx";
import Launch from "./pages/Launch";
import Swap from "./pages/Swap";
import Liquidity from "./pages/Liquidity";
import Portfolio from "./pages/Portfolio";
import Analytics from "./pages/Analytics";
import Minter from "./pages/Minter";

const AppLayout: React.FC = () => (
  <div className="min-h-screen bg-gray-950 text-white">
    <Navbar />
    <Outlet />
  </div>
);

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/launch" element={<Launch />} />
        <Route path="/swap" element={<Swap />} />
        <Route path="/liquidity" element={<Liquidity />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/minter" element={<Minter />} />
        <Route path="/debug" element={<Debugger />} />
        <Route path="/debug/:contractName" element={<Debugger />} />
      </Route>
    </Routes>
  );
}

export default App;
