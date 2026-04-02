"use client";

import Link from "next/link";
import {
  ChevronRight,
  AlertCircle,
  FileEdit,
  CalendarDays,
  Phone,
  MessageCircle,
  Calendar,
} from "lucide-react";
import {
  useParentProfile,
  useParentBookings,
  useParentConversations,
  useParentOnboarding,
  type ParentChild,
} from "@/hooks/useParentPortal";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

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

      {/* Onboarding banner */}
      <OnboardingBanner />

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

      {/* Upcoming Sessions */}
      <UpcomingSessionsWidget />

      {/* Recent Messages */}
      <RecentMessagesWidget />

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
          <QuickAction href="/parent/messages" icon={MessageCircle} label="Messages" />
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

// ── Upcoming Sessions Widget ────────────────────────────

const SESSION_LABELS: Record<string, string> = {
  bsc: "BSC",
  asc: "ASC",
  vc: "VC",
};

function UpcomingSessionsWidget() {
  const { data } = useParentBookings("upcoming");
  const bookings = (data?.bookings ?? [])
    .filter((b) => b.status === "confirmed" || b.status === "requested")
    .slice(0, 3);

  if (bookings.length === 0) return null;

  return (
    <section aria-label="Upcoming sessions">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-heading font-semibold text-[#7c7c8a] uppercase tracking-wider">
          Upcoming Sessions
        </h2>
        <Link href="/parent/bookings" className="text-xs font-medium text-[#004E64] hover:text-[#0A7E9E] min-h-[44px] flex items-center">
          View all
        </Link>
      </div>
      <div className="space-y-2">
        {bookings.map((b) => {
          const d = new Date(b.date);
          const dayName = d.toLocaleDateString("en-AU", { weekday: "short" });
          const dateNum = d.getDate();
          const month = d.toLocaleDateString("en-AU", { month: "short" });

          return (
            <div key={b.id} className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm border border-[#e8e4df]">
              <div className="w-11 h-11 rounded-lg bg-[#004E64]/10 flex flex-col items-center justify-center shrink-0">
                <span className="text-[10px] font-semibold text-[#004E64] uppercase">{dayName}</span>
                <span className="text-sm font-bold text-[#004E64] leading-none">{dateNum}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1a1a2e] truncate">
                  {b.child.firstName} — {SESSION_LABELS[b.sessionType] ?? b.sessionType.toUpperCase()}
                </p>
                <p className="text-xs text-[#7c7c8a] truncate">{b.service.name} · {month}</p>
              </div>
              <span className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0",
                b.status === "confirmed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
              )}>
                {b.status === "confirmed" ? "Confirmed" : "Requested"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Recent Messages Widget ──────────────────────────────

function RecentMessagesWidget() {
  const { data } = useParentConversations();
  const conversations = (data ?? []).slice(0, 2);

  if (conversations.length === 0) return null;

  return (
    <section aria-label="Recent messages">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-heading font-semibold text-[#7c7c8a] uppercase tracking-wider">
          Recent Messages
        </h2>
        <Link href="/parent/messages" className="text-xs font-medium text-[#004E64] hover:text-[#0A7E9E] min-h-[44px] flex items-center">
          View all
        </Link>
      </div>
      <div className="space-y-2">
        {conversations.map((conv) => {
          const isUnread = conv.lastMessage?.direction === "outbound" &&
            (conv.status === "open" || conv.status === "new");

          return (
            <Link
              key={conv.id}
              href={`/parent/messages/${conv.id}`}
              className={cn(
                "block bg-white rounded-xl p-3 shadow-sm border transition-all hover:shadow-md active:scale-[0.99]",
                isUnread ? "border-[#004E64]/30" : "border-[#e8e4df]"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={cn("text-sm truncate", isUnread ? "font-bold text-[#1a1a2e]" : "font-medium text-[#1a1a2e]")}>
                  {conv.subject ?? "No subject"}
                </p>
                {isUnread && <span className="w-2 h-2 rounded-full bg-[#004E64] shrink-0" />}
              </div>
              {conv.lastMessage && (
                <p className="text-xs text-[#7c7c8a] mt-0.5 truncate">
                  {conv.lastMessage.direction === "inbound" ? "You: " : "Centre: "}
                  {conv.lastMessage.preview}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ── Onboarding Banner ───────────────────────────────────

function OnboardingBanner() {
  const { data: onboarding } = useParentOnboarding();
  if (!onboarding) return null;

  const { completedCount, totalCount } = onboarding;
  if (completedCount >= totalCount) return null; // All done, hide banner

  const pct = Math.round((completedCount / totalCount) * 100);

  return (
    <Link
      href="/parent/getting-started"
      className="block bg-gradient-to-r from-[#004E64] to-[#006B87] rounded-xl p-4 shadow-md hover:shadow-lg transition-all active:scale-[0.99]"
    >
      <div className="flex items-center justify-between text-white">
        <div>
          <p className="text-sm font-semibold">
            Get set up — {completedCount} of {totalCount} steps done
          </p>
          <p className="text-xs text-white/70 mt-0.5">
            Complete your setup to get the most out of the app.
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-white/70 shrink-0" />
      </div>
      <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#FECE00] rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
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
