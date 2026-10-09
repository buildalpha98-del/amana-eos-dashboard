"use client";

/**
 * Staff → Roster: OWNA's "Build Roster" (Daniel's screenshot + approved
 * mock-up, 2026-10-09). Rooms down the side, days across; each room/day
 * shows staff rostered / required / children booked, then the shift cards.
 * Tap "+" to add a shift for that room and day, a card to edit it.
 *
 * Same data and actions as the per-person weekly grid (roster shifts,
 * bookings, cost projection, publish, copy last week); this is the layout
 * a Coordinator plans in. Tabs: Build roster · Staff summary · Shift
 * requests · Settings.
 */
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { serviceTodayISO } from "@/lib/timezone";
import { isAdminRole } from "@/lib/role-permissions";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { WeekPicker, currentWeekStartIso } from "@/components/roster/WeekPicker";
import { ShiftEditModal } from "@/components/roster/ShiftEditModal";
import { RosterCoordinatorPanel } from "@/components/roster/RosterCoordinatorPanel";
import { ServiceWeeklyShiftsGrid } from "@/components/services/ServiceWeeklyShiftsGrid";
import { useRosterShifts, type RosterShiftListItem } from "@/hooks/useRosterShifts";
import { useRoster } from "@/hooks/useRoster";
import { useRosterCost } from "@/hooks/useRosterCost";
import { useServiceRooms } from "@/hooks/useServiceRooms";
import { useOpenShifts } from "@/hooks/useOpenShifts";

type Tab = "build" | "person" | "summary" | "requests" | "settings";

const DAY_MS = 86_400_000;
const isoAdd = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const hours = (s: { shiftStart: string; shiftEnd: string }) => {
  const [a, b] = [s.shiftStart, s.shiftEnd].map((t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  });
  return Math.max(0, (b - a + (b < a ? 1440 : 0)) / 60);
};
const AUD = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

interface AppSettingsResponse {
  settings: Record<string, unknown> & {
    roster: { shiftPresets: { start: string; end: string }[]; weeklyCostLimit: number | null };
  };
}

export function BuildRoster({ serviceId }: { serviceId: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const canEdit = isAdminRole(role) || (role === "member" && session?.user?.serviceId === serviceId);
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(currentWeekStartIso);
  const [tab, setTab] = useState<Tab>("build");
  // Phone shows one day at a time; open on today when it's in this week.
  const [phoneDay, setPhoneDay] = useState(() => {
    const i = Math.round((Date.parse(`${serviceTodayISO()}T00:00:00Z`) - Date.parse(`${currentWeekStartIso()}T00:00:00Z`)) / DAY_MS);
    return i >= 0 && i < 5 ? i : 0;
  });
  const [modal, setModal] = useState<
    { mode: "create"; date: string; sessionType: string } | { mode: "edit"; shift: RosterShiftListItem } | null
  >(null);

  const { data: shiftsData, isLoading, refetch } = useRosterShifts(serviceId, weekStart);
  const { data: bookings } = useRoster(serviceId, weekStart);
  const { data: cost } = useRosterCost(serviceId, weekStart, canEdit);
  const { data: roomsData } = useServiceRooms(serviceId);
  const { data: open } = useOpenShifts(28);
  const { data: settingsData } = useQuery<AppSettingsResponse>({
    queryKey: ["service", serviceId, "app-settings"],
    queryFn: () => fetchApi(`/api/services/${serviceId}/app-settings`),
    staleTime: 60_000,
  });
  const presets = settingsData?.settings.roster?.shiftPresets ?? [];
  const costLimit = settingsData?.settings.roster?.weeklyCostLimit ?? null;

  const shifts = useMemo(() => shiftsData?.shifts ?? [], [shiftsData]);
  const rooms = (roomsData?.rooms ?? []).filter((r) => r.legacyKey);
  const weekdays = Array.from({ length: 5 }, (_, i) => isoAdd(weekStart, i));
  const weekend = [isoAdd(weekStart, 5), isoAdd(weekStart, 6)].filter(
    (d) => shifts.some((s) => s.date.slice(0, 10) === d) || Object.values(bookings?.[d] ?? {}).some((c) => c.length > 0),
  );
  const days = [...weekdays, ...weekend];

  const interestBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of open?.shifts ?? []) m.set(s.id, s.interestedCount ?? 0);
    return m;
  }, [open]);

  const totalShifts = shifts.length;
  const totalHours = shifts.reduce((n, s) => n + hours(s), 0);
  const totalBooked = days.reduce(
    (n, d) => n + Object.values(bookings?.[d] ?? {}).reduce((k, c) => k + c.length, 0),
    0,
  );
  const drafts = shifts.filter((s) => s.status === "draft").length;
  const overBudget = costLimit != null && cost?.totalCost != null && cost.totalCost > costLimit;

  const publish = useMutation({
    mutationFn: () => mutateApi<{ publishedCount: number; notificationsSent: number }>("/api/roster/publish", { method: "POST", body: { serviceId, weekStart } }),
    onSuccess: (r) => {
      toast({
        description: `Published ${r.publishedCount} shift${r.publishedCount === 1 ? "" : "s"}. ${r.notificationsSent} ${r.notificationsSent === 1 ? "person" : "people"} told.`,
      });
      void refetch();
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });
  const copy = useMutation({
    mutationFn: () =>
      mutateApi<{ created?: number }>("/api/roster/copy-week", {
        method: "POST",
        body: { serviceId, sourceWeekStart: isoAdd(weekStart, -7), targetWeekStart: weekStart },
      }),
    onSuccess: () => {
      toast({ description: "Last week's shifts copied in as drafts. Check them, then Publish." });
      void refetch();
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  type Room = (typeof rooms)[number];
  const renderCell = (room: Room, d: string) => {
    const key = room.legacyKey!;
    const perChildren = Number((room.ratio ?? "1:15").split(":")[1]) || 15;
    const cell = shifts.filter((s) => s.date.slice(0, 10) === d && s.sessionType === key);
    const staffed = cell.filter((s) => s.userId).length;
    const booked = bookings?.[d]?.[key]?.length ?? 0;
    const required = booked ? Math.ceil(booked / perChildren) : 0;
    const short = staffed < required;
    return (
      <>
        <p className={cn("mb-1.5 text-2xs tabular-nums", short ? "font-bold text-red-700 dark:text-red-300" : "text-muted")}>
          {staffed} staff / {required} req / {booked} booked
        </p>
        <div className="space-y-1.5">
          {cell.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={!canEdit}
              onClick={() => setModal({ mode: "edit", shift: s })}
              className={cn(
                "block w-full rounded-md border-l-4 px-2 py-1.5 text-left text-xs",
                !s.userId
                  ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40"
                  : s.status === "draft"
                    ? "border-dashed border-brand/50 bg-surface"
                    : "border-brand bg-brand/5",
              )}
            >
              <span className="block font-semibold text-foreground">
                {s.userId ? (s.user?.name ?? s.staffName) : "Open shift"}
              </span>
              <span className="text-muted">
                {s.shiftStart}–{s.shiftEnd}
                {s.status === "draft" ? " · draft" : ""}
              </span>
              {!s.userId && (interestBy.get(s.id) ?? 0) > 0 && (
                <span className="block font-semibold text-amber-800 dark:text-amber-200">
                  {interestBy.get(s.id)} interested
                </span>
              )}
            </button>
          ))}
          {canEdit && (
            <button
              type="button"
              onClick={() => setModal({ mode: "create", date: d, sessionType: key })}
              aria-label={`Add a shift: ${room.name}, ${dayLabel(d)}`}
              className="grid min-h-9 w-full place-items-center rounded-md border border-dashed border-border text-muted hover:bg-surface"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </>
    );
  };

  const TABS: { key: Tab; label: string; show: boolean }[] = [
    { key: "build", label: "Build roster", show: true },
    { key: "person", label: "By person", show: true },
    { key: "summary", label: "Staff summary", show: true },
    { key: "requests", label: "Shift requests", show: canEdit },
    { key: "settings", label: "Settings", show: canEdit },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Roster">
        {TABS.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px min-h-11 whitespace-nowrap border-b-2 px-4 text-sm font-semibold",
              tab === t.key ? "border-brand text-brand" : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <WeekPicker weekStart={weekStart} onWeekChange={setWeekStart} />
        <span
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-semibold",
            totalShifts === 0
              ? "bg-surface text-muted"
              : drafts > 0
                ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                : "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200",
          )}
        >
          {totalShifts === 0 ? "No shifts yet" : drafts > 0 ? `Draft · ${drafts} not published` : "Published"}
        </span>
        {canEdit && (
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => copy.mutate()} loading={copy.isPending}>
              Copy last week
            </Button>
            <Button size="sm" onClick={() => publish.mutate()} loading={publish.isPending} disabled={drafts === 0}>
              Publish
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Total shifts" value={String(totalShifts)} />
        <Stat label="Staff hours" value={totalHours.toFixed(2)} />
        {canEdit && (
          <Stat
            label={costLimit != null ? `Cost · limit ${AUD.format(costLimit)}` : "Cost (estimate)"}
            value={cost ? AUD.format(cost.totalCost) : "—"}
            warn={overBudget}
          />
        )}
        <Stat label="Bookings per staff hour" value={totalHours ? (totalBooked / totalHours).toFixed(2) : "—"} />
      </div>

      {tab === "build" &&
        (isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <>
            {/* Phone: one day at a time, rooms as cards. */}
            <div className="space-y-3 md:hidden">
              <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Day">
                {days.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    role="tab"
                    aria-selected={phoneDay === i}
                    onClick={() => setPhoneDay(i)}
                    className={cn(
                      "min-h-11 whitespace-nowrap rounded-lg px-3 text-sm font-semibold",
                      phoneDay === i ? "bg-brand text-white" : "bg-card text-foreground border border-border",
                    )}
                  >
                    {dayLabel(d).replace(",", "").split(" ").slice(0, 2).join(" ")}
                  </button>
                ))}
              </div>
              {rooms.map((room) => (
                <section key={room.id} className="rounded-xl border border-border bg-card p-3">
                  <h3 className="mb-1 font-heading font-semibold text-brand">{room.name}</h3>
                  {renderCell(room, days[Math.min(phoneDay, days.length - 1)])}
                </section>
              ))}
            </div>
            {/* Tablet and up: rooms × days, like OWNA. */}
            <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
              <table className="w-full min-w-[760px] border-collapse bg-card text-sm">
                <thead>
                  <tr>
                    <th className="w-36 border-b border-border bg-surface px-3 py-2 text-left font-semibold">Rooms</th>
                    {days.map((d) => (
                      <th key={d} className="border-b border-l border-border bg-surface px-2 py-2 text-left font-semibold">
                        {dayLabel(d)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr key={room.id}>
                      <th className="border-b border-border px-3 py-2 text-left align-top font-semibold text-brand">{room.name}</th>
                      {days.map((d) => (
                        <td key={d} className="border-b border-l border-border px-2 py-2 align-top">
                          {renderCell(room, d)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ))}

      {tab === "person" && <ServiceWeeklyShiftsGrid serviceId={serviceId} weekStart={weekStart} onWeekChange={setWeekStart} />}
      {tab === "summary" && <StaffSummary shifts={shifts} />}
      {tab === "requests" && canEdit && <RosterCoordinatorPanel serviceId={serviceId} weekStart={weekStart} />}
      {tab === "settings" && canEdit && settingsData && (
        <RosterSettings serviceId={serviceId} settings={settingsData.settings} onSaved={() => qc.invalidateQueries({ queryKey: ["service", serviceId, "app-settings"] })} />
      )}

      {modal && (
        <ShiftEditModal
          open
          mode={modal.mode}
          serviceId={serviceId}
          shift={
            modal.mode === "edit"
              ? {
                  id: modal.shift.id,
                  userId: modal.shift.userId,
                  date: modal.shift.date.slice(0, 10),
                  sessionType: modal.shift.sessionType,
                  shiftStart: modal.shift.shiftStart,
                  shiftEnd: modal.shift.shiftEnd,
                  role: modal.shift.role,
                  staffName: modal.shift.staffName,
                }
              : undefined
          }
          defaultDate={modal.mode === "create" ? modal.date : undefined}
          defaultSessionType={modal.mode === "create" ? modal.sessionType : undefined}
          presets={presets}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void refetch();
            qc.invalidateQueries({ queryKey: ["roster-cost"] });
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        warn ? "border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30" : "border-border bg-card",
      )}
    >
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("font-heading text-xl font-semibold tabular-nums", warn ? "text-red-700 dark:text-red-300" : "text-brand")}>
        {value}
      </p>
    </div>
  );
}

function StaffSummary({ shifts }: { shifts: RosterShiftListItem[] }) {
  const rows = useMemo(() => {
    const m = new Map<string, { name: string; shifts: number; hours: number; days: Set<string> }>();
    for (const s of shifts) {
      if (!s.userId) continue;
      const r = m.get(s.userId) ?? { name: s.user?.name ?? s.staffName, shifts: 0, hours: 0, days: new Set<string>() };
      r.shifts += 1;
      r.hours += hours(s);
      r.days.add(s.date.slice(0, 10));
      m.set(s.userId, r);
    }
    return [...m.values()].sort((a, b) => b.hours - a.hours);
  }, [shifts]);
  if (rows.length === 0) return <p className="text-sm text-muted">Nobody rostered this week yet.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[420px] bg-card text-sm">
        <thead>
          <tr className="bg-surface text-left">
            <th className="px-3 py-2 font-semibold">Staff</th>
            <th className="px-3 py-2 font-semibold">Shifts</th>
            <th className="px-3 py-2 font-semibold">Days</th>
            <th className="px-3 py-2 font-semibold">Hours</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-border">
              <td className="px-3 py-2 font-medium text-foreground">{r.name}</td>
              <td className="px-3 py-2 tabular-nums">{r.shifts}</td>
              <td className="px-3 py-2 tabular-nums">{r.days.size}</td>
              <td className="px-3 py-2 tabular-nums">{r.hours.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RosterSettings({
  serviceId,
  settings,
  onSaved,
}: {
  serviceId: string;
  settings: AppSettingsResponse["settings"];
  onSaved: () => void;
}) {
  const [presets, setPresets] = useState(settings.roster?.shiftPresets ?? []);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [limit, setLimit] = useState(settings.roster?.weeklyCostLimit?.toString() ?? "");
  const save = useMutation({
    mutationFn: () =>
      mutateApi(`/api/services/${serviceId}/app-settings`, {
        method: "PATCH",
        // The route stores the whole settings object; send everything back
        // with the roster part changed.
        body: {
          ...settings,
          roster: { shiftPresets: presets, weeklyCostLimit: limit.trim() ? Math.round(Number(limit)) : null },
        },
      }),
    onSuccess: () => {
      toast({ description: "Roster settings saved." });
      onSaved();
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h3 className="font-heading font-semibold text-foreground">Usual shift times</h3>
        <p className="text-sm text-muted">Shown as one-tap buttons when you add a shift.</p>
        <div className="flex flex-wrap gap-2">
          {presets.length === 0 && <span className="text-sm text-muted">None yet.</span>}
          {presets.map((p) => (
            <span key={`${p.start}-${p.end}`} className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm">
              {p.start}–{p.end}
              <button
                type="button"
                aria-label={`Remove ${p.start} to ${p.end}`}
                onClick={() => setPresets(presets.filter((x) => x !== p))}
                className="text-muted hover:text-foreground"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            Start
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 block min-h-11 rounded-lg border border-border bg-card px-2" />
          </label>
          <label className="text-sm">
            End
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 block min-h-11 rounded-lg border border-border bg-card px-2" />
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={!start || !end}
            onClick={() => {
              setPresets([...presets, { start, end }]);
              setStart("");
              setEnd("");
            }}
          >
            Add
          </Button>
        </div>
      </section>
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h3 className="font-heading font-semibold text-foreground">Weekly cost limit</h3>
        <p className="text-sm text-muted">The cost turns red on Build roster when the week goes over this. Leave blank for none.</p>
        <label className="block text-sm">
          Limit ($ per week)
          <input
            inputMode="numeric"
            value={limit}
            onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ""))}
            className="mt-1 block min-h-11 w-40 rounded-lg border border-border bg-card px-3"
          />
        </label>
        <p className="text-xs text-muted">
          Room fees for forecasting are set in Configure → Rooms. Required qualifications are set by head office.
        </p>
      </section>
      <div className="md:col-span-2">
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          Save roster settings
        </Button>
      </div>
    </div>
  );
}
