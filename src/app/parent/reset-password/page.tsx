"use client";

/**
 * /parent/reset-password?token=… — where a reset link lands.
 *
 * The link is checked BEFORE the form is shown. Letting someone choose a
 * password, submit it, and only then learn the link died an hour ago is the
 * kind of dead end that makes a family give up and ring the centre — which is
 * the situation this whole flow exists to prevent.
 *
 * Nothing here signs anyone in. On success they go to the sign-in page and use
 * the password they just chose, which is both the proof it worked and the
 * habit they'll need next time, when there is no link to click.
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { mutateApi, fetchApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

const MIN_LENGTH = 10;

type LinkState =
  | { status: "checking" }
  | { status: "valid"; email: string }
  | { status: "invalid"; reason: string };

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  // A missing token needs no round trip, so it is the INITIAL state rather
  // than a setState fired from inside the effect (which the React compiler
  // rejects, and which would render "checking" for a frame regardless).
  const [link, setLink] = useState<LinkState>(() =>
    token ? { status: "checking" } : { status: "invalid", reason: "unknown" },
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchApi<{ valid: boolean; email?: string; reason?: string }>(
      `/api/parent/auth/reset-password?token=${encodeURIComponent(token)}`,
    )
      .then((res) => {
        if (cancelled) return;
        setLink(
          res.valid
            ? { status: "valid", email: res.email ?? "" }
            : { status: "invalid", reason: res.reason ?? "unknown" },
        );
      })
      .catch(() => {
        if (!cancelled) setLink({ status: "invalid", reason: "unknown" });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({
        variant: "destructive",
        description: "The two passwords don't match.",
      });
      return;
    }
    setSaving(true);
    try {
      await mutateApi("/api/parent/auth/reset-password", {
        method: "POST",
        body: { token, password },
      });
      router.push("/parent/login?reset=1");
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error
            ? err.message
            : "Couldn't set your password. Please try again.",
      });
      setSaving(false);
    }
  };

  if (link.status === "checking") {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking your link…
      </div>
    );
  }

  if (link.status === "invalid") {
    return (
      <div className="py-4 text-center">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/40">
          <AlertCircle className="h-7 w-7 text-amber-600" />
        </div>
        <h2 className="mb-2 text-lg font-heading font-semibold text-foreground">
          {link.reason === "used"
            ? "This link has already been used"
            : "This link has expired"}
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          Reset links last one hour and work once. Request a fresh one and it
          will arrive straight away.
        </p>
        <a
          href="/parent/login"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-light"
        >
          Back to sign in
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    );
  }

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-heading font-semibold text-foreground">
          Choose a new password
        </h2>
        {link.email && (
          <p className="mt-1 text-sm text-muted">for {link.email}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="new-password"
          className="mb-1.5 block text-sm font-medium text-foreground/80"
        >
          New password
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            id="new-password"
            type="password"
            required
            minLength={MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full rounded-xl border-2 border-border bg-background/50 py-3 pl-10 pr-4 text-base text-foreground transition-colors focus:border-brand focus:outline-none"
          />
        </div>
        <p
          className={`mt-1 text-xs ${tooShort ? "text-red-600" : "text-muted"}`}
        >
          At least {MIN_LENGTH} characters.
        </p>
      </div>

      <div>
        <label
          htmlFor="confirm-password"
          className="mb-1.5 block text-sm font-medium text-foreground/80"
        >
          Confirm new password
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            id="confirm-password"
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="w-full rounded-xl border-2 border-border bg-background/50 py-3 pl-10 pr-4 text-base text-foreground transition-colors focus:border-brand focus:outline-none"
          />
        </div>
        {mismatch && (
          <p className="mt-1 text-xs text-red-600">
            These don&apos;t match yet.
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={saving || tooShort || mismatch || !password}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving…
          </>
        ) : (
          <>
            Save new password
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}

export default function ParentResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#001824] via-[#003344] to-[#0A5E7E] px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-white/50 bg-white/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <Suspense
            fallback={
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center font-heading text-2xs uppercase tracking-wider text-white/30">
          Amana OSHC Parent Portal
        </p>
      </div>
    </div>
  );
}
