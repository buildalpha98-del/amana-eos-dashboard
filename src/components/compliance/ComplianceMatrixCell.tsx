"use client";

import { cn } from "@/lib/utils";
import type { CertStatus } from "@/lib/cert-status";

export interface ComplianceMatrixCellProps {
  status: CertStatus;
  daysLeft: number | null;
  certTypeLabel: string;
  userName: string;
  onClick?: () => void;
}

const STATUS_STYLES: Record<CertStatus, string> = {
  valid: "bg-green-100 hover:bg-green-200 border-green-200",
  expiring: "bg-amber-100 hover:bg-amber-200 border-amber-200",
  expired: "bg-red-100 hover:bg-red-200 border-red-200",
  missing: "bg-gray-100 hover:bg-gray-200 border-gray-200",
};

const STATUS_LABELS: Record<CertStatus, string> = {
  valid: "Valid",
  expiring: "Expiring soon",
  expired: "Expired",
  missing: "Missing",
};

function tooltipFor(status: CertStatus, daysLeft: number | null): string {
  if (status === "missing") return "Not uploaded";
  if (status === "expired") {
    if (daysLeft === null) return "Expired";
    return `Expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} ago`;
  }
  if (status === "expiring") {
    if (daysLeft === null) return "Expiring soon";
    if (daysLeft === 0) return "Expires today";
    return `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  }
  if (daysLeft === null) return "Valid";
  return `Valid — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
}

export function ComplianceMatrixCell({
  status,
  daysLeft,
  certTypeLabel,
  userName,
  onClick,
}: ComplianceMatrixCellProps) {
  const tooltip = tooltipFor(status, daysLeft);
  const ariaLabel = `${userName} — ${certTypeLabel}: ${STATUS_LABELS[status]}${
    status !== "missing" && daysLeft !== null ? ` (${tooltip})` : ""
  }`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={`${certTypeLabel} · ${tooltip}`}
      data-status={status}
      className={cn(
        "flex items-center justify-center h-8 w-8 rounded border transition-colors text-[10px] font-semibold",
        STATUS_STYLES[status],
        onClick ? "cursor-pointer" : "cursor-default",
      )}
    >
      <span className="sr-only">{STATUS_LABELS[status]}</span>
      {status === "expiring" && daysLeft !== null && (
        <span aria-hidden className="text-amber-800">
          {daysLeft}d
        </span>
      )}
      {status === "expired" && (
        <span aria-hidden className="text-red-800">
          !
        </span>
      )}
    </button>
  );
}
