"use client";

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const errorId = `ERR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    return { hasError: true, error, errorId };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
    // Report to Sentry if available
    import("@sentry/nextjs")
      .then((Sentry) => {
        Sentry.captureException(error, {
          contexts: { react: { componentStack: errorInfo.componentStack } },
          tags: { errorId: this.state.errorId ?? undefined },
        });
      })
      .catch(() => {
        // Sentry not available — ignore
      });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorId: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const { error, errorId } = this.state;
    const isDev = process.env.NODE_ENV === "development";

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="mx-auto max-w-md space-y-6">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: "#004E64" }}
          >
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
            <p className="mt-2 text-sm text-muted">
              An unexpected error occurred. Our team has been notified.
            </p>
          </div>

          {errorId && (
            <p className="text-xs text-muted">
              Reference: <code className="rounded bg-surface px-1.5 py-0.5 font-mono">{errorId}</code>
            </p>
          )}

          {isDev && error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-left">
              <p className="text-sm font-medium text-red-800">{error.message}</p>
              {error.stack && (
                <pre className="mt-2 max-h-40 overflow-auto text-xs text-red-600">{error.stack}</pre>
              )}
            </div>
          )}

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={this.handleReset}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: "#004E64" }}
            >
              Try Again
            </button>
            <a
              href="/dashboard"
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-surface"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}

/** Convenience wrapper for use in JSX */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode,
) {
  const Wrapped = (props: P) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  );
  Wrapped.displayName = `withErrorBoundary(${Component.displayName || Component.name || "Component"})`;
  return Wrapped;
}
