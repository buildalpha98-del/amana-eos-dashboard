import type { User, Service } from "@prisma/client";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { ShiftChip } from "@/components/roster/ShiftChip";
import { Mountain, CheckSquare, CalendarOff, ShieldCheck, Clock } from "lucide-react";
import type { StaffProfileNextShift } from "@/components/staff/StaffProfileTabs";

interface OverviewTabProps {
  targetUser: User & { service?: Service | null };
  stats: {
    activeRocks: number;
    openTodos: number;
    annualLeaveRemaining: number | null;
    validCertCount: number;
    expiringCertCount: number;
  };
  nextShift: StaffProfileNextShift | null;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function tenure(start: Date | null | undefined): string {
  if (!start) return "—";
  const startDate = new Date(start);
  const now = new Date();
  const months =
    (now.getFullYear() - startDate.getFullYear()) * 12 +
    (now.getMonth() - startDate.getMonth());
  if (months < 1) return "New";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (remMonths === 0) return `${years} year${years === 1 ? "" : "s"}`;
  return `${years}y ${remMonths}m`;
}

export function OverviewTab({ targetUser, stats, nextShift }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Hero card */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <StaffAvatar
            user={{ id: targetUser.id, name: targetUser.name, avatar: targetUser.avatar }}
            size="lg"
          />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-foreground">{targetUser.name}</h2>
              <RoleBadge role={targetUser.role} />
              {!targetUser.active && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                  Deactivated
                </span>
              )}
            </div>
            <div className="mt-1 text-sm text-muted">{targetUser.email}</div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              {targetUser.service && (
                <span>
                  <span className="font-medium text-foreground">Service:</span>{" "}
                  {targetUser.service.name}
                </span>
              )}
              <span>
                <span className="font-medium text-foreground">Started:</span>{" "}
                {formatDate(targetUser.startDate)}
              </span>
              <span>
                <span className="font-medium text-foreground">Tenure:</span>{" "}
                {tenure(targetUser.startDate)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={Mountain} label="Active rocks" value={stats.activeRocks} />
        <StatCard icon={CheckSquare} label="Open todos" value={stats.openTodos} />
        <StatCard
          icon={CalendarOff}
          label="Annual leave left"
          value={stats.annualLeaveRemaining ?? "—"}
          suffix={stats.annualLeaveRemaining != null ? " days" : ""}
        />
        <StatCard
          icon={ShieldCheck}
          label="Valid certs"
          value={stats.validCertCount}
          sub={stats.expiringCertCount > 0 ? `${stats.expiringCertCount} expiring` : undefined}
        />
        <NextShiftCard nextShift={nextShift} />
      </div>
    </div>
  );
}

function NextShiftCard({ nextShift }: { nextShift: StaffProfileNextShift | null }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-muted">
        <Clock className="w-4 h-4" />
        <span className="text-xs uppercase tracking-wide">Next shift</span>
      </div>
      {nextShift ? (
        <div className="mt-2">
          <div className="text-xs text-muted mb-1">
            {new Date(nextShift.date).toLocaleDateString("en-AU", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </div>
          <ShiftChip
            shift={{
              id: nextShift.id,
              userId: nextShift.userId,
              staffName: nextShift.staffName,
              shiftStart: nextShift.shiftStart,
              shiftEnd: nextShift.shiftEnd,
              sessionType: nextShift.sessionType,
              role: nextShift.role,
              status:
                nextShift.status === "published" ? "published" : "draft",
            }}
          />
        </div>
      ) : (
        <div className="mt-1 text-sm font-medium text-muted">
          No upcoming shifts
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  suffix,
  small,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  suffix?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-muted">
        <Icon className="w-4 h-4" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <div
        className={
          small
            ? "mt-1 text-sm font-medium text-foreground"
            : "mt-1 text-2xl font-semibold text-foreground"
        }
      >
        {value}
        {suffix}
      </div>
      {sub && <div className="text-xs text-amber-700 mt-0.5">{sub}</div>}
    </div>
  );
}
