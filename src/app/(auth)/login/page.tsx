"use client";

import Image from "next/image";
import Link from "next/link";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { getLandingPage } from "@/lib/role-permissions";
import { AuthBackdrop, SunMark } from "@/components/layout/AuthBackdrop";

/**
 * Pick the post-sign-in destination. Service-scoped roles (staff / member /
 * coordinator) with an assigned `serviceId` land directly on their service's
 * detail page — tablets at the centre kiosk shouldn't go via /dashboard.
 * EOS-only roles land on /rocks (their primary surface). Other org-wide
 * roles land on /dashboard.
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
    (role === "staff" || role === "member") &&
    !!serviceId;

  if (serviceScoped) return `/services/${serviceId}?tab=today`;
  // EOS roles → /rocks; everyone else → /dashboard.
  return getLandingPage(role);
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
      // 2026-07-08: don't mask the real error — a rate-limited login
      // was showing as "Invalid email or password", which made users
      // think their password was wrong when it was actually the
      // 5-attempts-per-15-min throttle. NextAuth surfaces our thrown
      // Error.message through result.error; when it falls back to the
      // default "CredentialsSignin" code we still show a friendly
      // generic message.
      const msg =
        result.error === "CredentialsSignin"
          ? "Invalid email or password"
          : result.error;
      setError(msg);
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
    <AuthBackdrop>
      <div className="relative z-10 w-full max-w-md mx-4 animate-scale-in">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4 animate-slide-up">
            <Image src="/logo-full-white.svg" alt="Amana OSHC" width={200} height={100} priority />
          </div>
          <h1
            className="text-4xl font-heading font-bold text-white tracking-tight animate-slide-up stagger-2"
            style={{ textShadow: "0 2px 12px rgba(0,0,0,0.3)" }}
          >
            Amana OSHC
          </h1>
          <div className="mt-3 flex items-center justify-center gap-3 animate-slide-up stagger-4">
            <span aria-hidden className="h-px w-10 bg-white/20" />
            <SunMark className="w-7 text-accent" />
            <span aria-hidden className="h-px w-10 bg-white/20" />
          </div>
          <p className="text-white/70 mt-3 text-base tracking-wide animate-slide-up stagger-5">
            Management Dashboard
          </p>
        </div>

        {/* Login Card. Cream rather than pure white so it sits in the warm
            light rising off the horizon, with a single accent rule along the
            top edge — the one place the identity yellow is structural. */}
        <div className="relative bg-cream-soft/95 backdrop-blur-xl rounded-[var(--radius-xl)] shadow-warm-lg p-8 sm:p-10 border border-white/60 overflow-hidden">
          <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-accent" />
          <h2 className="text-xl font-heading font-semibold text-foreground mb-6">
            Sign in to your account
          </h2>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200/60 text-red-600 dark:text-red-400 text-sm">
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
                className="w-full px-4 py-3 border-2 border-border/80 rounded-xl bg-surface/30 text-base text-foreground placeholder-muted focus:outline-none focus:border-brand focus:ring-0 transition-colors duration-200"
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
                className="w-full px-4 py-3 border-2 border-border/80 rounded-xl bg-surface/30 text-base text-foreground placeholder-muted focus:outline-none focus:border-brand focus:ring-0 transition-colors duration-200"
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

        <p className="text-center text-white/55 font-heading tracking-wider uppercase text-2xs mt-6">
          Amana OSHC Leadership Team Portal
        </p>
      </div>
    </AuthBackdrop>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
