"use client";

import { useEffect, useState } from "react";

export default function Wallet() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBalance();
  }, []);

  const fetchBalance = async () => {
    try {
      const response = await fetch("/api/coins/balance");
      if (response.ok) {
        const data = await response.json();
        setBalance(data.balance);
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-lg shadow-lg p-6 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm opacity-90">Your Balance</p>
          <h2 className="text-4xl font-bold mt-1">
            {loading ? "..." : balance !== null ? balance : "Error"}
          </h2>
          <p className="text-sm mt-1">coins</p>
        </div>
        <div className="text-6xl">💰</div>
      </div>
    </div>
  );
}
