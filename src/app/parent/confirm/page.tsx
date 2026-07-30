"use client";

/**
 * /parent/confirm?token=… — lands here from the confirmation email.
 *
 * Confirms the address, claims any enrolment already submitted under it,
 * and signs the parent in. Redirects into the portal on success.
 */

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { mutateApi } from "@/lib/fetch-api";

function ConfirmInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  // "no token" is knowable at render, so derive it in the initialiser
  // rather than setting state inside the effect (react-hooks/set-state-in-effect,
  // and it avoids an extra render).
  const [state, setState] = useState<"working" | "done" | "error">(() =>
    token ? "working" : "error",
  );
  const [message, setMessage] = useState(() =>
    token ? "" : "This link is missing its confirmation code.",
  );
  const [claimed, setClaimed] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    mutateApi<{ success: boolean; claimedEnrolments: number }>(
      "/api/parent/auth/confirm",
      { method: "POST", body: { token } },
    )
      .then((res) => {
        if (cancelled) return;
        setClaimed(res.claimedEnrolments ?? 0);
        setState("done");
        // Brief pause so the parent sees it worked before the redirect.
        setTimeout(() => router.push("/parent"), 1800);
      })
      .catch((err) => {
        if (cancelled) return;
        setState("error");
        setMessage(
          err instanceof Error ? err.message : "We couldn't confirm this link.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-[#001824] via-[#003344] to-[#0A5E7E] px-4">
      <div className="w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/50 text-center">
        {state === "working" && (
          <>
            <Loader2 className="w-10 h-10 text-brand mx-auto mb-3 animate-spin" />
            <p className="text-sm text-muted">Confirming your email…</p>
          </>
        )}

        {state === "done" && (
          <>
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <h1 className="text-lg font-semibold text-foreground mb-1">
              Email confirmed
            </h1>
            <p className="text-sm text-muted">
              {claimed > 0
                ? `Your account is active and we've linked ${claimed} existing enrolment${claimed === 1 ? "" : "s"}.`
                : "Your account is active. Taking you to your portal…"}
            </p>
          </>
        )}

        {state === "error" && (
          <>
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h1 className="text-lg font-semibold text-foreground mb-1">
              We couldn&apos;t confirm this link
            </h1>
            <p className="text-sm text-muted mb-4">{message}</p>
            <Link
              href="/parent/login"
              className="inline-block text-sm text-brand underline"
            >
              Go to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function ParentConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex items-center justify-center bg-[#001824]">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      }
    >
      <ConfirmInner />
    </Suspense>
  );
}
