"use client";

/**
 * /set-password — first sign-in step for anyone whose password was chosen by
 * someone else (welcome-email temporary password, admin reset). Middleware
 * holds them here while `mustChangePassword` is on the token. On success we
 * sign straight back in with the new password: the change bumps
 * tokenVersion, and a fresh token is also what drops the flag.
 */
import Image from "next/image";
import { useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { AuthBackdrop } from "@/components/layout/AuthBackdrop";
import { getLandingPage } from "@/lib/role-permissions";

const inputClass =
  "w-full px-4 py-3 border-2 border-border/80 rounded-xl bg-surface/30 text-base text-foreground placeholder-muted focus:outline-none focus:border-brand focus:ring-0 transition-colors duration-200";

export default function SetPasswordPage() {
  const { data: session } = useSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rules = useMemo(
    () => [
      { label: "At least 12 characters", met: password.length >= 12 },
      { label: "An uppercase letter", met: /[A-Z]/.test(password) },
      { label: "A number", met: /[0-9]/.test(password) },
      { label: "A symbol, like ! or #", met: /[^A-Za-z0-9]/.test(password) },
    ],
    [password],
  );
  const allMet = rules.every((r) => r.met);
  const matches = confirm.length > 0 && confirm === password;
  const firstName = (session?.user?.name ?? "").split(" ")[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!allMet) return setError("Your password doesn't meet all the requirements yet.");
    if (!matches) return setError("The two passwords don't match.");

    setSaving(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong — please try again.");

      const email = session?.user?.email;
      const result = email
        ? await signIn("credentials", { email, password, redirect: false })
        : null;
      if (result?.ok) {
        // Full navigation so the new session cookie is the one every
        // component reads.
        window.location.href = getLandingPage(session?.user?.role);
      } else {
        // Password IS saved — only the automatic sign-in failed.
        await signOut({ callbackUrl: "/login?reset=1" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
      setSaving(false);
    }
  }

  return (
    <AuthBackdrop>
      <div className="relative z-10 w-full max-w-md mx-4 animate-scale-in">
        <div className="text-center mb-6">
          <Image
            src="/logo-full-white.svg"
            alt="Amana OSHC"
            width={180}
            height={90}
            priority
            className="mx-auto"
          />
        </div>

        <div className="relative bg-cream-soft/95 backdrop-blur-xl rounded-[var(--radius-xl)] shadow-warm-lg p-6 sm:p-10 border border-white/60 overflow-hidden">
          <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-accent" />
          <p className="text-xs font-semibold text-brand uppercase tracking-wide mb-1">
            One quick step
          </p>
          <h1 className="text-xl font-heading font-semibold text-foreground mb-2">
            {firstName ? `Welcome, ${firstName}! ` : ""}Choose your own password
          </h1>
          <p className="text-muted text-sm mb-6 leading-relaxed">
            You signed in with a temporary password. Pick one only you know —
            you&apos;ll use it every time you sign in from now on.
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200/60 text-red-600 dark:text-red-400 text-sm"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="new-password"
                className="block font-heading text-sm font-semibold text-foreground/80 mb-1.5"
              >
                New password
              </label>
              <input
                id="new-password"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                autoComplete="new-password"
                autoFocus
                required
              />
              <ul className="mt-3 space-y-1" aria-label="Password requirements">
                {rules.map((r) => (
                  <li
                    key={r.label}
                    className={`text-xs flex items-center gap-2 ${r.met ? "text-emerald-600 font-medium" : "text-muted"}`}
                  >
                    <span
                      aria-hidden
                      className={`inline-block w-3.5 h-3.5 rounded-full border-2 ${r.met ? "bg-emerald-500 border-emerald-500" : "border-border"}`}
                    />
                    {r.label}
                    <span className="sr-only">{r.met ? "(done)" : "(not yet)"}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block font-heading text-sm font-semibold text-foreground/80 mb-1.5"
              >
                Type it again
              </label>
              <input
                id="confirm-password"
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
                autoComplete="new-password"
                required
              />
              {confirm.length > 0 && (
                <p className={`mt-1.5 text-xs ${matches ? "text-emerald-600" : "text-red-500"}`}>
                  {matches ? "Passwords match" : "Passwords don't match yet"}
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={show}
                onChange={(e) => setShow(e.target.checked)}
                className="rounded border-border"
              />
              Show passwords
            </label>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3.5 px-4 bg-brand hover:bg-brand-hover text-white text-base font-semibold rounded-xl shadow-lg transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand"
            >
              {saving ? "Saving…" : "Save and continue"}
            </button>
          </form>

          <p className="text-center text-sm text-muted mt-5">
            Not you?{" "}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-brand font-semibold hover:underline"
            >
              Sign out
            </button>
          </p>
        </div>
      </div>
    </AuthBackdrop>
  );
}
