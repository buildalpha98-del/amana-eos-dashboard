"use client";

/**
 * The door — sign children in and out, and keep the roll (staff-UX
 * Round 3, 2026-10-09).
 *
 * This used to be two screens over the same AttendanceRecords: "Sign In /
 * Out" recorded WHO handed over (Reg 158) but had no absent, no walk-ins,
 * no history; "Roll Call" had all of that but signed out with no name.
 * Staff had to know which one to open. Now there is one, modelled on what
 * centres already know from OWNA:
 *
 *  - a coloured dot per child — orange to arrive, green here, blue gone
 *    home, red absent — and the same colours on the filter chips;
 *  - sign-in is ONE tap for the afternoon programme (children come from
 *    class, educators collect them) and asks who's dropping off otherwise;
 *  - sign-out ALWAYS asks who is collecting, plus a signature when the
 *    centre's Sign in & out setting wants one;
 *  - absent is one tap, with Undo right there on the row;
 *  - the whole programme can be signed in or out at once, with a note for
 *    the register saying who did the hand-over.
 *
 * Rows stay in name order whatever happens to them — a list that reshuffles
 * every time someone is signed in is how the wrong child gets tapped.
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  LogIn,
  LogOut,
  UserX,
  Undo2,
  Search,
  Users,
  MoreVertical,
  StickyNote,
  Loader2,
  Plus,
  Camera,
  Check,
  Sparkles,
  ChevronDown,
  ChevronRight,
  PenLine,
} from "lucide-react";
import {
  useRollCall,
  useUpdateRollCall,
  useBulkRollCall,
  useSendFirstDayPhoto,
  uploadFirstDayPhoto,
  type RollCallEntry,
  type RollCallAction,
} from "@/hooks/useRollCall";
import { toast } from "@/hooks/useToast";
import { useChildren } from "@/hooks/useChildren";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { MedicalAlertBadge } from "@/components/children/MedicalAlertBadge";
import { CustodyChip } from "@/components/children/CustodyChip";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { ServiceWeeklyRollCallGrid } from "./ServiceWeeklyRollCallGrid";
import { ServiceMonthlyRollCallView } from "./ServiceMonthlyRollCallView";
import { SignDialog, BulkDialog } from "./DoorDialogs";
import { cn } from "@/lib/utils";
import { useEscapeClose } from "@/hooks/useEscapeClose";
import { useServiceRooms } from "@/hooks/useServiceRooms";
import { serviceTodayISO } from "@/lib/timezone";

type RollCallView = "daily" | "weekly" | "monthly";

// ── Types & Constants ────────────────────────────────────

interface ServiceRollCallTabProps {
  serviceId: string;
  serviceName?: string;
}

/**
 * Fallback only, for the walk-in dialog heading before the rooms have
 * loaded. There is no label MAP here any more: the tab row and the
 * heading both use the room record's own name, which is what staff call
 * it. See docs/rooms-migration-plan.md, Stage 2.
 */
const slotCode = (s: string) => s.toUpperCase();

/** Where a child is at, in the door's four colours. */
export type DoorState = "arriving" | "here" | "gone" | "absent";

export function doorState(e: Pick<RollCallEntry, "status" | "signOutTime">): DoorState {
  if (e.status === "absent") return "absent";
  if (e.status === "present") return e.signOutTime ? "gone" : "here";
  return "arriving";
}

const DOOR: Record<DoorState, { label: string; dot: string }> = {
  arriving: { label: "To arrive", dot: "bg-orange-500" },
  here: { label: "Here", dot: "bg-green-600" },
  gone: { label: "Gone home", dot: "bg-blue-600" },
  absent: { label: "Absent", dot: "bg-red-600" },
};

type DoorFilter = "all" | DoorState;

type SignRequest = { entry: RollCallEntry; action: "in" | "out" };

function formatTime(dt: string | null): string {
  if (!dt) return "";
  return new Date(dt).toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** The centre's date, not UTC's — see serviceTodayISO. */
const todayDateString = () => serviceTodayISO();

function ChildAvatar({ child }: { child: RollCallEntry["child"] }) {
  if (child.photo) {
    return (
      <img
        src={child.photo}
        alt={`${child.firstName} ${child.surname}`}
        className="w-12 h-12 rounded-full object-cover shrink-0"
      />
    );
  }
  const initials = `${child.firstName[0] ?? ""}${child.surname[0] ?? ""}`.toUpperCase();
  return (
    <div className="w-12 h-12 rounded-full bg-brand flex items-center justify-center text-white font-bold text-sm shrink-0">
      {initials}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────

export function ServiceRollCallTab({ serviceId }: ServiceRollCallTabProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawView = searchParams?.get("rollCallView") ?? "daily";
  const view: RollCallView =
    rawView === "weekly" ? "weekly" :
    rawView === "monthly" ? "monthly" :
    "daily";

  const setView = (next: RollCallView) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("rollCallView", next);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // Read the `date` URL param on mount — this enables bookmarking and the
  // monthly → daily drill-down flow. Validate YYYY-MM-DD shape to prevent
  // garbage from reaching the date picker.
  const urlDate = searchParams?.get("date") ?? null;
  const initialDate =
    urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate) ? urlDate : todayDateString();
  const [date, setDateState] = useState(initialDate);
  const isToday = date === todayDateString();
  /**
   * Which room's roll is showing.
   *
   * The selection is DERIVED rather than corrected in an effect: a
   * stored key that isn't one of this centre's rooms falls back to the
   * afternoon programme, then to whatever the centre's first room is.
   * An effect that fixed up the state after the fact would render one
   * frame asking the API for a room that doesn't exist here.
   * (Stage 2 of docs/rooms-migration-plan.md.)
   */
  const { data: roomData } = useServiceRooms(serviceId);
  const rooms = (roomData?.rooms ?? []).filter((r) => r.legacyKey !== null);
  const [pickedRoom, setPickedRoom] = useState<string | null>(null);
  const sessionType =
    pickedRoom && rooms.some((r) => r.legacyKey === pickedRoom)
      ? pickedRoom
      : ((rooms.find((r) => r.legacyKey === "asc") ?? rooms[0])?.legacyKey ??
        "asc");
  const currentRoom = rooms.find((r) => r.legacyKey === sessionType);
  const roomName = currentRoom?.name ?? slotCode(sessionType);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DoorFilter>("all");
  const [signing, setSigning] = useState<SignRequest | null>(null);
  const [bulk, setBulk] = useState<"in" | "out" | null>(null);
  // Walk-ins: a child who turns up without a booking. The roll-call POST
  // creates a fresh AttendanceRecord on sign_in (no Booking needed) and the
  // GET returns it as bookingType="casual".
  const [showAddChild, setShowAddChild] = useState(false);

  // Keep URL in sync when the user changes the date picker. Using a ref to
  // avoid re-syncing on first render.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("date", date);
    router.replace(`?${params.toString()}`, { scroll: false });
    // Intentionally omit searchParams/router from deps — we only want to
    // react to user-driven date changes, not downstream URL tick updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const { data, isLoading, error } = useRollCall(serviceId, date, sessionType);
  const updateRollCall = useUpdateRollCall();
  const bulkRollCall = useBulkRollCall();

  // Name order, always (see the header comment).
  const entries = useMemo(
    () =>
      [...(data?.records ?? [])].sort(
        (a, b) =>
          a.child.firstName.localeCompare(b.child.firstName) ||
          a.child.surname.localeCompare(b.child.surname),
      ),
    [data],
  );

  const counts = useMemo(() => {
    const c: Record<DoorState, number> = { arriving: 0, here: 0, gone: 0, absent: 0 };
    for (const e of entries) c[doorState(e)] += 1;
    return c;
  }, [entries]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (filter === "all" || doorState(e) === filter) &&
        (!q || `${e.child.firstName} ${e.child.surname}`.toLowerCase().includes(q)),
    );
  }, [entries, filter, search]);

  /**
   * Afternoon children come from their classrooms with an educator, so
   * there's no parent to name — one tap. Mornings and vacation care have a
   * parent at the door, so we ask who.
   */
  const quickSignIn = sessionType === "asc";

  function act(
    entry: RollCallEntry,
    action: RollCallAction,
    extra?: { absenceReason?: string; notes?: string; signedByName?: string; signature?: string },
  ) {
    updateRollCall.mutate({
      childId: entry.childId,
      serviceId,
      date,
      sessionType,
      action,
      ...extra,
      ...(extra?.signedByName ? { signMethod: "staff" as const } : {}),
    });
  }

  function signIn(entry: RollCallEntry) {
    if (quickSignIn) act(entry, "sign_in");
    else setSigning({ entry, action: "in" });
  }

  const bulkTargets = (action: "in" | "out") =>
    entries.filter((e) => doorState(e) === (action === "in" ? "arriving" : "here"));

  const bulkNote = (action: "in" | "out") =>
    action === "in"
      ? sessionType === "asc"
        ? "Collected from class by educators"
        : "Signed in by educators"
      : sessionType === "bsc"
        ? "Walked to school by educators"
        : "Signed out by educators";

  const FILTERS: DoorFilter[] = ["all", "arriving", "here", "gone", "absent"];

  return (
    <div className="space-y-4">
      {/* ── Room, search, walk-in ──────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* One button per ROOM this centre has, in the centre's own order. */}
        <div className="flex overflow-x-auto rounded-lg border border-border">
          {rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              aria-pressed={sessionType === room.legacyKey}
              onClick={() => setPickedRoom(room.legacyKey)}
              className={cn(
                "min-h-11 whitespace-nowrap px-4 text-sm font-medium transition-colors",
                sessionType === room.legacyKey
                  ? "bg-brand text-white"
                  : "bg-card text-muted hover:bg-surface",
              )}
            >
              {room.name}
            </button>
          ))}
        </div>

        <div className="relative w-full flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            placeholder="Find a child…"
            aria-label="Find a child"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-base text-foreground focus:border-transparent focus:ring-2 focus:ring-brand"
          />
        </div>

        <Button
          variant="secondary"
          onClick={() => setShowAddChild(true)}
          title="Sign in a child who isn't booked today (walk-in)"
          className="sm:ml-auto"
        >
          <Plus className="h-4 w-4" />
          Walk-in
        </Button>
      </div>

      {/* ── Day / week / month, and the date ───────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Roll view">
          {(["daily", "weekly", "monthly"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                "min-h-9 rounded-md px-3 text-sm font-medium transition-colors",
                view === v ? "bg-brand text-white" : "text-muted hover:text-foreground",
              )}
            >
              {v === "daily" ? "Day" : v === "weekly" ? "Week" : "Month"}
            </button>
          ))}
        </div>
        {view === "daily" && (
          <>
            <input
              type="date"
              value={date}
              onChange={(e) => setDateState(e.target.value)}
              aria-label="Date"
              className="min-h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:border-transparent focus:ring-2 focus:ring-brand"
            />
            {!isToday && (
              <button
                type="button"
                onClick={() => setDateState(todayDateString())}
                className="text-sm font-medium text-brand underline underline-offset-2"
              >
                Back to today
              </button>
            )}
          </>
        )}
      </div>

      {view === "daily" && (
        <>
          {/* ── Status chips — the door's four colours ────── */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
            {FILTERS.map((f) => {
              const n = f === "all" ? entries.length : counts[f];
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
                    filter === f
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border bg-card text-foreground hover:bg-surface",
                  )}
                >
                  {f !== "all" && <span className={cn("h-2.5 w-2.5 rounded-full", DOOR[f].dot)} aria-hidden />}
                  {f === "all" ? "Everyone" : DOOR[f].label}
                  <span className="tabular-nums text-muted">{n}</span>
                </button>
              );
            })}
          </div>

          {/* ── Bulk, for the whole programme ─────────────── */}
          {(counts.arriving > 0 || counts.here > 0) && (
            <div className="flex flex-wrap gap-2">
              {counts.arriving > 0 && (
                <Button variant="outline" size="sm" onClick={() => setBulk("in")}>
                  <LogIn className="h-4 w-4" />
                  Sign in all {counts.arriving}
                </Button>
              )}
              {counts.here > 0 && (
                <Button variant="outline" size="sm" onClick={() => setBulk("out")}>
                  <LogOut className="h-4 w-4" />
                  Sign out all {counts.here}
                </Button>
              )}
            </div>
          )}

          {/* ── The list ──────────────────────────────────── */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : error ? (
            <ErrorState error={error} />
          ) : shown.length === 0 ? (
            <EmptyState
              icon={Users}
              title={
                entries.length === 0
                  ? `No ${roomName} bookings${isToday ? " today" : " on this day"}`
                  : search
                    ? "No children match that search"
                    : `Nobody is “${DOOR[filter as DoorState]?.label ?? "here"}”`
              }
              description={
                entries.length === 0
                  ? "A child who turns up anyway can be added as a walk-in."
                  : undefined
              }
            />
          ) : (
            <ul className="space-y-2">
              {shown.map((entry) => (
                <RollCallRow
                  key={entry.childId}
                  entry={entry}
                  onSignIn={() => signIn(entry)}
                  onSignInNamed={() => setSigning({ entry, action: "in" })}
                  onSignOut={() => setSigning({ entry, action: "out" })}
                  onAction={(action, extra) => act(entry, action, extra)}
                  isPending={updateRollCall.isPending}
                  serviceId={serviceId}
                  date={date}
                  sessionType={sessionType}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {view === "weekly" && <ServiceWeeklyRollCallGrid serviceId={serviceId} />}

      {view === "monthly" && <ServiceMonthlyRollCallView serviceId={serviceId} />}

      {signing && (
        <SignDialog
          serviceId={serviceId}
          childFirstName={signing.entry.child.firstName}
          action={signing.action}
          defaultName={signing.action === "out" ? signing.entry.signedInByName : null}
          onCancel={() => setSigning(null)}
          onConfirm={(who) => {
            act(signing.entry, signing.action === "in" ? "sign_in" : "sign_out", who);
            setSigning(null);
          }}
        />
      )}

      {bulk && (
        <BulkDialog
          action={bulk}
          count={bulkTargets(bulk).length}
          roomName={roomName}
          defaultNote={bulkNote(bulk)}
          isPending={bulkRollCall.isPending}
          onCancel={() => setBulk(null)}
          onConfirm={(note) =>
            bulkRollCall.mutate(
              {
                serviceId,
                date,
                sessionType,
                action: bulk === "in" ? "sign_in" : "sign_out",
                childIds: bulkTargets(bulk).map((e) => e.childId),
                signedByName: note,
                // A parent is told about a real hand-over, not a correction
                // to an earlier day.
                notify: isToday,
              },
              { onSettled: () => setBulk(null) },
            )
          }
        />
      )}

      {showAddChild && (
        <AddChildDialog
          serviceId={serviceId}
          date={date}
          sessionType={sessionType}
          roomName={currentRoom?.name}
          existingChildIds={new Set(entries.map((e) => e.childId))}
          onClose={() => setShowAddChild(false)}
          onSignIn={(childId) =>
            updateRollCall.mutate({ childId, serviceId, date, sessionType, action: "sign_in" })
          }
          isPending={updateRollCall.isPending}
        />
      )}
    </div>
  );
}

// ── Add Child Dialog (walk-in flow) ──────────────────────
//
// Shown when the educator/director hits "Add Child" on the daily roll
// call. Lists every active child enrolled at this service, minus those
// already on today's roll call. Selecting one signs them in via the
// existing POST /api/attendance/roll-call endpoint with action="sign_in",
// which creates a fresh AttendanceRecord without needing a Booking row.
// The walk-in then surfaces in the GET response under bookingType="casual"
// and blends into the regular roll-call list.

function AddChildDialog({
  serviceId,
  date,
  sessionType,
  roomName,
  existingChildIds,
  onClose,
  onSignIn,
  isPending,
}: {
  serviceId: string;
  date: string;
  sessionType: string;
  /** The room's own name. Absent only while the rooms are still loading. */
  roomName?: string;
  existingChildIds: Set<string>;
  onClose: () => void;
  onSignIn: (childId: string) => void;
  isPending: boolean;
}) {
  useEscapeClose(onClose);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useChildren({
    serviceId,
    status: "current",
  });

  const candidates = useMemo(() => {
    const all = data?.children ?? [];
    const q = search.trim().toLowerCase();
    return all
      .filter((c) => !existingChildIds.has(c.id))
      .filter((c) => {
        if (!q) return true;
        const fn = (c.firstName ?? "").toLowerCase();
        const sn = (c.surname ?? "").toLowerCase();
        return fn.includes(q) || sn.includes(q) || `${fn} ${sn}`.includes(q);
      })
      .sort((a, b) => {
        const sn = (a.surname ?? "").localeCompare(b.surname ?? "");
        if (sn !== 0) return sn;
        return (a.firstName ?? "").localeCompare(b.firstName ?? "");
      });
  }, [data, search, existingChildIds]);

  const dateLabel = new Date(date).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const sessionLabel = roomName ?? slotCode(sessionType);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogTitle className="text-base font-semibold text-foreground">
          Add child to {sessionLabel} · {dateLabel}
        </DialogTitle>
        <p className="text-xs text-muted mt-1 mb-3">
          Pick an enrolled child to sign in. They&apos;ll appear on the roll call as
          a walk-in (no booking required).
        </p>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            autoFocus
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-foreground bg-card text-sm focus:ring-2 focus:ring-brand focus:border-transparent min-h-[44px]"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto -mx-2">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : candidates.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted text-center">
              {search.trim()
                ? "No matching children."
                : "Every enrolled child is already on the roll call."}
            </p>
          ) : (
            <ul className="px-2 space-y-1">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSignIn(c.id);
                      onClose();
                    }}
                    disabled={isPending}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-sm",
                      "hover:bg-surface transition-colors min-h-[44px]",
                      "flex items-center gap-2 disabled:opacity-50",
                    )}
                  >
                    <span className="font-medium text-foreground">
                      {c.firstName} {c.surname}
                    </span>
                    {c.yearLevel && (
                      <span className="text-xs text-muted">
                        · {c.yearLevel}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end pt-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-muted"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AboutMeLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-foreground">
      <span className="font-semibold">{label}:</span>{" "}
      <span className="text-muted">{value}</span>
    </p>
  );
}

// ── One child at the door ────────────────────────────────

function RollCallRow({
  entry,
  onSignIn,
  onSignInNamed,
  onSignOut,
  onAction,
  isPending,
  serviceId,
  date,
  sessionType,
}: {
  entry: RollCallEntry;
  onSignIn: () => void;
  /** Sign in with a named adult, even where sign-in is normally one tap. */
  onSignInNamed: () => void;
  onSignOut: () => void;
  onAction: (action: RollCallAction, extra?: { absenceReason?: string; notes?: string }) => void;
  isPending: boolean;
  serviceId: string;
  date: string;
  sessionType: string;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showAbsentDialog, setShowAbsentDialog] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [absenceReason, setAbsenceReason] = useState("");
  const [note, setNote] = useState("");
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [isPhotoUploading, setIsPhotoUploading] = useState(false);
  const sendFirstDayPhoto = useSendFirstDayPhoto();
  const photoAlreadySent = Boolean(entry.firstDayPhotoSentAt);
  const [showAboutMe, setShowAboutMe] = useState(false);
  const aboutMe = entry.child.allAboutMe;
  const hasAboutMe =
    !!aboutMe &&
    [
      aboutMe.nickname,
      aboutMe.favouriteFood,
      aboutMe.favouriteToys,
      aboutMe.favouriteSubjects,
      aboutMe.hobbies,
      aboutMe.fears,
      aboutMe.calmingTechniques,
      aboutMe.additionalNotes,
    ].some((v) => v && v.trim().length > 0);
  const state = doorState(entry);
  const name = `${entry.child.firstName} ${entry.child.surname}`;

  async function handlePhotoFile(file: File) {
    if (!entry.attendanceId) {
      toast({
        variant: "destructive",
        description: "Sign the child in first — the attendance record gets created on sign-in.",
      });
      return;
    }
    setIsPhotoUploading(true);
    try {
      const photoUrl = await uploadFirstDayPhoto(file);
      sendFirstDayPhoto.mutate({
        attendanceId: entry.attendanceId,
        photoUrl,
        serviceId,
        date,
        sessionType,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Could not upload photo",
      });
    } finally {
      setIsPhotoUploading(false);
    }
  }

  const hasMedFlags =
    entry.child.medicalConditions.length > 0 ||
    entry.child.dietaryRequirements.length > 0 ||
    entry.child.anaphylaxisActionPlan;

  const inBy = entry.signedInByName ?? entry.signedInBy?.name;
  const outBy = entry.signedOutByName ?? entry.signedOutBy?.name;

  const menuItem =
    "w-full px-3 py-2.5 text-left text-sm text-foreground hover:bg-surface flex items-center gap-2 min-h-[44px] disabled:opacity-50";

  return (
    <li data-door-state={state}>
      <div
        className={cn(
          "bg-card border border-border rounded-xl p-3 sm:p-4 flex items-center gap-3",
          state === "gone" || state === "absent" ? "opacity-80" : "",
        )}
      >
        {/* Avatar with the door colour — readable at arm's length. */}
        <span className="relative shrink-0">
          <ChildAvatar child={entry.child} />
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full ring-2 ring-[var(--color-card)]",
              DOOR[state].dot,
            )}
            title={DOOR[state].label}
          />
          <span className="sr-only">{DOOR[state].label}</span>
        </span>

        {/* Child info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-foreground text-base">{name}</p>
            {entry.bookingType === "casual" && (
              <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                Casual
              </span>
            )}
            {/* Their first ever session — the one thing you want to know
                BEFORE you greet a child nobody recognises. */}
            {entry.isFirstSession && (
              <span className="inline-flex items-center gap-1 text-2xs font-bold px-1.5 py-0.5 rounded-full bg-brand text-white uppercase tracking-wide">
                <Sparkles className="w-3 h-3" />
                First day
              </span>
            )}
          </div>
          {/* The hand-over is where a medical or custody alert matters most. */}
          {(hasMedFlags || entry.child.custodyArrangements) && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {entry.child.anaphylaxisActionPlan && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-600 text-white text-2xs font-bold uppercase tracking-wide">
                  Anaphylaxis
                </span>
              )}
              {hasMedFlags && <MedicalAlertBadge child={entry.child} compact />}
              <CustodyChip custody={entry.child.custodyArrangements} childName={name} compact />
            </div>
          )}

          <p className="mt-1 text-xs text-muted">
            {state === "arriving" && (entry.child.yearLevel ? `${entry.child.yearLevel} · not here yet` : "Not here yet")}
            {state === "here" && (
              <>
                In {formatTime(entry.signInTime)}
                {inBy ? ` · ${inBy}` : ""}
              </>
            )}
            {state === "gone" && (
              <>
                In {formatTime(entry.signInTime)} · Out {formatTime(entry.signOutTime)}
                {outBy ? ` · ${outBy}` : ""}
              </>
            )}
            {state === "absent" && (entry.absenceReason ? `Absent · ${entry.absenceReason}` : "Absent")}
          </p>
          {entry.notes && (
            <p className="mt-0.5 flex items-start gap-1 text-xs text-foreground">
              <StickyNote className="mt-0.5 h-3 w-3 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 break-words">{entry.notes}</span>
            </p>
          )}

          {hasAboutMe && (
            <button
              type="button"
              onClick={() => setShowAboutMe((s) => !s)}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              {showAboutMe ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Sparkles className="w-3 h-3" />
              All About Me
              {aboutMe?.nickname && (
                <span className="text-muted font-normal">· &quot;{aboutMe.nickname}&quot;</span>
              )}
            </button>
          )}
        </div>

        {/* Actions — one obvious button per state */}
        <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:flex-row sm:items-center">
          {state === "arriving" && (
            <>
              <Button size="md" disabled={isPending} onClick={onSignIn} className="min-w-[112px]">
                <LogIn className="w-4 h-4" />
                Sign in
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => onAction("mark_absent")}
                aria-label={`Mark ${entry.child.firstName} absent`}
                className="text-red-700 dark:text-red-400"
              >
                <UserX className="w-4 h-4" />
                Absent
              </Button>
            </>
          )}
          {state === "here" && (
            <Button size="md" variant="outline" disabled={isPending} onClick={onSignOut} className="min-w-[112px]">
              <LogOut className="w-4 h-4" />
              Sign out
            </Button>
          )}
          {state === "gone" && (
            <span className="inline-flex items-center gap-1.5 pr-1 text-sm text-blue-700 dark:text-blue-400">
              <Check className="w-4 h-4" /> Gone home
            </span>
          )}
          {state === "absent" && (
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => onAction("undo")}
              aria-label={`Undo absent for ${entry.child.firstName}`}
            >
              <Undo2 className="w-4 h-4" />
              Undo
            </Button>
          )}
        </div>

        {/* More */}
        <div className="relative self-start sm:self-center">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="min-h-[44px] min-w-[36px] flex items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-foreground transition-colors"
            aria-label={`More for ${entry.child.firstName}`}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[200px]">
                {state === "arriving" && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onSignInNamed();
                        setShowMenu(false);
                      }}
                      className={menuItem}
                    >
                      <PenLine className="w-3.5 h-3.5" />
                      Sign in with a name
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAbsentDialog(true);
                        setShowMenu(false);
                      }}
                      className={menuItem}
                    >
                      <UserX className="w-3.5 h-3.5" />
                      Absent, with a reason
                    </button>
                  </>
                )}
                {(state === "here" || state === "gone") && (
                  <button
                    type="button"
                    onClick={() => {
                      onAction("undo");
                      setShowMenu(false);
                    }}
                    disabled={isPending}
                    className={menuItem}
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Undo — back to “to arrive”
                  </button>
                )}
                {/* A note needs a record to sit on — there isn't one until
                    the child is signed in or marked absent. */}
                {state !== "arriving" && (
                  <button
                    type="button"
                    onClick={() => {
                      setNote(entry.notes ?? "");
                      setShowNoteDialog(true);
                      setShowMenu(false);
                    }}
                    className={menuItem}
                  >
                    <StickyNote className="w-3.5 h-3.5" />
                    {entry.notes ? "Edit note" : "Add note"}
                  </button>
                )}
                {state !== "arriving" && state !== "absent" && entry.attendanceId && (
                  photoAlreadySent ? (
                    <div className="w-full px-3 py-2.5 text-left text-sm text-green-600 flex items-center gap-2 min-h-[44px]">
                      <Check className="w-3.5 h-3.5" />
                      Photo sent
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        photoInputRef.current?.click();
                        setShowMenu(false);
                      }}
                      disabled={isPhotoUploading || sendFirstDayPhoto.isPending}
                      className={menuItem}
                    >
                      {isPhotoUploading || sendFirstDayPhoto.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Camera className="w-3.5 h-3.5" />
                      )}
                      Send first-day photo
                    </button>
                  )
                )}
              </div>
            </>
          )}
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handlePhotoFile(file);
          }}
        />
      </div>
      {showAboutMe && aboutMe && (
        <div className="bg-[color:var(--color-brand-soft)] border border-border rounded-xl p-3 mt-1 text-xs space-y-1.5">
          {aboutMe.nickname && <AboutMeLine label="Goes by" value={aboutMe.nickname} />}
          {aboutMe.favouriteFood && <AboutMeLine label="Loves" value={aboutMe.favouriteFood} />}
          {aboutMe.favouriteToys && <AboutMeLine label="Plays with" value={aboutMe.favouriteToys} />}
          {aboutMe.favouriteSubjects && (
            <AboutMeLine label="Favourite subjects" value={aboutMe.favouriteSubjects} />
          )}
          {aboutMe.hobbies && <AboutMeLine label="Hobbies" value={aboutMe.hobbies} />}
          {aboutMe.fears && <AboutMeLine label="Steer clear of" value={aboutMe.fears} />}
          {aboutMe.calmingTechniques && (
            <AboutMeLine label="What helps when upset" value={aboutMe.calmingTechniques} />
          )}
          {aboutMe.additionalNotes && <AboutMeLine label="Notes" value={aboutMe.additionalNotes} />}
        </div>
      )}

      {/* Absent, with a reason */}
      {showAbsentDialog && (
        <Dialog open onOpenChange={() => setShowAbsentDialog(false)}>
          <DialogContent size="sm">
            <DialogTitle className="text-lg font-semibold text-foreground">
              {entry.child.firstName} is absent
            </DialogTitle>
            <form
              className="space-y-3 mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!absenceReason.trim()) return;
                onAction("mark_absent", { absenceReason: absenceReason.trim() });
                setShowAbsentDialog(false);
                setAbsenceReason("");
              }}
            >
              <div className="flex flex-wrap gap-2">
                {["Sick", "Family holiday", "Parent called", "No show"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setAbsenceReason(r)}
                    aria-pressed={absenceReason === r}
                    className={cn(
                      "min-h-10 rounded-full border px-3 text-sm",
                      absenceReason === r ? "border-brand bg-brand/10 text-brand" : "border-border text-foreground",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={absenceReason}
                onChange={(e) => setAbsenceReason(e.target.value)}
                placeholder="Or type a reason"
                aria-label="Reason"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:ring-2 focus:ring-brand focus:border-transparent min-h-[44px]"
              />
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setShowAbsentDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={!absenceReason.trim()}>
                  Mark absent
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Add note */}
      {showNoteDialog && (
        <Dialog open onOpenChange={() => setShowNoteDialog(false)}>
          <DialogContent size="sm">
            <DialogTitle className="text-lg font-semibold text-foreground">
              Note for {entry.child.firstName}
            </DialogTitle>
            <div className="space-y-3 mt-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Enter a note..."
                rows={3}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={() => setShowNoteDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    onAction("note", { notes: note.trim() });
                    setShowNoteDialog(false);
                    setNote("");
                  }}
                  disabled={!note.trim()}
                >
                  Save note
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </li>
  );
}
