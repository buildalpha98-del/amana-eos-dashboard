"use client";

/**
 * /parent/signup — parents create their own Amana OSHC account.
 *
 * 2026-07-30: the website's "Enrol now" button points here rather than
 * straight at the enrolment form. The account is created and the email
 * confirmed FIRST; the enrolment is then completed inside the portal and
 * owned by that account.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { MetaPixel } from "@/components/analytics/MetaPixel";

// Ambassadors: educator QR codes land here as /parent/signup?ref=CODE.
// window.location (not useSearchParams) so the page needs no Suspense
// boundary; sessionStorage keeps the code if they wander off and return.
const REF_STORAGE_KEY = "amana_ref";

export default function ParentSignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refCode, setRefCode] = useState("");
  const router = useRouter();

  /**
   * `?enquiry=<id>` — a family arriving from a nurture or waitlist link.
   *
   * Those links used to open the old anonymous wizard, which is gone
   * because everything submitted through it was an incomplete record.
   * They land here instead, and this is what stops that being a
   * downgrade: the name and email they already gave us are filled in,
   * rather than asked for a second time.
   *
   * Prefill only — the email is editable and the account is still
   * created from what's typed. Anyone can put any id in the URL, so
   * this must never be treated as proof of who they are.
   */
  useEffect(() => {
    const enquiryId = new URLSearchParams(window.location.search).get("enquiry");
    if (!enquiryId) return;
    let cancelled = false;

    fetchApi<{ prefill: { firstName: string; surname: string; email: string } }>(
      `/api/enrol/${encodeURIComponent(enquiryId)}`,
    )
      .then(({ prefill }) => {
        if (cancelled) return;
        const name = [prefill.firstName, prefill.surname]
          .filter(Boolean)
          .join(" ");
        // Never clobber something the family has already typed — the
        // fetch resolves after the field is interactive.
        if (name) setFullName((prev) => prev || name);
        if (prefill.email) setEmail((prev) => prev || prefill.email);
      })
      .catch(() => {
        // An expired or unknown link is not an error worth showing:
        // the form works perfectly well unfilled.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("ref");
    if (fromUrl) {
      setRefCode(fromUrl);
      try {
        sessionStorage.setItem(REF_STORAGE_KEY, fromUrl);
      } catch {
        // storage unavailable (private mode) — the URL value still applies
      }
      return;
    }
    try {
      const stored = sessionStorage.getItem(REF_STORAGE_KEY);
      if (stored) setRefCode(stored);
    } catch {
      // ignore
    }
  }, []);

  const passwordsMatch = password === confirm;
  const longEnough = password.length >= 10;
  const canSubmit =
    !!email && !!fullName.trim() && longEnough && passwordsMatch && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!passwordsMatch) return setError("Passwords don't match.");
    if (!longEnough) return setError("Password must be at least 10 characters.");
    setLoading(true);
    try {
      const res = await mutateApi<{ redirectTo?: string }>(
        "/api/parent/auth/signup",
        {
          method: "POST",
          body: {
            email,
            password,
            fullName: fullName.trim(),
            ...(refCode ? { refCode } : {}),
          },
        },
      );
      // Signed in already — go straight to the form. router.push would
      // leave the signup page on the back stack, and pressing Back into a
      // form you've already started is disorienting.
      router.replace(res?.redirectTo ?? "/parent/enrol");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-[#001824] via-[#003344] to-[#0A5E7E] px-4 py-10">
      {/* Meta Pixel (production only) — signup page, not the staff dashboard. */}
      <MetaPixel />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-heading font-bold text-white tracking-tight">
            Create your account
          </h1>
          <p className="text-white/60 mt-2 text-sm">
            One account for enrolments, bookings and billing.
          </p>
        </div>

        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl p-6 sm:p-8 border border-white/50">
          <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="su-name" className="block text-sm font-medium text-foreground mb-1">
                  Full name
                </label>
                <input
                  id="su-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Sara Ahmed"
                  autoComplete="name"
                  className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                />
              </div>
              <div>
                <label htmlFor="su-email" className="block text-sm font-medium text-foreground mb-1">
                  Email address
                </label>
                <input
                  id="su-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                />
              </div>
              <div>
                <label htmlFor="su-pw" className="block text-sm font-medium text-foreground mb-1">
                  Password
                </label>
                <input
                  id="su-pw"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  aria-describedby="su-pw-hint"
                  className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                />
                <p
                  id="su-pw-hint"
                  className={
                    "mt-1 text-xs " +
                    (password && !longEnough ? "text-red-600" : "text-muted")
                  }
                >
                  At least 10 characters.
                </p>
              </div>
              <div>
                <label htmlFor="su-pw2" className="block text-sm font-medium text-foreground mb-1">
                  Confirm password
                </label>
                <input
                  id="su-pw2"
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                />
                {confirm && !passwordsMatch && (
                  <p className="mt-1 text-xs text-red-600">
                    Passwords don&apos;t match.
                  </p>
                )}
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full inline-flex items-center justify-center gap-2 bg-brand text-white font-medium px-4 py-3 rounded-lg hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Sign up
              </button>

              <p className="text-center text-xs text-muted">
                Already have an account?{" "}
                <Link href="/parent/login" className="text-brand underline">
                  Sign in
                </Link>
              </p>
          </form>
        </div>
      </div>
    </div>
  );
}
