"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const verified = searchParams.get("verified");
    const err = searchParams.get("error");
    if (verified === "true") {
      setSuccess("Email verified! You can now log in.");
    } else if (verified === "already") {
      setSuccess("Email already verified. You can log in.");
    } else if (err === "invalid-token") {
      setError("Invalid or expired verification link.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        login,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email/username or password");
      } else {
        router.push("/dashboard");
        router.refresh();
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
          Login to your account
        </p>

        {success && (
          <div className="px-4 py-3 rounded-lg mb-4" style={{
            background: 'var(--panel2)',
            border: '1px solid #22c55e',
            color: '#22c55e'
          }}>
            {success}
          </div>
        )}

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
            <label className="block mb-2 text-sm font-bold" style={{ color: 'var(--text-muted)' }}>Email or Username</label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
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
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="text-center mt-6 text-sm" style={{ color: 'var(--text-muted)' }}>
          Don't have an account?{" "}
          <Link href="/signup" className="font-bold transition-colors" style={{ color: 'var(--gold)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--gold-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--gold)'}
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
