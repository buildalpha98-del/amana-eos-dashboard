import { getCertStatus } from "@/lib/cert-status";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  valid: "bg-green-100 text-green-800 border-green-200",
  expiring: "bg-amber-100 text-amber-800 border-amber-200",
  expired: "bg-red-100 text-red-800 border-red-200",
  missing: "bg-surface text-muted border-border",
  no_expiry: "bg-emerald-50 text-emerald-700 border-emerald-200",
} as const;

export function CertStatusBadge({
  expiryDate,
  noExpiry,
  className,
}: {
  expiryDate: Date | null;
  /**
   * Set to true when the surrounding cert intentionally has no expiry (file
   * is attached but `expiryDate` is null by design — e.g. lifetime
   * qualification). Without this flag the badge falls back to "Not uploaded"
   * for null dates, which is what existing callers (no file yet) want.
   */
  noExpiry?: boolean;
  className?: string;
}) {
  if (noExpiry) {
    return (
      <span
        className={cn(
          "inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium",
          STATUS_STYLES.no_expiry,
          className,
        )}
      >
        No expiry
      </span>
    );
  }

  const { status, daysLeft } = getCertStatus(expiryDate);
  let label: string;
  if (status === "missing") label = "Not uploaded";
  else if (status === "expired") label = `Expired ${Math.abs(daysLeft!)} days ago`;
  else if (status === "expiring") {
    label = daysLeft === 0 ? "Expires today" : `Expires in ${daysLeft} days`;
  } else label = "Valid";

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium",
        STATUS_STYLES[status],
        className,
      )}
    >
      {label}
    </span>
  );
}
