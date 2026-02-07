import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-4xl">
          <h1 className="text-6xl md:text-8xl font-black mb-6" style={{ color: 'var(--text)' }}>
            <span style={{ color: 'var(--text)' }}>Mini</span>
            <span style={{ color: 'var(--gold)' }}>Games</span>
          </h1>
          <p className="text-xl md:text-2xl mb-8" style={{ color: 'var(--text-muted)' }}>
            Play premium mini-games, earn coins, and compete with friends
          </p>

          <div className="rounded-2xl p-8 mb-8" style={{
            background: 'var(--panel)',
            border: '2px solid var(--border)'
          }}>
            <h2 className="text-3xl font-black mb-4" style={{ color: 'var(--text)' }}>
              Get Started Today
            </h2>
            <p className="mb-6 text-lg" style={{ color: 'var(--text-muted)' }}>
              Sign up now and receive <span className="font-black" style={{ color: 'var(--gold)' }}>100 free coins</span> to play
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/signup"
                className="px-8 py-4 rounded-lg font-bold text-lg transition-all hover:-translate-y-0.5"
                style={{
                  background: 'var(--gold)',
                  color: '#000'
                }}
              >
                Sign Up Free
              </Link>
              <Link
                href="/login"
                className="px-8 py-4 rounded-lg font-bold text-lg transition-all hover:-translate-y-0.5 hover:border-[var(--gold)]"
                style={{
                  background: 'var(--panel2)',
                  border: '2px solid var(--border)',
                  color: 'var(--text)'
                }}
              >
                Login
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <div className="rounded-xl p-6 transition-all" style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)'
            }}>
              <div className="text-5xl mb-3">🎯</div>
              <h3 className="text-xl font-black mb-2" style={{ color: 'var(--text)' }}>Fun Games</h3>
              <p style={{ color: 'var(--text-muted)' }}>
                Play exciting mini-games and test your skills
              </p>
            </div>
            <div className="rounded-xl p-6 transition-all" style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)'
            }}>
              <div className="text-5xl mb-3">💰</div>
              <h3 className="text-xl font-black mb-2" style={{ color: 'var(--text)' }}>Earn Coins</h3>
              <p style={{ color: 'var(--text-muted)' }}>
                Win coins by playing games and completing challenges
              </p>
            </div>
            <div className="rounded-xl p-6 transition-all" style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)'
            }}>
              <div className="text-5xl mb-3">🏆</div>
              <h3 className="text-xl font-black mb-2" style={{ color: 'var(--text)' }}>Compete</h3>
              <p style={{ color: 'var(--text-muted)' }}>
                Challenge friends and climb the leaderboards
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
