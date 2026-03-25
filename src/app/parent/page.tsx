"use client";

import Link from "next/link";
import {
  ChevronRight,
  AlertCircle,
  FileEdit,
  CalendarDays,
  Phone,
} from "lucide-react";
import { useParentProfile, type ParentChild } from "@/hooks/useParentPortal";
import { Skeleton } from "@/components/ui/Skeleton";

export default function ParentDashboard() {
  const { data: profile, isLoading, error } = useParentProfile();

  if (isLoading) return <DashboardSkeleton />;

  if (error || !profile) {
    return (
      <div className="text-center py-12">
        <p className="text-[#7c7c8a] text-sm">
          Unable to load your information. Please try again later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#1a1a2e]">
          Welcome back, {profile.firstName} <span aria-hidden="true">&#128075;</span>
        </h1>
        <p className="text-sm text-[#7c7c8a] mt-1">
          Here&apos;s an overview of your family.
        </p>
      </div>

      {/* Children cards */}
      <section aria-label="Your children">
        <h2 className="text-sm font-heading font-semibold text-[#7c7c8a] uppercase tracking-wider mb-3">
          Your Children
        </h2>

        {profile.children.length === 0 ? (
          <div className="bg-white rounded-xl p-6 text-center shadow-sm border border-[#e8e4df]">
            <p className="text-[#7c7c8a] text-sm">
              No children found on your account. Contact your centre for assistance.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {profile.children.map((child, idx) => (
              <ChildCard key={child.id} child={child} index={idx} />
            ))}
          </div>
        )}
      </section>

      {/* Quick actions */}
      <section aria-label="Quick actions">
        <h2 className="text-sm font-heading font-semibold text-[#7c7c8a] uppercase tracking-wider mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <QuickAction
            href="/parent/account"
            icon={FileEdit}
            label="Update Details"
          />
          <QuickAction
            href="/parent/children"
            icon={CalendarDays}
            label="View Attendance"
          />
          <QuickAction href="/parent/bookings" icon={Phone} label="Contact Us" />
        </div>
      </section>
    </div>
  );
}

// ── Child card ───────────────────────────────────────────

function ChildCard({ child, index }: { child: ParentChild; index: number }) {
  const hasMedical =
    child.medicalConditions.length > 0 || child.allergies.length > 0;
  const { attended, total } = child.attendanceThisWeek;

  return (
    <Link
      href={`/parent/children/${child.id}`}
      className="block bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df] hover:shadow-md hover:border-[#004E64]/20 transition-all active:scale-[0.99]"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-heading font-semibold text-[#1a1a2e] truncate">
              {child.firstName} {child.lastName}
            </h3>
            {hasMedical && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-semibold"
                aria-label="Has medical conditions"
              >
                <AlertCircle className="w-3 h-3" />
                Medical
              </span>
            )}
          </div>
          {child.yearLevel && (
            <p className="text-sm text-[#7c7c8a] mt-0.5">{child.yearLevel}</p>
          )}
          <p className="text-xs text-[#7c7c8a] mt-0.5">{child.serviceName}</p>
        </div>
        <ChevronRight className="w-5 h-5 text-[#7c7c8a] flex-shrink-0 mt-0.5" />
      </div>

      {/* Attendance dots */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-[#7c7c8a]">This week:</span>
        <div className="flex gap-1">
          {Array.from({ length: total }, (_, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full ${
                i < attended ? "bg-green-500" : "bg-[#e8e4df]"
              }`}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-[#1a1a2e]">
          {attended} of {total} days
        </span>
      </div>
    </Link>
  );
}

// ── Quick action button ──────────────────────────────────

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1.5 bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df] hover:shadow-md hover:border-[#004E64]/20 transition-all active:scale-[0.98] min-h-[80px] justify-center"
    >
      <Icon className="w-5 h-5 text-[#004E64]" />
      <span className="text-xs font-medium text-[#1a1a2e] text-center leading-tight">
        {label}
      </span>
    </Link>
  );
}

// ── Skeleton ─────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div>
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
