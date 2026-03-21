"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function QueueError({
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
    <div className="flex flex-col items-center justify-center py-20">
      <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
      <h2 className="text-lg font-semibold text-foreground mb-2">
        Something went wrong
      </h2>
      <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
        {error.message || "An unexpected error occurred. Please try again."}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-brand text-white rounded-lg hover:opacity-90 transition-opacity"
      >
        Try again
      </button>
    </div>
  );
}
