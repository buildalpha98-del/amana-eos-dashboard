import { getCertStatus } from "@/lib/cert-status";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  valid: "bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-200 border-green-200 dark:border-green-800",
  expiring: "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800",
  expired: "bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800",
  missing: "bg-surface text-muted border-border",
  no_expiry: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
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
