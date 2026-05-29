import { getCertStatus } from "@/lib/cert-status";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  valid: "bg-green-100 text-green-800 border-green-200",
  expiring: "bg-amber-100 text-amber-800 border-amber-200",
  expired: "bg-red-100 text-red-800 border-red-200",
  missing: "bg-gray-100 text-gray-600 border-gray-200",
} as const;

export function CertStatusBadge({
  expiryDate,
  className,
}: { expiryDate: Date | null; className?: string }) {
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
