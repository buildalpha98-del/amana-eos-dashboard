"use client";

import { ErrorState } from "@/components/ui/ErrorState";

interface ReportErrorStateProps {
  name: string;
  cached?: boolean;
  isFetching: boolean;
  onRetry: () => void;
}

/** Keep report failures distinct from successful empty results, including on printouts. */
export function ReportErrorState({ name, cached = false, isFetching, onRetry }: ReportErrorStateProps) {
  return (
    <div role="alert">
      <ErrorState
        title={cached ? "Report refresh failed" : `Unable to load ${name} report`}
        error={new Error(cached
          ? "Showing previously loaded results. They may be out of date. Retry before exporting or printing."
          : "Report data is unavailable. Please try again.")}
        onRetry={isFetching ? undefined : onRetry}
      />
      {isFetching && <p role="status" className="text-center text-sm text-muted">Retrying report…</p>}
    </div>
  );
}
