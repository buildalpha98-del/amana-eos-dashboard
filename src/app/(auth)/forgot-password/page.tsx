"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Something went wrong");
      }

      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
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

        {/* Card */}
        <div className="bg-card/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 sm:p-10 border border-white/50">
          {sent ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-heading font-semibold text-foreground mb-2">
                Check your email
              </h2>
              <p className="text-muted text-sm mb-6 leading-relaxed">
                If an account exists for <strong className="text-foreground/80">{email}</strong>, we&apos;ve sent a password reset link.
                Check your inbox and spam folder.
              </p>
              <Link
                href="/login"
                className="inline-block w-full py-3 px-4 bg-gradient-to-r from-brand to-brand-light hover:from-brand-hover hover:to-brand text-white text-base font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 active:scale-[0.98] text-center"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-heading font-semibold text-foreground mb-2">
                Forgot your password?
              </h2>
              <p className="text-muted text-sm mb-6 leading-relaxed">
                Enter your email address and we&apos;ll send you a link to reset your password.
              </p>

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
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-brand to-brand-light hover:from-brand-hover hover:to-brand text-white text-base font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand"
                >
                  {loading ? (
                    <span className="inline-flex items-center justify-center gap-2">
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
                      Sending...
                    </span>
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </form>

              <p className="text-center text-sm text-muted mt-5">
                <Link href="/login" className="text-brand font-semibold hover:text-brand-light transition-colors">
                  Back to Sign In
                </Link>
              </p>
            </>
          )}
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
