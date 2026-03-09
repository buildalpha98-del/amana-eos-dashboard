"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { EmptyState } from "./EmptyState";

interface ErrorStateProps {
  title?: string;
  error?: Error | null;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  error,
  onRetry,
}: ErrorStateProps) {
  return (
    <EmptyState
      icon={AlertCircle}
      title={title}
      description={error?.message || "An unexpected error occurred. Please try again."}
      iconColor="#EF4444"
      action={onRetry ? { label: "Try Again", icon: RefreshCw, onClick: onRetry } : undefined}
    />
  );
}
