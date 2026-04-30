import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/role-permissions";
import { logger } from "@/lib/logger";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MyWeekShifts } from "@/components/roster/MyWeekShifts";

/**
 * Returns the Monday of the ISO week that the given date falls in, as YYYY-MM-DD.
 * Matches `ServiceWeeklyShiftsGrid.getMondayIso()` — Sunday is treated as the
 * trailing end of the previous week (offset -6) and any other day rewinds to
 * Monday.
 */
function mondayIso(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function formatRange(monday: string): string {
  const start = new Date(monday);
  const end = new Date(monday);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${start.toLocaleDateString("en-AU", opts)} – ${end.toLocaleDateString(
    "en-AU",
    { ...opts, year: "numeric" },
  )}`;
}

function formatDateShort(d: Date): string {
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function canViewTarget(
  viewerId: string,
  viewerRole: string | null,
  target: { id: string; serviceId: string | null },
): Promise<boolean> {
  if (viewerId === target.id) return true;
  if (isAdminRole(viewerRole)) return true;
  if (viewerRole === "member") {
    const viewer = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { serviceId: true },
    });
    return !!viewer?.serviceId && viewer.serviceId === target.serviceId;
  }
  return false;
}

interface PageProps {
  searchParams: Promise<{ weekStart?: string; userId?: string }>;
}

export default async function RosterMePage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const sp = (await searchParams) ?? {};
  const viewerRole = session.user.role ?? null;
  const targetUserId = sp.userId && sp.userId.length > 0 ? sp.userId : session.user.id;

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, serviceId: true },
  });

  if (!targetUser) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-lg font-semibold text-foreground">User not found</h1>
          <p className="text-sm text-muted mt-2">
            The user you requested does not exist.
          </p>
        </div>
      </div>
    );
  }

  const allowed = await canViewTarget(session.user.id, viewerRole, {
    id: targetUser.id,
    serviceId: targetUser.serviceId,
  });

  if (!allowed) {
    logger.warn("Roster /me access denied", {
      viewerId: session.user.id,
      viewerRole,
      targetId: targetUserId,
    });
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-lg font-semibold text-foreground">Access denied</h1>
          <p className="text-sm text-muted mt-2">
            You don&apos;t have permission to view this roster.
          </p>
        </div>
      </div>
    );
  }

  const weekStart =
    sp.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(sp.weekStart)
      ? sp.weekStart
      : mondayIso(new Date());

  const prevWeek = addDaysIso(weekStart, -7);
  const nextWeek = addDaysIso(weekStart, 7);
  const thisWeek = mondayIso(new Date());

  const isSelf = session.user.id === targetUser.id;

  // Pending swap requests targeted at this user.
  const pendingSwaps = await prisma.shiftSwapRequest.findMany({
    where: { targetId: targetUser.id, status: "proposed" },
    orderBy: { createdAt: "desc" },
    include: {
      proposer: { select: { id: true, name: true } },
      shift: {
        select: {
          id: true,
          date: true,
          shiftStart: true,
          shiftEnd: true,
          sessionType: true,
          staffName: true,
          role: true,
        },
      },
    },
    take: 20,
  });

  const query = (start: string) => {
    const params = new URLSearchParams();
    params.set("weekStart", start);
    if (!isSelf) params.set("userId", targetUserId);
    return `/roster/me?${params.toString()}`;
  };

  return (
    <div className="p-6 md:p-10 space-y-6">
      <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-heading font-semibold text-foreground tracking-tight">
            {isSelf ? "My Roster" : `${targetUser.name}'s Roster`}
          </h1>
          <p className="text-sm text-muted mt-1">
            Week of {formatRange(weekStart)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={query(prevWeek)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface transition-colors"
            aria-label="Previous week"
          >
            ← Prev
          </Link>
          <Link
            href={query(thisWeek)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface transition-colors"
          >
            This week
          </Link>
          <Link
            href={query(nextWeek)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface transition-colors"
            aria-label="Next week"
          >
            Next →
          </Link>
        </div>
      </div>

      {/* Only render the week view when we're viewing self. The API at
          /api/roster/shifts/mine is always self-scoped, so if an admin is
          viewing another staff's roster we surface a note instead of silently
          querying the admin's own shifts. A future chunk can provide an
          admin-scoped endpoint if this view is extended. */}
      {isSelf ? (
        <MyWeekShifts userId={targetUserId} weekStart={weekStart} />
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted">
          <p>
            Only staff can view their own week on this page. For
            administrative roster views, use the service&apos;s Weekly Roster tab.
          </p>
        </div>
      )}

      <section
        className="rounded-xl border border-border bg-card p-5"
        data-testid="pending-swap-requests"
      >
        <h2 className="text-base font-semibold text-foreground mb-3">
          Pending swap requests for you
        </h2>
        {pendingSwaps.length === 0 ? (
          <p className="text-sm text-muted">No pending swap requests.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr>
                  <th className="text-left py-2 pr-3 font-medium">From</th>
                  <th className="text-left py-2 pr-3 font-medium">Shift</th>
                  <th className="text-left py-2 pr-3 font-medium">Date</th>
                  <th className="text-left py-2 pr-3 font-medium">Time</th>
                  <th className="text-left py-2 pr-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pendingSwaps.map((swap) => (
                  <tr key={swap.id} data-testid={`swap-${swap.id}`}>
                    <td className="py-2 pr-3 text-foreground">
                      {swap.proposer?.name ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-foreground/80">
                      {swap.shift?.staffName ?? "—"}
                      {swap.shift?.role ? ` · ${swap.shift.role}` : ""}
                    </td>
                    <td className="py-2 pr-3 text-muted">
                      {swap.shift?.date ? formatDateShort(swap.shift.date) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-muted">
                      {swap.shift?.shiftStart}–{swap.shift?.shiftEnd}
                    </td>
                    <td className="py-2 pr-3 text-muted">
                      {swap.reason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
