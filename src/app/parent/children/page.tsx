"use client";

import Link from "next/link";
import {
  ChevronRight,
  AlertCircle,
  Calendar,
} from "lucide-react";
import { useParentChildren, type ParentChild } from "@/hooks/useParentPortal";
import { Skeleton } from "@/components/ui/Skeleton";

export default function ChildrenListPage() {
  const { data: children, isLoading, error } = useParentChildren();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#1a1a2e]">
          Your Children
        </h1>
        <p className="text-sm text-[#7c7c8a] mt-1">
          Tap a child to see attendance, medical info, and emergency contacts.
        </p>
      </div>

      {isLoading ? (
        <ChildrenSkeleton />
      ) : error || !children ? (
        <div className="bg-white rounded-xl p-6 text-center shadow-sm border border-[#e8e4df]">
          <p className="text-[#7c7c8a] text-sm">
            Unable to load children. Please try again later.
          </p>
        </div>
      ) : children.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-[#e8e4df]">
          <p className="text-[#7c7c8a] text-sm">
            No children are linked to your account yet. Contact your centre if
            you believe this is an error.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {children.map((child) => (
            <ChildRow key={child.id} child={child} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChildRow({ child }: { child: ParentChild }) {
  const hasMedical =
    child.medicalConditions.length > 0 || child.allergies.length > 0;

  const medicalSummary = [
    ...child.medicalConditions,
    ...child.allergies.map((a) => `Allergy: ${a}`),
  ]
    .slice(0, 2)
    .join(", ");

  return (
    <Link
      href={`/parent/children/${child.id}`}
      className="flex items-center gap-3 bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df] hover:shadow-md hover:border-[#004E64]/20 transition-all active:scale-[0.99]"
    >
      {/* Avatar circle */}
      <div className="w-12 h-12 rounded-full bg-[#004E64]/10 flex items-center justify-center flex-shrink-0">
        <span className="text-lg font-heading font-bold text-[#004E64]">
          {child.firstName[0]}
          {child.lastName[0]}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-heading font-semibold text-[#1a1a2e] truncate">
            {child.firstName} {child.lastName}
          </h3>
          {hasMedical && (
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          )}
        </div>
        <p className="text-sm text-[#7c7c8a] truncate">
          {[child.yearLevel, child.serviceName].filter(Boolean).join(" \u00B7 ")}
        </p>
        {medicalSummary && (
          <p className="text-xs text-red-500/80 truncate mt-0.5">
            {medicalSummary}
          </p>
        )}
        <div className="flex items-center gap-1 mt-1 text-xs text-[#7c7c8a]">
          <Calendar className="w-3 h-3" />
          <span>
            Attendance this week: {child.attendanceThisWeek.attended}/
            {child.attendanceThisWeek.total} days
          </span>
        </div>
      </div>

      <ChevronRight className="w-5 h-5 text-[#7c7c8a] flex-shrink-0" />
    </Link>
  );
}

function ChildrenSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}
