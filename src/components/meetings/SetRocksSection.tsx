"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Plus,
  Trash2,
} from "lucide-react";
import type { RockData } from "@/hooks/useRocks";
import type { MeetingAttendee } from "@/hooks/useMeetings";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const COMPANY_ROCK_MIN = 3;
const COMPANY_ROCK_MAX = 7;
const INDIVIDUAL_ROCK_MIN = 1;
const INDIVIDUAL_ROCK_MAX = 3;

type Disposition = "done" | "carry_over" | "move_to_issue" | "drop";

/**
 * Quarterly Pulse — step 5, "Set Next Quarter's Rocks" (75 min), the
 * biggest block of the day. Two passes: first decide what happens to each
 * off-track current-quarter Rock, then build next quarter's Company Rocks
 * (3-7) and each attendee's Individual Rocks (1-3).
 */
export function SetRocksSection({
  offTrackRocks,
  nextQuarterRocks,
  users,
  attendees,
  nextQuarter,
  onMarkDone,
  onCarryOver,
  onMoveToIssue,
  onDrop,
  onCreateRock,
  creatingRock,
  isCompleted,
}: {
  offTrackRocks: RockData[] | undefined;
  nextQuarterRocks: RockData[] | undefined;
  users: { id: string; name: string }[] | undefined;
  attendees?: MeetingAttendee[];
  nextQuarter: string;
  onMarkDone?: (rock: RockData) => void;
  onCarryOver?: (rock: RockData) => void;
  onMoveToIssue?: (rock: RockData) => void;
  onDrop?: (rock: RockData) => void;
  onCreateRock?: (data: {
    title: string;
    ownerId: string;
    rockType: "company" | "personal";
  }) => void;
  creatingRock?: boolean;
  isCompleted?: boolean;
}) {
  const [resolved, setResolved] = useState<Record<string, Disposition>>({});

  const resolve = (rockId: string, disposition: Disposition, action?: () => void) => {
    action?.();
    setResolved((prev) => ({ ...prev, [rockId]: disposition }));
  };

  const companyRocks = useMemo(
    () => (nextQuarterRocks ?? []).filter((r) => r.rockType === "company"),
    [nextQuarterRocks],
  );
  const companyOk =
    companyRocks.length >= COMPANY_ROCK_MIN && companyRocks.length <= COMPANY_ROCK_MAX;

  const presentAttendees = attendees?.filter((a) => a.status === "present") ?? [];

  return (
    <div className="space-y-8">
      {offTrackRocks && offTrackRocks.length > 0 && (
        <div className="space-y-3">
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-red-800 mb-1">
              Off-Track Rocks from This Quarter
            </h4>
            <p className="text-xs text-red-600">
              Decide each one before moving on: mark it done, carry it into
              next quarter, move it to IDS, or drop it.
            </p>
          </div>
          <div className="space-y-2">
            {offTrackRocks.map((rock) => (
              <OffTrackRockRow
                key={rock.id}
                rock={rock}
                disposition={resolved[rock.id]}
                disabled={isCompleted}
                onMarkDone={() => resolve(rock.id, "done", () => onMarkDone?.(rock))}
                onCarryOver={() => resolve(rock.id, "carry_over", () => onCarryOver?.(rock))}
                onMoveToIssue={() => resolve(rock.id, "move_to_issue", () => onMoveToIssue?.(rock))}
                onDrop={() => resolve(rock.id, "drop", () => onDrop?.(rock))}
              />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-foreground">
            Company Rocks — {nextQuarter}
          </h4>
          <span
            className={cn(
              "text-2xs font-medium px-2 py-0.5 rounded-full",
              companyOk
                ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",
            )}
          >
            {companyRocks.length} of {COMPANY_ROCK_MIN}-{COMPANY_ROCK_MAX} target
          </span>
        </div>
        <RockWorksheetList rocks={companyRocks} />
        {!isCompleted && onCreateRock && (
          <RockQuickAdd
            users={users}
            rockType="company"
            pending={creatingRock}
            onAdd={(data) => onCreateRock({ ...data, rockType: "company" })}
          />
        )}
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground">
          Individual Rocks — {nextQuarter}
        </h4>
        {presentAttendees.length === 0 ? (
          <p className="text-sm text-muted">
            No attendees recorded — individual Rocks can still be added
            below for any owner.
          </p>
        ) : (
          presentAttendees.map((attendee) => {
            const ownRocks = (nextQuarterRocks ?? []).filter(
              (r) => r.rockType === "personal" && r.ownerId === attendee.userId,
            );
            const ok =
              ownRocks.length >= INDIVIDUAL_ROCK_MIN &&
              ownRocks.length <= INDIVIDUAL_ROCK_MAX;
            return (
              <div key={attendee.userId} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">
                    {attendee.user.name}
                  </span>
                  <span
                    className={cn(
                      "text-2xs font-medium px-2 py-0.5 rounded-full",
                      ok
                        ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300"
                        : "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",
                    )}
                  >
                    {ownRocks.length} of {INDIVIDUAL_ROCK_MIN}-{INDIVIDUAL_ROCK_MAX} target
                  </span>
                </div>
                <RockWorksheetList rocks={ownRocks} compact />
                {!isCompleted && onCreateRock && (
                  <RockQuickAdd
                    users={users}
                    rockType="personal"
                    defaultOwnerId={attendee.userId}
                    pending={creatingRock}
                    onAdd={(data) => onCreateRock({ ...data, rockType: "personal" })}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function OffTrackRockRow({
  rock,
  disposition,
  disabled,
  onMarkDone,
  onCarryOver,
  onMoveToIssue,
  onDrop,
}: {
  rock: RockData;
  disposition?: Disposition;
  disabled?: boolean;
  onMarkDone: () => void;
  onCarryOver: () => void;
  onMoveToIssue: () => void;
  onDrop: () => void;
}) {
  const dispositionLabel: Record<Disposition, string> = {
    done: "Marked done",
    carry_over: "Carried to next quarter",
    move_to_issue: "Moved to IDS",
    drop: "Dropped",
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{rock.title}</p>
          <p className="text-xs text-muted">{rock.owner?.name ?? "Unassigned"}</p>
        </div>
        {disposition && (
          <span className="text-2xs px-2 py-0.5 rounded-full bg-brand/10 text-brand font-medium flex-shrink-0">
            {dispositionLabel[disposition]}
          </span>
        )}
      </div>
      {!disposition && !disabled && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onMarkDone}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-card border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          >
            <CheckCircle2 className="w-3 h-3" />
            Done
          </button>
          <button
            type="button"
            onClick={onCarryOver}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-card border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40"
          >
            <ArrowRight className="w-3 h-3" />
            Carry Over
          </button>
          <button
            type="button"
            onClick={onMoveToIssue}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-card border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"
          >
            <AlertTriangle className="w-3 h-3" />
            Move to Issue
          </button>
          <button
            type="button"
            onClick={onDrop}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-card border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            <Trash2 className="w-3 h-3" />
            Drop
          </button>
        </div>
      )}
    </div>
  );
}

function RockWorksheetList({
  rocks,
  compact,
}: {
  rocks: RockData[];
  compact?: boolean;
}) {
  if (rocks.length === 0) {
    return (
      <p className="text-xs text-muted italic">
        {compact ? "No Rocks added yet." : "No Company Rocks added yet."}
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {rocks.map((r) => (
        <li
          key={r.id}
          className="flex items-center gap-2 text-sm text-foreground/90 px-2 py-1 rounded-md bg-surface/50"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />
          <span className="truncate">{r.title}</span>
          {!compact && (
            <span className="text-xs text-muted ml-auto flex-shrink-0">
              {r.owner?.name ?? "Unassigned"}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function RockQuickAdd({
  users,
  rockType,
  defaultOwnerId,
  pending,
  onAdd,
}: {
  users: { id: string; name: string }[] | undefined;
  rockType: "company" | "personal";
  defaultOwnerId?: string;
  pending?: boolean;
  onAdd: (data: { title: string; ownerId: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState(defaultOwnerId ?? "");

  const handleAdd = () => {
    if (!title.trim() || !ownerId) return;
    onAdd({ title: title.trim(), ownerId });
    setTitle("");
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
        }}
        placeholder={
          rockType === "company" ? "New Company Rock…" : "New Individual Rock…"
        }
        aria-label={rockType === "company" ? "New Company Rock title" : "New Individual Rock title"}
        className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
      />
      {!defaultOwnerId && (
        <select
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          aria-label="Owner"
          className="px-2 py-1.5 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
        >
          <option value="">Owner…</option>
          {(users ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}
      <Button
        size="xs"
        onClick={handleAdd}
        disabled={!title.trim() || !ownerId || pending}
        iconLeft={<Plus className="w-3.5 h-3.5" />}
      >
        Add
      </Button>
    </div>
  );
}
