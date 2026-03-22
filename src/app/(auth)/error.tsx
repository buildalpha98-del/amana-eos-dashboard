"use client";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface/50 p-4">
      <div className="max-w-sm w-full p-8 bg-card rounded-xl shadow-lg text-center">
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Authentication error
        </h2>
        <p className="text-sm text-muted mb-6">
          Something went wrong. Please try again.
        </p>
        <button
          onClick={reset}
          className="px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
