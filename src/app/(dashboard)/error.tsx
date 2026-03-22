"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full p-8 bg-card rounded-xl shadow-sm border border-border text-center">
        <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-amber-500" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-muted mb-1">
          This page ran into an issue. You can try again or head back to the
          dashboard.
        </p>
        <p className="text-xs text-muted mb-1 font-mono">
          {error.message || "Unknown error"}
        </p>
        {error.digest && (
          <p className="text-xs text-muted/50 mb-6 font-mono">
            Ref: {error.digest}
          </p>
        )}
        {!error.digest && <div className="mb-6" />}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-surface text-foreground/80 text-sm font-medium rounded-lg hover:bg-border transition-colors"
          >
            <Home className="w-4 h-4" />
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
