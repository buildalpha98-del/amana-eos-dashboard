"use client";

/**
 * One room, with everything about it in one place.
 *
 * Until now a room's details, its fees, its scheduled rate changes, its
 * closures and its children were five separate cards on one long page,
 * and answering "tell me about Amana Afternoons" meant reading all five
 * and filtering each one by eye. This is the container those pieces
 * were always heading towards — the shape OWNA gets right.
 *
 * Read-only by design. Every edit still happens in the card that owns
 * that data, so there's exactly one place each thing is written and no
 * second form to keep in step. This answers "what IS this room", and
 * points at the card that changes it.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarOff, DollarSign, Info, Users } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchApi } from "@/lib/fetch-api";
import { formatCents } from "@/lib/family-billing";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/service-settings";
import type { ServiceRoom } from "@/hooks/useServiceRooms";

type Tab = "details" | "fees" | "closures" | "children";

const TABS: Array<{
  key: Tab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "details", label: "Details", icon: Info },
  { key: "fees", label: "Fees", icon: DollarSign },
  { key: "closures", label: "Block-outs", icon: CalendarOff },
  { key: "children", label: "Children", icon: Users },
];

const dateAU = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export function RoomDetailPanel({
  serviceId,
  room,
  approvedPlaces,
  open,
  onClose,
}: {
  serviceId: string;
  /**
   * Stage 2: the panel takes the ROOM RECORD, not an enum slot. Its
   * name, hours, capacity, ratio, photo and fees all come from the row,
   * so a room the enum never knew about opens like any other.
   */
  room: ServiceRoom | null;
  approvedPlaces: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("details");

  const name = room?.name ?? "";
  /**
   * Three things below still key off the enum slot: the children in a
   * room, block-out dates and scheduled fee changes all live behind
   * routes that filter on `sessionType`. Those move later in Stage 2.
   * Until they do, a room with no legacy key opens and shows its
   * details — it just has nothing to show on those three tabs, which
   * is true rather than broken.
   */
  const legacyKey = room?.legacyKey ?? null;

  const { data: childData, isLoading: childrenLoading } = useQuery<{
    children: Array<{
      id: string;
      name: string;
      yearLevel: string | null;
      days: string[];
    }>;
    casualCount: number;
  }>({
    queryKey: ["service", serviceId, "room-children", room?.id],
    queryFn: () =>
      fetchApi(`/api/services/${serviceId}/rooms/${room?.id}/children`),
    // Only fetched when that tab is opened — a room panel shouldn't
    // pull a booking table nobody looked at.
    enabled: open && tab === "children" && Boolean(room?.id),
    retry: 1,
  });

  const { data: blockOutData } = useQuery<{
    blockOutDates: Array<{
      id: string;
      date: string;
      roomId: string | null;
      reason: string | null;
    }>;
  }>({
    queryKey: ["service", serviceId, "block-out-dates"],
    queryFn: () => fetchApi(`/api/services/${serviceId}/block-out-dates`),
    enabled: open && tab === "closures",
    retry: 1,
  });

  const { data: feeChangeData } = useQuery<{
    changes: Array<{
      id: string;
      roomId: string | null;
      feeName: string;
      toAmountCents: number;
      effectiveDate: string;
      status: string;
    }>;
  }>({
    queryKey: ["service", serviceId, "fee-changes"],
    queryFn: () => fetchApi(`/api/services/${serviceId}/fee-changes`),
    enabled: open && tab === "fees",
    retry: 1,
  });

  if (!room) return null;

  const fees = room.fees;
  // Whole-centre closures shut this room too, so both belong here.
  // Whole-centre closures carry no room and shut this one too.
  const closures = (blockOutData?.blockOutDates ?? []).filter(
    (b) => b.roomId === null || b.roomId === room.id,
  );
  const upcomingFeeChanges = (feeChangeData?.changes ?? []).filter(
    (c) => c.roomId === room.id && c.status === "scheduled",
  );

  const start = room.startTime ?? "";
  const end = room.endTime ?? "";
  const overCapacity =
    typeof room.capacity === "number" &&
    approvedPlaces != null &&
    room.capacity > approvedPlaces;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>{name}</DialogTitle>
        <p className="mt-0.5 text-xs text-muted">
          {formatTime(start)} – {formatTime(end)}
          {room?.capacity ? ` · ${room.capacity} places` : ""}
          {room?.ratio ? ` · ${room.ratio}` : ""}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5 border-b border-border pb-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
                tab === t.key
                  ? "bg-brand/10 text-brand"
                  : "text-muted hover:bg-surface hover:text-foreground",
              )}
              aria-current={tab === t.key ? "page" : undefined}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-3 max-h-[60vh] overflow-y-auto pr-1">
          {tab === "details" && (
            <dl className="space-y-2 text-sm">
              <Row label="Runs" value={`${formatTime(start)} – ${formatTime(end)}`} />
              <Row
                label="Places"
                value={
                  room?.capacity
                    ? `${room.capacity}${
                        overCapacity
                          ? ` — more than the ${approvedPlaces} this service is approved for`
                          : ""
                      }`
                    : "Not set"
                }
                warn={overCapacity}
              />
              <Row
                label="Ratio"
                value={room?.ratio ?? "Service default"}
              />
              <Row
                label="Ages"
                value={
                  room?.minAgeYears !== undefined || room?.maxAgeYears !== undefined
                    ? room?.minAgeYears !== undefined &&
                      room?.maxAgeYears !== undefined
                      ? `${room.minAgeYears}–${room.maxAgeYears}`
                      : room?.minAgeYears !== undefined
                        ? `${room.minAgeYears} and up`
                        : `Up to ${room?.maxAgeYears}`
                    : "Any age"
                }
              />
              {room?.description && (
                <Row label="What it's for" value={room.description} />
              )}
              {room?.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={room.photoUrl}
                  alt={`${name} room`}
                  className="mt-2 w-full max-w-sm rounded-lg border border-border object-cover"
                />
              )}
              {room?.staffOnly && (
                <Row
                  label="Staff only"
                  value="Children can't be booked in"
                  warn
                />
              )}
              {room.archivedAt && (
                <Row
                  label="Retired"
                  value="Hidden from new bookings; past records intact"
                  warn
                />
              )}
              <Row label="Fees set up" value={String(fees.length)} />
              <p className="pt-2 text-xs text-muted">
                Everything here is edited in <strong>Rooms &amp; fees</strong>,
                so there&apos;s one place each thing is written.
              </p>
            </dl>
          )}

          {tab === "fees" && (
            <div className="space-y-3">
              {fees.length === 0 ? (
                <p className="text-sm text-muted">
                  No fees set up for this room yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {fees.map((f) => (
                    <li key={f.id} className="py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">
                          {f.name}
                        </p>
                        <p className="text-sm text-foreground">
                          {formatCents(f.amountCents)}
                        </p>
                      </div>
                      <p className="text-xs text-muted">
                        {f.start && f.end
                          ? `${formatTime(f.start)} – ${formatTime(f.end)}`
                          : "Whole session"}
                        {f.casualAmountCents != null &&
                          ` · casual ${formatCents(f.casualAmountCents)}`}
                        {f.staffAmountCents != null &&
                          ` · staff ${formatCents(f.staffAmountCents)}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {upcomingFeeChanges.length > 0 && (
                <div className="rounded-lg border border-brand/25 bg-brand/5 p-3">
                  <p className="text-xs font-semibold text-foreground">
                    Coming up
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {upcomingFeeChanges.map((c) => (
                      <li key={c.id} className="text-xs text-muted">
                        {c.feeName} → {formatCents(c.toAmountCents)} from{" "}
                        {dateAU(c.effectiveDate)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === "closures" &&
            (closures.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing blocked out. Every day this room runs is bookable.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {closures.map((b) => (
                  <li key={b.id} className="py-2">
                    <p className="text-sm text-foreground">{dateAU(b.date)}</p>
                    <p className="text-xs text-muted">
                      {b.roomId === null
                        ? "Whole centre closed"
                        : "This room only"}
                      {b.reason && ` · ${b.reason}`}
                    </p>
                  </li>
                ))}
              </ul>
            ))}

          {tab === "children" &&
            (childrenLoading ? (
              <Skeleton className="h-32 w-full rounded-lg" />
            ) : (childData?.children.length ?? 0) === 0 ? (
              <p className="text-sm text-muted">
                Nobody holds a regular booking in this room.
                {(childData?.casualCount ?? 0) > 0 &&
                  ` ${childData!.casualCount} ${
                    childData!.casualCount === 1 ? "child has" : "children have"
                  } booked casually.`}
              </p>
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {childData!.children.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">
                          {c.name}
                        </p>
                        {c.yearLevel && (
                          <p className="text-xs text-muted">{c.yearLevel}</p>
                        )}
                      </div>
                      <p className="shrink-0 text-xs text-muted">
                        {c.days.length > 0 ? c.days.join(", ") : "—"}
                      </p>
                    </li>
                  ))}
                </ul>
                {(childData?.casualCount ?? 0) > 0 && (
                  <p className="mt-2 text-xs text-muted">
                    Plus {childData!.casualCount} booking casually.
                  </p>
                )}
              </>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd
        className={cn(
          "text-right text-foreground",
          warn && "text-amber-700 dark:text-amber-300",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
