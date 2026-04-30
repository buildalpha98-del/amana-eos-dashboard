"use client";

import { Check, X, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type PolicyAckStatus = "acknowledged" | "stale" | "missing";

interface Props {
  status: PolicyAckStatus;
  ackedVersion: number | null;
  currentVersion: number;
  policyTitle: string;
  userName: string;
  acknowledgedAt: string | null;
  onClick?: () => void;
}

export function PolicyHeatMapCell({
  status,
  ackedVersion,
  currentVersion,
  policyTitle,
  userName,
  acknowledgedAt,
  onClick,
}: Props) {
  const config = {
    acknowledged: {
      bg: "bg-emerald-50 hover:bg-emerald-100",
      text: "text-emerald-700",
      Icon: Check,
      label: "Acknowledged",
    },
    stale: {
      bg: "bg-amber-50 hover:bg-amber-100",
      text: "text-amber-700",
      Icon: Clock,
      label: `Acknowledged v${ackedVersion}, current v${currentVersion}`,
    },
    missing: {
      bg: "bg-red-50 hover:bg-red-100",
      text: "text-red-700",
      Icon: X,
      label: "Not acknowledged",
    },
  }[status];

  const Icon = config.Icon;
  const title =
    status === "acknowledged" && acknowledgedAt
      ? `${userName} acknowledged "${policyTitle}" on ${new Date(acknowledgedAt).toLocaleDateString("en-AU")}`
      : `${userName} — ${policyTitle} — ${config.label}`;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "w-7 h-7 rounded flex items-center justify-center transition-colors",
        config.bg,
      )}
    >
      <Icon className={cn("w-3.5 h-3.5", config.text)} />
    </button>
  );
}
