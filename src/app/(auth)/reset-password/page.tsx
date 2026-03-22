"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense, useMemo, useCallback } from "react";

/* ── Password strength calculator ─────────────────────────── */
function getPasswordStrength(pw: string): {
  score: number;
  label: string;
  color: string;
  bgColor: string;
} {
  if (!pw) return { score: 0, label: "", color: "", bgColor: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 2) return { score: 1, label: "Weak", color: "text-red-600", bgColor: "bg-red-500" };
  if (score <= 4) return { score: 2, label: "Fair", color: "text-amber-600", bgColor: "bg-amber-500" };
  if (score <= 5) return { score: 3, label: "Good", color: "text-blue-600", bgColor: "bg-blue-500" };
  return { score: 4, label: "Strong", color: "text-emerald-600", bgColor: "bg-emerald-500" };
}

/* ── Eye icon (show/hide password) ────────────────────────── */
function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

/* ── Spinner ──────────────────────────────────────────────── */
function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* ── Main form ────────────────────────────────────────────── */
function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Validate token on page load
  useEffect(() => {
    if (!token) {
      setValidating(false);
      return;
    }

    fetch(`/api/auth/reset-password?token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        setTokenValid(data.valid === true);
        if (!data.valid) setTokenError(data.error || "Invalid reset link");
      })
      .catch(() => setTokenError("Failed to validate reset link"))
      .finally(() => setValidating(false));
  }, [token]);

  // Auto-redirect to login after successful reset
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => {
      router.push("/login");
    }, 3000);
    return () => clearTimeout(timer);
  }, [success, router]);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const rules = useMemo(() => [
    { label: "12+ characters", met: password.length >= 12 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
    { label: "Special character", met: /[^A-Za-z0-9]/.test(password) },
  ], [password]);

  const allRulesMet = rules.every((r) => r.met);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }

    if (!/[A-Z]/.test(password)) {
      setError("Password must contain an uppercase letter");
      return;
    }

    if (!/[0-9]/.test(password)) {
      setError("Password must contain a number");
      return;
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      setError("Password must contain a special character");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [password, confirmPassword, token]);

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
          {validating ? (
            <div className="text-center py-8">
              <svg className="animate-spin h-8 w-8 text-brand mx-auto mb-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-muted text-sm">Validating your reset link...</p>
            </div>
          ) : success ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-heading font-semibold text-foreground mb-2">
                Password Updated!
              </h2>
              <p className="text-muted text-sm mb-6 leading-relaxed">
                Your password has been updated successfully. Redirecting to sign in...
              </p>
              <Link
                href="/login"
                className="inline-block w-full py-3 px-4 bg-gradient-to-r from-brand to-brand-light hover:from-brand-hover hover:to-brand text-white text-base font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 active:scale-[0.98] text-center"
              >
                Sign In Now
              </Link>
            </div>
          ) : !token || !tokenValid ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <h2 className="text-xl font-heading font-semibold text-foreground mb-2">
                Invalid Reset Link
              </h2>
              <p className="text-muted text-sm mb-6 leading-relaxed">
                {tokenError || "This password reset link is invalid or has expired. Please request a new one."}
              </p>
              <Link
                href="/forgot-password"
                className="inline-block w-full py-3 px-4 bg-gradient-to-r from-brand to-brand-light hover:from-brand-hover hover:to-brand text-white text-base font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 active:scale-[0.98] text-center"
              >
                Request New Link
              </Link>
              <p className="text-center text-sm text-muted mt-4">
                <Link href="/login" className="text-brand font-semibold hover:text-brand-light transition-colors">
                  Back to Sign In
                </Link>
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-heading font-semibold text-foreground mb-2">
                Set a new password
              </h2>
              <p className="text-muted text-sm mb-6 leading-relaxed">
                Your new password must be at least 12 characters with uppercase, number, and special character.
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200/60 text-red-600 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* New Password */}
                <div>
                  <label
                    htmlFor="password"
                    className="block font-heading text-sm font-semibold text-foreground/80 tracking-wide mb-1.5"
                  >
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={12}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 pr-12 border-2 border-border/80 rounded-xl bg-surface/30 text-base text-foreground placeholder-gray-400 focus:outline-none focus:border-brand focus:ring-0 transition-colors duration-200"
                      placeholder="At least 12 characters"
                      autoComplete="new-password"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-surface transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      <EyeIcon open={showPassword} />
                    </button>
                  </div>

                  {/* Strength indicator bar */}
                  {password.length > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-muted">Password strength</span>
                        <span className={`text-xs font-semibold ${strength.color}`}>{strength.label}</span>
                      </div>
                      <div className="h-1.5 bg-border rounded-full overflow-hidden flex gap-1">
                        {[1, 2, 3, 4].map((level) => (
                          <div
                            key={level}
                            className={`h-full flex-1 rounded-full transition-colors duration-300 ${
                              level <= strength.score ? strength.bgColor : "bg-border"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Live validation checklist */}
                  {password.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {rules.map((rule) => (
                        <div key={rule.label} className="flex items-center gap-2">
                          {rule.met ? (
                            <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-border flex-shrink-0" />
                          )}
                          <span className={`text-xs ${rule.met ? "text-emerald-600 font-medium" : "text-muted"}`}>
                            {rule.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block font-heading text-sm font-semibold text-foreground/80 tracking-wide mb-1.5"
                  >
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      required
                      minLength={12}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`w-full px-4 py-3 pr-12 border-2 rounded-xl bg-surface/30 text-base text-foreground placeholder-gray-400 focus:outline-none focus:ring-0 transition-colors duration-200 ${
                        confirmPassword.length > 0
                          ? passwordsMatch
                            ? "border-emerald-300 focus:border-emerald-400"
                            : "border-red-300 focus:border-red-400"
                          : "border-border/80 focus:border-brand"
                      }`}
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-surface transition-colors"
                      tabIndex={-1}
                      aria-label={showConfirm ? "Hide password" : "Show password"}
                    >
                      <EyeIcon open={showConfirm} />
                    </button>
                  </div>
                  {/* Match indicator */}
                  {confirmPassword.length > 0 && (
                    <p className={`mt-1.5 text-xs flex items-center gap-1 ${passwordsMatch ? "text-emerald-600" : "text-red-500"}`}>
                      {passwordsMatch ? (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Passwords match
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Passwords do not match
                        </>
                      )}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !allRulesMet || !passwordsMatch}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-brand to-brand-light hover:from-brand-hover hover:to-brand text-white text-base font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand"
                >
                  {loading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Spinner />
                      Resetting...
                    </span>
                  ) : (
                    "Reset Password"
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

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
