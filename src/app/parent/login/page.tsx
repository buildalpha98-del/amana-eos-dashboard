"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Mail, ArrowRight, CheckCircle } from "lucide-react";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export default function ParentLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      await mutateApi("/api/parent/auth/send-link", {
        method: "POST",
        body: { email: email.trim().toLowerCase() },
      });
      setSent(true);
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error ? err.message : "Something went wrong",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#001824] via-[#003344] to-[#0A5E7E] px-4">
      {/* Background blobs */}
      <div
        className="absolute top-[-10%] left-[-5%] w-96 h-96 rounded-full bg-[#FECE00]/10 blur-3xl"
        style={{ animation: "parentFloat 6s ease-in-out infinite" }}
      />
      <div
        className="absolute bottom-[-8%] right-[-5%] w-64 h-64 rounded-full bg-[#0A7E9E]/15 blur-2xl"
        style={{ animation: "parentFloat 8s ease-in-out infinite 1s" }}
      />

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <Image
              src="/logo-full-white.svg"
              alt="Amana OSHC"
              width={180}
              height={90}
              priority
            />
          </div>
          <h1 className="text-3xl font-heading font-bold text-white tracking-tight">
            Parent Portal
          </h1>
          <p className="text-white/50 mt-1 text-sm">
            Access your children&apos;s information
          </p>
        </div>

        {/* Login card */}
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl p-6 sm:p-8 border border-white/50">
          {sent ? (
            /* ─── Success state ────────────────────────── */
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-50 mb-4">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="text-lg font-heading font-semibold text-[#1a1a2e] mb-2">
                Check your email!
              </h2>
              <p className="text-sm text-[#7c7c8a] leading-relaxed">
                We&apos;ve sent a login link to{" "}
                <span className="font-medium text-[#1a1a2e]">{email}</span>.
                It expires in 15 minutes.
              </p>
              <button
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
                className="mt-6 text-sm text-[#004E64] hover:text-[#0A7E9E] font-semibold transition-colors"
              >
                Use a different email
              </button>
            </div>
          ) : (
            /* ─── Form state ───────────────────────────── */
            <>
              <h2 className="text-lg font-heading font-semibold text-[#1a1a2e] mb-1">
                Sign in
              </h2>
              <p className="text-sm text-[#7c7c8a] mb-6">
                Enter your email and we&apos;ll send you a login link.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="parent-email"
                    className="block text-sm font-medium text-[#1a1a2e]/80 mb-1.5"
                  >
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7c7c8a]" />
                    <input
                      id="parent-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="parent@example.com"
                      autoComplete="email"
                      className="w-full pl-10 pr-4 py-3 border-2 border-[#e8e4df] rounded-xl bg-[#FAF8F5]/50 text-base text-[#1a1a2e] placeholder-[#7c7c8a]/60 focus:outline-none focus:border-[#004E64] transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#004E64] hover:bg-[#003D52] text-white text-base font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <svg
                        className="animate-spin h-4 w-4"
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
                    <>
                      Send Login Link
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-white/30 font-heading tracking-wider uppercase text-[10px] mt-6">
          Amana OSHC Parent Portal
        </p>
      </div>

      <style jsx>{`
        @keyframes parentFloat {
          0%,
          100% {
            transform: translateY(0px) scale(1);
          }
          50% {
            transform: translateY(-20px) scale(1.05);
          }
        }
      `}</style>
    </div>
  );
}
