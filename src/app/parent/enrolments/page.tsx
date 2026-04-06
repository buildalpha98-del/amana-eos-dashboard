"use client";

import Link from "next/link";
import { UserPlus, Clock, Check, XCircle, ArrowLeft } from "lucide-react";
import {
  useParentEnrolmentApplications,
  useWithdrawSiblingEnrolment,
} from "@/hooks/useParentPortal";
import { Skeleton } from "@/components/ui/Skeleton";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: "Pending Review", color: "bg-amber-100 text-amber-700", icon: Clock },
  approved: { label: "Approved", color: "bg-green-100 text-green-700", icon: Check },
  declined: { label: "Declined", color: "bg-red-100 text-red-700", icon: XCircle },
  withdrawn: { label: "Withdrawn", color: "bg-gray-100 text-gray-500", icon: XCircle },
};

export default function ParentEnrolmentsPage() {
  const { data: applications, isLoading } = useParentEnrolmentApplications();
  const withdraw = useWithdrawSiblingEnrolment();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/parent"
            className="inline-flex items-center gap-1 text-xs text-[#7c7c8a] hover:text-[#004E64] mb-2 min-h-[44px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </Link>
          <h1 className="text-xl font-heading font-bold text-[#1a1a2e]">
            Enrolments
          </h1>
          <p className="text-sm text-[#7c7c8a] mt-0.5">
            Track your sibling enrolment applications.
          </p>
        </div>
        <Link
          href="/parent/enrolments/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#004E64] rounded-xl hover:bg-[#003d4f] transition-colors min-h-[44px]"
        >
          <UserPlus className="w-4 h-4" />
          Enrol a Sibling
        </Link>
      </div>

      {/* Applications list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : !applications || applications.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-[#e8e4df]">
          <UserPlus className="w-12 h-12 text-[#e8e4df] mx-auto mb-3" />
          <h3 className="text-base font-semibold text-[#1a1a2e] mb-1">
            No Applications Yet
          </h3>
          <p className="text-sm text-[#7c7c8a] mb-4">
            Enrol a sibling to get started.
          </p>
          <Link
            href="/parent/enrolments/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#004E64] rounded-xl hover:bg-[#003d4f] transition-colors min-h-[44px]"
          >
            <UserPlus className="w-4 h-4" />
            Enrol a Sibling
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => {
            const config = STATUS_CONFIG[app.status] || STATUS_CONFIG.pending;
            const StatusIcon = config.icon;

            return (
              <div
                key={app.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-[#1a1a2e]">
                      {app.childFirstName} {app.childLastName}
                    </h3>
                    <p className="text-xs text-[#7c7c8a] mt-0.5">
                      {app.serviceName}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {app.sessionTypes.map((st) => (
                        <span
                          key={st}
                          className="px-2 py-0.5 bg-[#004E64]/10 text-[#004E64] text-[10px] font-medium rounded-full"
                        >
                          {st}
                        </span>
                      ))}
                    </div>
                    <p className="text-[10px] text-[#7c7c8a] mt-2">
                      Submitted{" "}
                      {new Date(app.createdAt).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    {app.declineReason && (
                      <p className="text-xs text-red-600 mt-1">
                        Reason: {app.declineReason}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full ${config.color}`}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {config.label}
                    </span>

                    {app.status === "pending" && (
                      <button
                        onClick={() => withdraw.mutate(app.id)}
                        disabled={withdraw.isPending}
                        className="text-xs text-red-500 hover:text-red-700 font-medium min-h-[44px] flex items-center"
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
