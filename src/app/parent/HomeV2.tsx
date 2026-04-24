"use client";

import Link from "next/link";
import { Plus, CreditCard, Utensils, HelpCircle, ChevronRight } from "lucide-react";
import {
  useParentProfile,
  useParentBookings,
  useParentConversations,
  useParentOnboarding,
} from "@/hooks/useParentPortal";
import {
  Avatar,
  KidPill,
  SessionCard,
  SectionLabel,
  WarmCTA,
  type StatusVariant,
} from "@/components/parent/ui";
import { TimelineWidget } from "@/components/parent/TimelineWidget";
import { InstallBanner } from "@/components/parent/InstallBanner";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import {
  getGreetingSubline,
  type GreetingBooking,
  type GreetingChild,
} from "./utils/greeting";

export default function ParentHomeV2() {
  const { data: profile, isLoading, error } = useParentProfile();
  const { data: bookingsData } = useParentBookings("upcoming");
  const { data: conversations } = useParentConversations();
  const { data: onboarding } = useParentOnboarding();

  if (isLoading) return <HomeSkeleton />;

  if (error || !profile) {
    return (
      <div className="text-center py-12">
        <p className="text-[color:var(--color-muted)] text-sm">
          Couldn&apos;t load your dashboard. Try again in a moment.
        </p>
      </div>
    );
  }

  // ── Greeting ────────────────────────────────────────────
  const now = new Date();
  const greetingChildren: GreetingChild[] = profile.children.map((c) => ({
    firstName: c.firstName,
  }));
  const greetingBookings: GreetingBooking[] = (bookingsData?.bookings ?? []).map((b) => ({
    date: b.date,
    sessionType: b.sessionType,
    status: b.status,
  }));
  const subline = getGreetingSubline({
    children: greetingChildren,
    bookings: greetingBookings,
    now,
  });

  // ── Upcoming sessions (next 5 confirmed/requested) ──────
  const upcoming = (bookingsData?.bookings ?? [])
    .filter((b) => b.status === "confirmed" || b.status === "requested")
    .slice(0, 5);

  // ── Messages (latest 2) ─────────────────────────────────
  const recentConversations = (conversations ?? []).slice(0, 2);
  const unreadCount = (conversations ?? []).reduce(
    (sum, c) => sum + (c.unreadCount ?? 0),
    0,
  );

  // ── Onboarding progress ─────────────────────────────────
  const showOnboarding =
    onboarding && onboarding.completedCount < onboarding.totalCount;

  return (
    <div className="space-y-7">
      {/* PWA install banner — only renders when eligible */}
      <InstallBanner />

      {/* ─── Greeting ─────────────────────────────────── */}
      <header>
        <h1 className="text-[26px] font-heading font-bold text-[color:var(--color-foreground)] leading-tight tracking-[-0.01em]">
          Hi {profile.firstName || "there"}.
        </h1>
        <p className="text-[14px] text-[color:var(--color-muted)] mt-1.5 leading-snug">
          {subline}
        </p>
      </header>

      {/* ─── Onboarding banner ───────────────────────── */}
      {showOnboarding && <OnboardingProgress onboarding={onboarding!} />}

      {/* ─── Kids ─────────────────────────────────────── */}
      <section aria-label="Your children">
        <SectionLabel
          label="Your Children"
          action={
            profile.children.length > 0
              ? { href: "/parent/children", text: "View all" }
              : undefined
          }
        />
        {profile.children.length === 0 ? (
          <EmptyKidsCard />
        ) : (
          <div className="space-y-2.5">
            {profile.children.map((child) => (
              <KidPill
                key={child.id}
                child={{
                  id: child.id,
                  name: `${child.firstName} ${child.lastName}`,
                  subtitle: buildChildSubtitle(child),
                }}
                status={deriveKidStatus(child, upcoming)}
                href={`/parent/children/${child.id}`}
              />
            ))}
          </div>
        )}
      </section>

      {/* ─── Book a casual CTA ───────────────────────── */}
      {profile.children.length > 0 && (
        <WarmCTA
          icon={Plus}
          title="Book a casual session"
          sub="Same day or next week — quick request"
          href="/parent/bookings?new=1"
          tone="brand"
        />
      )}

      {/* ─── This week ────────────────────────────────── */}
      {upcoming.length > 0 && (
        <section aria-label="This week">
          <SectionLabel
            label="This Week"
            action={{ href: "/parent/bookings", text: "View all" }}
          />
          <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
            {upcoming.map((b) => (
              <SessionCard
                key={b.id}
                variant="tile"
                date={new Date(b.date)}
                label={`${b.child.firstName} — ${sessionLabel(b.sessionType)}`}
                sublabel={b.service.name}
                status={b.status === "confirmed" ? "confirmed" : "requested"}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Messages ─────────────────────────────────── */}
      {recentConversations.length > 0 && (
        <section aria-label="Messages">
          <SectionLabel
            label={unreadCount > 0 ? `Messages · ${unreadCount} new` : "Messages"}
            action={{ href: "/parent/messages", text: "View all" }}
          />
          <div className="space-y-2">
            {recentConversations.map((conv) => {
              const isUnread = (conv.unreadCount ?? 0) > 0;
              return (
                <Link
                  key={conv.id}
                  href={`/parent/messages/${conv.id}`}
                  className={cn(
                    "warm-card flex items-start gap-3 hover:shadow-[var(--shadow-warm-md)] transition-shadow",
                    isUnread &&
                      "border-l-[3px] border-l-[color:var(--color-accent)] pl-[13px]",
                  )}
                >
                  <Avatar name={conv.subject ?? "Centre"} size="md" seed={conv.id} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className={cn(
                          "text-sm truncate",
                          isUnread
                            ? "font-bold text-[color:var(--color-foreground)]"
                            : "font-semibold text-[color:var(--color-foreground)]",
                        )}
                      >
                        {conv.subject ?? "No subject"}
                      </p>
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-[color:var(--color-accent)] shrink-0" />
                      )}
                    </div>
                    {conv.lastMessage && (
                      <p className="text-xs text-[color:var(--color-muted)] mt-0.5 truncate">
                        {conv.lastMessage.senderType === "parent" ? "You: " : ""}
                        {conv.lastMessage.preview}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── Quick actions ────────────────────────────── */}
      <section aria-label="Quick actions">
        <SectionLabel label="Quick Actions" />
        <div className="grid grid-cols-3 gap-2.5">
          <QuickAction href="/parent/children" icon={Utensils} label="Today's menu" />
          <QuickAction href="/parent/billing" icon={CreditCard} label="Pay" />
          <QuickAction href="/parent/account" icon={HelpCircle} label="Help" />
        </div>
      </section>

      {/* ─── Timeline from centre (read-only for now; Chunk 7 adds engagement) ─── */}
      <TimelineWidget />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────

const SESSION_LABELS: Record<"bsc" | "asc" | "vc", string> = {
  bsc: "BSC",
  asc: "ASC",
  vc: "VC",
};

function sessionLabel(kind: "bsc" | "asc" | "vc"): string {
  return SESSION_LABELS[kind];
}

function buildChildSubtitle(child: {
  yearLevel: string | null;
  serviceName: string;
  medicalConditions: string[];
  allergies: string[];
}): string {
  const parts: string[] = [];
  if (child.yearLevel) parts.push(child.yearLevel);
  if (child.serviceName) parts.push(child.serviceName);
  const bits = parts.join(" · ");
  const hasMedical = child.medicalConditions.length > 0 || child.allergies.length > 0;
  return hasMedical ? `${bits} · Medical on file` : bits;
}

function deriveKidStatus(
  child: { id: string },
  upcoming: Array<{ child: { id: string }; status: string; date: string }>,
): StatusVariant | undefined {
  const today = new Date().toISOString().slice(0, 10);
  const todayBooking = upcoming.find(
    (b) => b.child.id === child.id && b.date === today,
  );
  if (!todayBooking) return undefined;
  if (todayBooking.status === "confirmed") return "confirmed";
  return "requested";
}

// ───────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────

function OnboardingProgress({
  onboarding,
}: {
  onboarding: { completedCount: number; totalCount: number };
}) {
  const pct = Math.round((onboarding.completedCount / onboarding.totalCount) * 100);
  return (
    <Link
      href="/parent/getting-started"
      className="block rounded-[var(--radius-lg)] p-4 bg-gradient-to-r from-[color:var(--color-brand)] to-[#006B87] shadow-[var(--shadow-warm-md)] hover:shadow-[var(--shadow-warm-lg)] transition-shadow"
    >
      <div className="flex items-center justify-between text-white">
        <div className="flex-1 min-w-0 pr-3">
          <p className="text-sm font-semibold">
            Get set up — {onboarding.completedCount} of {onboarding.totalCount} steps
          </p>
          <p className="text-xs text-white/70 mt-0.5 leading-snug">
            Finish setting up to get the most out of the portal.
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-white/70 shrink-0" />
      </div>
      <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-[color:var(--color-accent)] rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  );
}

function EmptyKidsCard() {
  return (
    <div className="warm-card text-center py-6">
      <p className="text-sm text-[color:var(--color-muted)]">
        No children yet. Contact your centre to get started.
      </p>
    </div>
  );
}

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
      className="warm-card flex flex-col items-center justify-center gap-1.5 min-h-[88px] text-center hover:shadow-[var(--shadow-warm-md)] transition-shadow"
    >
      <Icon className="w-5 h-5 text-[color:var(--color-brand)]" />
      <span className="text-xs font-semibold text-[color:var(--color-foreground)]">
        {label}
      </span>
    </Link>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-7">
      <div>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div>
        <Skeleton className="h-4 w-28 mb-3" />
        <div className="space-y-2.5">
          <Skeleton className="h-[76px] rounded-[var(--radius-lg)]" />
          <Skeleton className="h-[76px] rounded-[var(--radius-lg)]" />
        </div>
      </div>
      <Skeleton className="h-[72px] rounded-[var(--radius-lg)]" />
    </div>
  );
}
