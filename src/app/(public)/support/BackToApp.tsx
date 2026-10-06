"use client";

/**
 * "Back to the Amana app" — shown on the public Help Centre ONLY to a parent
 * who is signed in to the portal. They reach /support from the app's Help
 * link, and the Help Centre has its own header with no way back, so the
 * only exit was the browser's Back button. Signed-out visitors (from the
 * website or a search) never see it.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function BackToApp() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/parent/me", { credentials: "include" })
      .then((r) => {
        if (!cancelled && r.ok) setSignedIn(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!signedIn) return null;
  return (
    <div className="bg-accent/25 border-b border-accent/60">
      <div className="mx-auto w-full max-w-5xl px-4">
        <Link
          href="/parent"
          className="inline-flex items-center gap-1.5 py-2.5 text-sm font-semibold text-brand hover:underline min-h-11"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to the Amana app
        </Link>
      </div>
    </div>
  );
}
