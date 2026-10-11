"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { ApiResponseError, mutateApi } from "@/lib/fetch-api";

export function ConfirmLogin() {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  const submitting = useRef(false);
  const tokenRef = useRef("");

  useEffect(() => {
    // Read the email token only after hydration, then remove it from the
    // address bar/history. No network request redeems it until the click.
    // Keep a ref so React Strict Mode's effect replay cannot lose the token.
    if (!tokenRef.current) tokenRef.current = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    setToken(tokenRef.current);
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);

  async function continueToAccount() {
    if (!token || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      // The server bounds preparation and the database transaction. A client
      // abort timer must not race a successful single-use redemption.
      await mutateApi("/api/parent/auth/verify", { method: "POST", body: { token }, timeoutMs: 0 });
      // Full navigation ensures the auth provider reads the new session cookie.
      window.location.replace("/parent?v2=1");
    } catch (err) {
      setInvalid(err instanceof ApiResponseError && (err.status === 400 || err.status === 401));
      setError(err instanceof ApiResponseError && err.status < 500 && err.status > 0
        ? err.message : "We couldn't sign you in just now. Please try again.");
      setBusy(false);
      submitting.current = false;
    }
  }

  const missing = token === "";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-parent-bg px-4 py-10 text-brand">
      <div className="w-full max-w-md">
        <div className="rounded-[2rem] border border-brand/10 bg-card p-6 text-center shadow-xl shadow-brand/5 sm:p-10">
          <Image src="/email/amana-logo-blue.png" alt="Amana OSHC — Beyond the Bell" width={170} height={86} priority className="mx-auto h-auto w-40" />
          <div className="mx-auto mb-5 mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-accent/20">
            <ShieldCheck className="h-8 w-8" aria-hidden="true" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.18em]">Your Amana family hub</p>
          <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-4 text-base leading-relaxed text-brand/80">
            {missing || invalid ? "Open a fresh login link from your email to get back to your family hub."
              : "You're one step away from your enrolment, school information and support from our team."}
          </p>
          {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {missing || invalid ? (
            <a href="/parent/login" className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">
              Request a new login link <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          ) : (
            <button type="button" onClick={continueToAccount} disabled={busy || token === null} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 font-semibold transition-colors hover:bg-accent-light focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60">
              {busy || token === null ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {busy ? "Signing you in…" : "Opening your link…"}</>
                : <>Continue to my account <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
            </button>
          )}
          <p className="mt-4 text-sm leading-relaxed text-brand/80">Login links last one hour and can be used once.</p>
        </div>
        <p className="mt-6 text-center text-sm">Need a hand? <a href="tel:1300200262" className="font-semibold underline underline-offset-4">Call 1300 200 262</a></p>
      </div>
    </main>
  );
}
