"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Signup failed");
      } else {
        router.push("/login?signup=success");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="p-8 rounded-xl w-96" style={{
        background: 'var(--panel)',
        border: '1px solid var(--border)'
      }}>
        <h1 className="text-3xl font-black text-center mb-2" style={{ color: 'var(--text)' }}>
          <span style={{ color: 'var(--text)' }}>Mini</span>
          <span style={{ color: 'var(--gold)' }}>Games</span>
        </h1>
        <p className="text-center mb-6 text-sm font-medium" style={{ color: 'var(--text-dimmed)' }}>
          Create your account
        </p>

        {error && (
          <div className="px-4 py-3 rounded-lg mb-4" style={{
            background: 'var(--panel2)',
            border: '1px solid var(--error)',
            color: 'var(--error)'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block mb-2 text-sm font-bold" style={{ color: 'var(--text-muted)' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg focus:outline-none transition-all"
              style={{
                background: 'var(--panel2)',
                border: '1px solid var(--border)',
                color: 'var(--text)'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--gold)';
                e.currentTarget.style.boxShadow = '0 0 0 1px var(--gold)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
              required
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-bold" style={{ color: 'var(--text-muted)' }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-lg focus:outline-none transition-all"
              style={{
                background: 'var(--panel2)',
                border: '1px solid var(--border)',
                color: 'var(--text)'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--gold)';
                e.currentTarget.style.boxShadow = '0 0 0 1px var(--gold)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
              required
              minLength={3}
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-bold" style={{ color: 'var(--text-muted)' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg focus:outline-none transition-all"
              style={{
                background: 'var(--panel2)',
                border: '1px solid var(--border)',
                color: 'var(--text)'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--gold)';
                e.currentTarget.style.boxShadow = '0 0 0 1px var(--gold)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg font-bold transition-all"
            style={{
              background: loading ? 'var(--border)' : 'var(--gold)',
              color: '#000',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.background = 'var(--gold-hover)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.background = 'var(--gold)';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <p className="text-center mt-6 text-sm" style={{ color: 'var(--text-muted)' }}>
          Already have an account?{" "}
          <Link href="/login" className="font-bold transition-colors" style={{ color: 'var(--gold)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--gold-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--gold)'}
          >
            Login
          </Link>
        </p>

        <div className="mt-6 p-4 rounded-lg flex items-center gap-3" style={{
          background: 'var(--panel2)',
          border: '1px solid var(--gold)'
        }}>
          <span className="text-2xl">🪙</span>
          <p className="text-sm font-bold" style={{ color: 'var(--gold)' }}>
            New users get 100 free coins!
          </p>
        </div>
      </div>
    </div>
  );
}
