"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import FriendsSidebar from "./FriendsSidebar";

interface User {
  id?: string;
  email?: string | null;
  username?: string;
}

interface DashboardLayoutProps {
  user: User;
}

export default function DashboardLayout({ user }: DashboardLayoutProps) {
  const [activeBalance, setActiveBalance] = useState<"free" | "crypto">("free");
  const [freeBalance, setFreeBalance] = useState<number | null>(null);
  const [cryptoBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchBalance();
  }, []);

  const fetchBalance = async () => {
    try {
      const response = await fetch("/api/coins/balance");
      if (response.ok) {
        const data = await response.json();
        setFreeBalance(data.balance);
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/");
  };

  const games = [
    {
      name: "Slither Battle",
      icon: "🐍",
      url: "/games/slither-battle",
      featured: true,
    },
    {
      name: "Dice",
      icon: "🎲",
      url: "/games/number-guesser",
    },
    {
      name: "Mines",
      icon: "💎",
      url: "#",
    },
    {
      name: "Plinko",
      icon: "🎯",
      url: "#",
    },
    {
      name: "Crash",
      icon: "📈",
      url: "#",
    },
    {
      name: "Roulette",
      icon: "🎰",
      url: "#",
    },
    {
      name: "Blackjack",
      icon: "🃏",
      url: "#",
    },
  ];

  return (
    <div className="min-h-screen text-white" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header className="border-b sticky top-0 z-50" style={{
        background: 'var(--bg-elevated)',
        borderColor: 'var(--border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
      }}>
        <div className="max-w-[1920px] mx-auto px-6 h-20 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <h1 className="text-3xl font-black tracking-tight">
              <span style={{ color: 'var(--text)' }}>Mini</span>
              <span style={{ color: 'var(--gold)' }}>Games</span>
            </h1>
          </div>

          {/* Center - Balance Actions */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3">
            {/* Deposit */}
            <button className="px-4 py-2 rounded-lg font-bold text-sm transition-all" style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              color: 'var(--text)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--panel2)';
              e.currentTarget.style.borderColor = 'var(--border-hover)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--panel)';
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}>
              <div className="flex items-center gap-2">
                <span>💳</span>
                <span>Deposit</span>
              </div>
            </button>

            {/* Balance Display */}
            <div className="px-6 py-3 rounded-lg flex items-center gap-3" style={{
              background: 'var(--panel)',
              border: '1px solid var(--gold)'
            }}>
              <span className="text-2xl">
                {activeBalance === "free" ? "🪙" : "💰"}
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-medium" style={{ color: 'var(--text-dimmed)' }}>
                  Balance
                </span>
                <span className="font-black text-xl" style={{ color: 'var(--gold)' }}>
                  {loading
                    ? "..."
                    : activeBalance === "free"
                    ? freeBalance?.toLocaleString()
                    : cryptoBalance.toFixed(8)}
                </span>
              </div>
            </div>

            {/* Withdraw */}
            <button className="px-4 py-2 rounded-lg font-bold text-sm transition-all" style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              color: 'var(--text)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--panel2)';
              e.currentTarget.style.borderColor = 'var(--border-hover)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--panel)';
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}>
              <div className="flex items-center gap-2">
                <span>💸</span>
                <span>Withdraw</span>
              </div>
            </button>
          </div>

          {/* Right - User */}
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-full flex items-center justify-center font-black text-base" style={{
              background: 'var(--panel)',
              border: '2px solid var(--gold)',
              color: 'var(--gold)'
            }}>
              {(user.username || user.email)?.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={handleLogout}
              className="transition-all"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-72 min-h-[calc(100vh-5rem)] border-r p-6" style={{
          background: 'var(--bg-elevated)',
          borderColor: 'var(--border)'
        }}>
          {/* Balance Type Selector */}
          <div className="mb-8">
            <div className="p-1.5 grid grid-cols-2 gap-1.5 rounded-lg" style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)'
            }}>
              <button
                onClick={() => setActiveBalance("free")}
                className={`py-3 px-3 rounded-md font-bold text-sm transition-all ${
                  activeBalance === "free" ? "" : ""
                }`}
                style={activeBalance === "free" ? {
                  background: 'var(--gold)',
                  color: '#000'
                } : {
                  background: 'transparent',
                  color: 'var(--text-muted)'
                }}
              >
                <div className="text-xl mb-1">🪙</div>
                <div className="text-xs">Free Coins</div>
              </button>
              <button
                onClick={() => setActiveBalance("crypto")}
                className={`py-3 px-3 rounded-md font-bold text-sm transition-all ${
                  activeBalance === "crypto" ? "" : ""
                }`}
                style={activeBalance === "crypto" ? {
                  background: 'var(--gold)',
                  color: '#000'
                } : {
                  background: 'transparent',
                  color: 'var(--text-muted)'
                }}
              >
                <div className="text-xl mb-1">💰</div>
                <div className="text-xs">Crypto</div>
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-2">
            <div className="text-xs font-bold mb-4 px-3 tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
              MENU
            </div>
            <a
              href="/dashboard"
              className="flex items-center gap-3 px-3 py-3 rounded-lg font-bold transition-all"
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                color: 'var(--text)'
              }}
            >
              <span className="text-2xl">🎮</span>
              <span>Games</span>
            </a>
            <a
              href="#"
              className="flex items-center gap-3 px-3 py-3 rounded-lg font-bold transition-all"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--panel)';
                e.currentTarget.style.color = 'var(--text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <span className="text-2xl">💳</span>
              <span>Wallet</span>
            </a>
            <a
              href="#"
              className="flex items-center gap-3 px-3 py-3 rounded-lg font-bold transition-all"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--panel)';
                e.currentTarget.style.color = 'var(--text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <span className="text-2xl">📊</span>
              <span>Statistics</span>
            </a>
            <a
              href="#"
              className="flex items-center gap-3 px-3 py-3 rounded-lg font-bold transition-all"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--panel)';
                e.currentTarget.style.color = 'var(--text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <span className="text-2xl">🏆</span>
              <span>Leaderboard</span>
            </a>
          </nav>

          {/* User Info */}
          <div className="mt-8 p-4 rounded-lg" style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)'
          }}>
            <div className="text-xs font-bold mb-1 tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
              LOGGED IN AS
            </div>
            <div className="font-black truncate" style={{ color: 'var(--text)' }}>
              {user.username || user.email}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8">
          {/* Welcome */}
          <div className="mb-10">
            <h2 className="text-4xl font-black mb-2" style={{ color: 'var(--text)' }}>
              Welcome back, {user.username || "Player"}
            </h2>
            <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
              Choose a game and start playing with your {activeBalance === "free" ? "free coins" : "crypto"}
            </p>
          </div>

          {/* Games Grid */}
          <div>
            <h3 className="text-2xl font-black mb-6" style={{ color: 'var(--text)' }}>
              Games
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {games.map((game) => (
                <a
                  key={game.name}
                  href={game.url}
                  className="group relative rounded-xl p-6 transition-all cursor-pointer"
                  style={{
                    background: 'var(--panel)',
                    border: '1px solid var(--border)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-hover)';
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div className="text-5xl mb-4 transition-transform group-hover:scale-110">
                    {game.icon}
                  </div>
                  <h4 className="font-black text-sm mb-2" style={{ color: 'var(--text)' }}>
                    {game.name}
                  </h4>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }}></div>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Live</span>
                  </div>
                  {game.featured && (
                    <div className="absolute -top-2 -right-2 text-xs font-black px-2 py-1 rounded-full" style={{
                      background: 'var(--gold)',
                      color: '#000'
                    }}>
                      NEW
                    </div>
                  )}
                </a>
              ))}
            </div>
          </div>

          {/* Balance Card */}
          {!loading && (
            <div className="mt-12 rounded-xl p-8 transition-all" style={{
              background: 'var(--panel)',
              border: '2px solid var(--border)'
            }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold mb-2 tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                    YOUR {activeBalance === "free" ? "FREE COINS" : "CRYPTO"} BALANCE
                  </div>
                  <div className="text-5xl font-black" style={{ color: 'var(--gold)' }}>
                    {activeBalance === "free"
                      ? `${freeBalance?.toLocaleString()} coins`
                      : `${cryptoBalance.toFixed(8)} BTC`}
                  </div>
                </div>
                <div className="text-7xl opacity-40">
                  {activeBalance === "free" ? "🪙" : "₿"}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Friends Sidebar */}
        {user.id && <FriendsSidebar userId={user.id} />}
      </div>
    </div>
  );
}
