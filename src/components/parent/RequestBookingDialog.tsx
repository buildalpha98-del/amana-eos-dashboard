"use client";

import { useMemo, useState } from "react";
import { Calendar, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import {
  useParentChildren,
  type ParentChild,
} from "@/hooks/useParentPortal";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/useToast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import {
  DEFAULT_ROOMS,
  SESSION_KEYS,
  type SessionKey,
  formatTime,
  roomLabel,
  type SessionTimes,
} from "@/lib/service-settings";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Session codes stay bsc/asc/vc on the wire — they're written into every
 * booking in the system. What a parent SEES is the centre's own room
 * name, which each service sets for itself: "Rise and Shine", not "BSC".
 */
interface Centre {
  id: string;
  sessionTimes?: SessionTimes | null;
  /** Session keys this centre has enabled for casual bookings. */
  casualSessions?: string[];
  /** Weekdays each enabled session runs, e.g. { asc: ["mon","tue"] }. */
  casualSessionDays?: Record<string, string[]>;
}

/** getDay() index → the key staff configure days under. */
const DAY_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Local calendar date as YYYY-MM-DD — toISOString() would shift the
 *  day for anyone east of Greenwich, which is everyone here. */
function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function RequestBookingDialog({ open, onOpenChange }: Props) {
  const { data: children } = useParentChildren();
  const queryClient = useQueryClient();

  /**
   * Books every selected day in one request.
   *
   * Invalidates ["parent", "bookings"] — the key the bookings list
   * actually uses. The calendar's copy of this hook invalidates
   * "parent-bookings", which matches nothing, so its bookings never
   * refreshed until something else happened to refetch.
   */
  const bulkBooking = useMutation({
    mutationFn: (data: {
      childId: string;
      serviceId: string;
      bookings: Array<{ date: string; sessionType: string }>;
    }) => mutateApi("/api/parent/bookings/bulk", { method: "POST", body: data }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ["parent", "bookings"] });
      queryClient.invalidateQueries({ queryKey: ["booking-availability"] });
      toast({
        description:
          vars.bookings.length === 1
            ? "Booking requested."
            : `${vars.bookings.length} sessions requested.`,
      });
    },
    onError: (err: Error) =>
      toast({
        variant: "destructive",
        description: err.message || "Couldn't request that booking.",
      }),
  });

  // Only fetched while the dialog is open — a booking form shouldn't
  // cost a request on every portal page load.
  const { data: centreData } = useQuery<{ centres: Centre[] }>({
    queryKey: ["parent", "centres"],
    queryFn: () => fetchApi("/api/parent/centres"),
    enabled: open,
    retry: 1,
  });

  const [selectedChild, setSelectedChild] = useState<ParentChild | null>(null);
  /**
   * Days being requested, not one.
   *
   * Casual care is almost never a single day — it's "Tuesday and
   * Thursday next week while I'm working". A `<input type="date">` can
   * only ever express one, which meant reopening the whole dialog per
   * day: pick child, pick date, pick programme, submit. Four times.
   */
  const [dates, setDates] = useState<string[]>([]);
  // A string, not the three literals: a centre can name extra booking
  // types (Rooms & fees), and those codes are just as valid here.
  const [sessionType, setSessionType] = useState<string>("");

  /**
   * The next four weeks, starting tomorrow.
   *
   * A strip of real days rather than a date field: on a phone, tapping
   * "Thu 7" is one gesture where a date input is a spinner, a scroll and
   * a confirm. Four weeks because casual care is planned within the
   * month — beyond that the centre's spots aren't loaded anyway.
   */
  const upcoming = useMemo(() => {
    const out: Date[] = [];
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    for (let i = 0; i < 28; i++) {
      out.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, []);

  const resetForm = () => {
    setSelectedChild(null);
    setDates([]);
    setSessionType("");
  };

  const toggleDate = (iso: string) =>
    setDates((prev) =>
      prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso].sort(),
    );

  const handleSubmit = () => {
    if (!selectedChild || dates.length === 0 || !sessionType) return;

    // One request per day. The bulk endpoint exists but takes a single
    // service+child, and this dialog already owns the per-request error
    // toast — firing them together keeps that behaviour rather than
    // swapping in a second failure shape for a two-day booking.
    bulkBooking.mutate(
      {
        childId: selectedChild.id,
        serviceId: selectedChild.serviceId,
        bookings: dates.map((date) => ({ date, sessionType })),
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      },
    );
  };

  const isValid = selectedChild && dates.length > 0 && sessionType;

  /**
   * Only what this centre has switched ON for casual bookings.
   *
   * Previously every session key was offered, so a family saw Holiday
   * Quest at a centre that doesn't run vacation care, and the four
   * spare room slots appeared as bookable programmes with no names.
   * A programme belongs on this form once the centre enables it under
   * Daily Ops → Casual Bookings, and not before.
   */
  const centre = centreData?.centres.find(
    (c) => c.id === selectedChild?.serviceId,
  );
  const sessionDays = centre?.casualSessionDays ?? {};

  /**
   * Weekdays at least one enabled session runs.
   *
   * The day strip only shows these. Most centres run Monday to Friday,
   * so Saturday and Sunday simply don't appear — a weekend chip that
   * 400s when pressed is a trap, not an option. A centre that IS open
   * Saturdays (its staff ticked Sat under Casual Bookings) gets its
   * Saturday chips back automatically. Before a child is chosen we
   * default to weekdays rather than showing nothing.
   */
  const openWeekdays = useMemo(() => {
    const lists = Object.values(sessionDays);
    if (lists.length === 0) return new Set(["mon", "tue", "wed", "thu", "fri"]);
    return new Set(lists.flat());
  }, [sessionDays]);

  const bookableSessions = ((centre?.casualSessions ?? []) as string[])
    .filter((k): k is SessionKey => (SESSION_KEYS as string[]).includes(k))
    // Only sessions that run on EVERY day picked — offering Rise and
    // Shine for a set that includes a day it doesn't run would fail the
    // request after the button press.
    .filter(
      (k) =>
        dates.length === 0 ||
        dates.every((iso) =>
          (sessionDays[k] ?? []).includes(
            DAY_KEY[new Date(`${iso}T00:00:00`).getDay()],
          ),
        ),
    );

  // The rooms belong to the CHILD's centre — siblings at different
  // campuses can have different room names and hours.
  const sessionTimes =
    (centreData?.centres.find((c) => c.id === selectedChild?.serviceId)
      ?.sessionTimes as SessionTimes | null | undefined) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Request Casual Booking</DialogTitle>
        <DialogDescription>
          Select a child, date, and session type for the booking.
        </DialogDescription>

        <div className="space-y-5 mt-4">
          {/* Child selector */}
          <div>
            <label className="block text-xs font-medium text-foreground/70 mb-2">
              Child
            </label>
            <div className="space-y-2">
              {(children ?? []).map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => {
                    setSelectedChild(child);
                    // Siblings can be at different centres with different
                    // operating days — days picked for one may not exist
                    // at the other, so a switch clears the picks rather
                    // than carrying invalid ones into the request.
                    if (child.serviceId !== selectedChild?.serviceId) {
                      setDates([]);
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all min-h-[44px]",
                    selectedChild?.id === child.id
                      ? "border-brand bg-brand/5"
                      : "border-border hover:border-brand/30"
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center text-xs font-bold text-brand">
                    {child.firstName[0]}
                    {child.lastName[0]}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">
                      {child.firstName} {child.lastName}
                    </p>
                    <p className="text-xs text-muted">{child.serviceName}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Days ──────────────────────────────────────────────
              A strip of real days, not a date field. On a phone "Thu 7"
              is one tap where a date input is a spinner, a scroll and a
              confirm — and a field can only ever hold ONE day, which is
              why booking Tuesday and Thursday used to mean filling this
              form twice. */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label className="block text-xs font-medium text-foreground/70">
                Which days?
              </label>
              {dates.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDates([])}
                  className="text-xs text-muted underline underline-offset-2"
                >
                  Clear {dates.length}
                </button>
              )}
            </div>

            <div className="-mx-1 overflow-x-auto">
              <div className="flex gap-2 px-1 pb-1">
                {upcoming
                  .filter((d) => openWeekdays.has(DAY_KEY[d.getDay()]))
                  .map((d) => {
                  const iso = toIsoDate(d);
                  const picked = dates.includes(iso);
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => toggleDate(iso)}
                      aria-pressed={picked}
                      className={cn(
                        "shrink-0 w-14 py-2 rounded-xl border-2 flex flex-col items-center justify-center transition-all min-h-[56px]",
                        picked
                          ? "border-brand bg-brand text-white"
                          : "border-border text-foreground",
                      )}
                    >
                      <span className="text-2xs uppercase tracking-wide">
                        {d.toLocaleDateString("en-AU", { weekday: "short" })}
                      </span>
                      <span className="text-base font-semibold leading-none">
                        {d.getDate()}
                      </span>
                      <span className="text-2xs opacity-70">
                        {d.toLocaleDateString("en-AU", { month: "short" })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="mt-1 text-2xs text-muted">
              Tap as many days as you need.
            </p>
          </div>

          {/* Session type */}
          <div>
            <label className="block text-xs font-medium text-foreground/70 mb-2">
              Session Type
            </label>
            {bookableSessions.length === 0 ? (
              <p className="text-xs text-muted">
                {selectedChild
                  ? "This centre isn't taking casual bookings online yet. Message head office and we'll sort it out."
                  : "Choose a child first."}
              </p>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {bookableSessions.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSessionType(key)}
                  className={cn(
                    "py-2.5 px-3 rounded-lg border-2 text-sm font-medium transition-all min-h-[44px] text-left",
                    sessionType === key
                      ? "border-brand bg-brand text-white"
                      : "border-border text-foreground hover:border-brand/30"
                  )}
                >
                  <span className="block leading-tight">
                    {roomLabel(sessionTimes, key)}
                  </span>
                  <span
                    className={cn(
                      "block text-xs leading-tight",
                      sessionType === key ? "text-white/75" : "text-muted",
                    )}
                  >
                    {formatTime(
                      sessionTimes?.[key]?.start ?? DEFAULT_ROOMS[key].start,
                    )}{" "}
                    –{" "}
                    {formatTime(
                      sessionTimes?.[key]?.end ?? DEFAULT_ROOMS[key].end,
                    )}
                  </span>
                </button>
              ))}
            </div>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!isValid || bulkBooking.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-brand hover:bg-brand-hover text-white text-base font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
          >
            {bulkBooking.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4" />
                {dates.length > 1
              ? `Request ${dates.length} sessions`
              : "Request booking"}
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
