"use client";

import Image from "next/image";
import Link from "next/link";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

/**
 * Pick the post-sign-in destination. Service-scoped roles (staff / member /
 * coordinator) with an assigned `serviceId` land directly on their service's
 * detail page — tablets at the centre kiosk shouldn't go via /dashboard.
 * Org-wide roles continue to land on /dashboard.
 *
 * Honours an explicit `callbackUrl` in the URL query — forgot-password
 * redirects + bookmarked links should still work.
 */
export function destinationForSession(
  session: {
    user?: { role?: string; serviceId?: string | null };
  } | null,
  callbackUrl: string,
): string {
  // Explicit callback wins, unless it's the generic /dashboard default.
  if (callbackUrl && callbackUrl !== "/dashboard") return callbackUrl;

  const role = session?.user?.role;
  const serviceId = session?.user?.serviceId;
  const serviceScoped =
    (role === "staff" || role === "member" || role === "coordinator") &&
    !!serviceId;

  if (serviceScoped) return `/services/${serviceId}?tab=today`;
  return "/dashboard";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Set remember-me cookie before auth so JWT callback can read it
    document.cookie = `remember-me=${rememberMe}; path=/; max-age=60; SameSite=Lax`;

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    if (result?.error) {
      setError("Invalid email or password");
      setLoading(false);
    } else {
      // Fetch the fresh session so we can route service-scoped roles directly
      // to their centre page. `getSession()` forces a JWT decode + /api/auth/session
      // round-trip, so the role + serviceId claims are available.
      const session = await getSession();
      router.push(destinationForSession(session, callbackUrl));
      router.refresh();
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-[#001824] via-[#003344] to-[#0A5E7E] overflow-hidden">
      {/* Animated floating background shapes */}
      <div
        className="absolute top-[-10%] left-[-5%] w-96 h-96 rounded-full bg-accent/10 blur-3xl"
        style={{ animation: "float 6s ease-in-out infinite" }}
      />
      <div
        className="absolute bottom-[-8%] right-[-5%] w-64 h-64 rounded-full bg-brand-light/15 blur-2xl"
        style={{ animation: "float 8s ease-in-out infinite 1s" }}
      />
      <div
        className="absolute top-[20%] right-[10%] w-48 h-48 rounded-full bg-accent/[0.08] blur-xl"
        style={{ animation: "float 7s ease-in-out infinite 2s" }}
      />
      <div
        className="absolute bottom-[25%] left-[8%] w-36 h-36 rounded-full bg-brand-light/10 blur-2xl"
        style={{ animation: "float 9s ease-in-out infinite 0.5s" }}
      />

      <div
        className="relative z-10 w-full max-w-md mx-4"
        style={{ animation: "scale-in 0.6s ease-out both" }}
      >
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center mb-4"
            style={{ animation: "fade-in-up 0.5s ease-out both" }}
          >
            <Image src="/logo-full-white.svg" alt="Amana OSHC" width={200} height={100} priority />
          </div>
          <h1
            className="text-4xl font-heading font-bold text-white tracking-tight"
            style={{
              textShadow: "0 2px 12px rgba(0,0,0,0.3)",
              animation: "fade-in-up 0.5s ease-out 0.1s both",
            }}
          >
            Amana OSHC
          </h1>
          <p
            className="text-white/50 mt-2 text-base tracking-wide"
            style={{ animation: "fade-in-up 0.5s ease-out 0.25s both" }}
          >
            EOS Management Dashboard
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-card/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 sm:p-10 border border-white/50">
          <h2 className="text-xl font-heading font-semibold text-foreground mb-6">
            Sign in to your account
          </h2>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200/60 text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block font-heading text-sm font-semibold text-foreground/80 tracking-wide mb-1.5"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border-2 border-border/80 rounded-xl bg-surface/30 text-base text-foreground placeholder-gray-400 focus:outline-none focus:border-brand focus:ring-0 transition-colors duration-200"
                placeholder="you@amanaoshc.com.au"
                autoComplete="email"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block font-heading text-sm font-semibold text-foreground/80 tracking-wide mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border-2 border-border/80 rounded-xl bg-surface/30 text-base text-foreground placeholder-gray-400 focus:outline-none focus:border-brand focus:ring-0 transition-colors duration-200"
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-5 w-5 text-brand border-border rounded-md focus:ring-brand cursor-pointer"
                />
                <label
                  htmlFor="remember-me"
                  className="ml-2 text-sm text-muted cursor-pointer select-none"
                >
                  Keep me signed in
                </label>
              </div>
              <Link
                href="/forgot-password"
                className="text-sm text-brand hover:text-brand-light font-semibold transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-brand to-brand-light hover:from-brand-hover hover:to-brand text-white text-base font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4 text-accent"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-white/30 font-heading tracking-wider uppercase text-[11px] mt-6">
          Amana OSHC Leadership Team Portal
        </p>
      </div>

      {/* Keyframe animations */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-20px) scale(1.05); }
        }
        @keyframes scale-in {
          0% { opacity: 0; transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
