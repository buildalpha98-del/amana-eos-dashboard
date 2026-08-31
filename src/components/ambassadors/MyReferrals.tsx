"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import {
  useAmbassadorRecords,
  useRefCodes,
} from "@/hooks/useAmbassadors";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "./StatusBadge";

/**
 * Educator self-view: their code, their credited enrolments, tier, LMS
 * completion status and projected payout. Read-only.
 */
export function MyReferrals() {
  const { data, isLoading } = useAmbassadorRecords();
  const { data: codesData } = useRefCodes();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const records = data?.records ?? [];
  const myCode = codesData?.codes?.[0];
  const qualified = records.filter((r) => r.qualified);
  const projected = qualified.reduce((sum, r) => sum + (r.incentiveAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* My code */}
      <div className="bg-card border border-border rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-2xs uppercase tracking-wide font-medium text-muted mb-1">
            Your referral code
          </p>
          {myCode ? (
            <p className="text-2xl font-heading font-semibold tracking-widest text-brand">
              {myCode.code}
            </p>
          ) : (
            <p className="text-sm text-muted">
              No code yet — your Director can generate one from the Codes tab.
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-2xs uppercase tracking-wide font-medium text-muted mb-1">
            Projected payout
          </p>
          <p className="text-2xl font-heading font-semibold text-foreground">
            {projected.toLocaleString("en-AU", { style: "currency", currency: "AUD" })}
          </p>
          <p className="text-2xs text-muted">
            {qualified.length} qualified of {records.length} logged
          </p>
        </div>
      </div>

      {/* LMS reminder */}
      <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
        <GraduationCap className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-900 dark:text-amber-200">
          Incentives are only payable once you&apos;ve completed all 3 units of
          the <strong>Amana Ambassadors</strong> course.{" "}
          <Link href="/my-training" className="underline font-medium">
            Check your progress in My Training
          </Link>
          .
        </p>
      </div>

      {/* My records */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">
            Enrolments credited to you
          </h2>
        </div>
        {records.length === 0 ? (
          <p className="p-6 text-sm text-muted text-center">
            Nothing yet — share your code or QR with families you speak with.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {records.map((r) => (
              <li
                key={r.id}
                className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {r.childInitials}{" "}
                    <span className="text-muted font-normal">
                      · {r.service.name}
                    </span>
                  </p>
                  <p className="text-2xs text-muted mt-0.5">
                    {r.paidSessionsAttended}/4 paid sessions
                    {r.tierAmount
                      ? ` · $${r.tierAmount} tier`
                      : ""}
                    {r.qualified ? " · qualified" : ""}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
