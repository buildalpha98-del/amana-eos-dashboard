"use client";

import { useState } from "react";
import { CalendarDays, ChevronRight, Clock, MapPin, UtensilsCrossed, X } from "lucide-react";
import { useParentDailyInfo, type WeekDayInfo } from "@/hooks/useParentPortal";

const SLOT_LABELS: Record<string, string> = {
  morning_tea: "Morning Tea",
  lunch: "Lunch",
  afternoon_tea: "Afternoon Tea",
};

const SLOT_ORDER = ["morning_tea", "lunch", "afternoon_tea"];

const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

export function DailyInfoWidgets() {
  const { data } = useParentDailyInfo();
  const [weekOpen, setWeekOpen] = useState(false);

  if (!data) return null;

  const { todayMenu, todayProgram } = data;
  const hasMenu = todayMenu && todayMenu.items.length > 0;
  const hasProgram = todayProgram.length > 0;
  // The week sheet is worth offering whenever ANY weekday has content —
  // on a Saturday, or a day with nothing on, "what's on this week" is
  // still the question being asked.
  const weekDays = (data.week ?? []).filter(
    (d) => d.menu.length > 0 || d.program.length > 0,
  );

  if (!hasMenu && !hasProgram && weekDays.length === 0) return null;

  return (
    <>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {hasMenu && (
        <section
          aria-label="Today's menu"
          className="bg-card rounded-xl p-4 shadow-sm border border-border"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center">
              <UtensilsCrossed className="w-4 h-4 text-orange-600" />
            </div>
            <h2 className="text-sm font-heading font-semibold text-foreground">
              Today&apos;s Menu
            </h2>
          </div>
          <div className="space-y-2.5">
            {[...todayMenu.items]
              .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
              .map((item, i) => (
                <div key={i}>
                  <p className="text-2xs font-semibold text-muted uppercase tracking-wider">
                    {SLOT_LABELS[item.slot] ?? item.slot}
                  </p>
                  <p className="text-sm text-foreground mt-0.5">{item.description}</p>
                  {item.allergens.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.allergens.map((a) => (
                        <span
                          key={a}
                          className="text-2xs bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </section>
      )}

      {hasProgram && (
        <section
          aria-label="Today's program"
          className="bg-card rounded-xl p-4 shadow-sm border border-border"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
              <CalendarDays className="w-4 h-4 text-brand" />
            </div>
            <h2 className="text-sm font-heading font-semibold text-foreground">
              Today&apos;s Program
            </h2>
          </div>
          <div className="space-y-3">
            {todayProgram.map((activity) => (
              <div key={activity.id} className="border-l-2 border-brand/20 pl-3">
                <div className="flex items-center gap-1.5 text-2xs text-muted">
                  <Clock className="w-3 h-3" />
                  <span>{activity.startTime} – {activity.endTime}</span>
                  {activity.location && (
                    <>
                      <MapPin className="w-3 h-3 ml-1" />
                      <span>{activity.location}</span>
                    </>
                  )}
                </div>
                <p className="text-sm font-medium text-foreground mt-0.5">
                  {activity.title}
                </p>
                {activity.description && (
                  <p className="text-xs text-muted mt-0.5 line-clamp-2">
                    {activity.description}
                  </p>
                )}
                {activity.staffName && (
                  <p className="text-2xs text-muted mt-0.5">
                    Staff: {activity.staffName}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>

    {weekDays.length > 0 && (
      <button
        type="button"
        onClick={() => setWeekOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl border border-border text-sm font-medium text-brand min-h-11"
      >
        See the whole week
        <ChevronRight className="w-4 h-4" />
      </button>
    )}

    {weekOpen && (
      <WeekSheet days={weekDays} onClose={() => setWeekOpen(false)} />
    )}
    </>
  );
}

/**
 * The week's menu and programme in one scroll.
 *
 * Parents plan around this — "what's for lunch Thursday", "when's the
 * excursion" — and those are week questions. Answering them one day at
 * a time meant they couldn't be answered at all.
 */
function WeekSheet({
  days,
  onClose,
}: {
  days: WeekDayInfo[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40"
      role="dialog"
      aria-modal="true"
      aria-label="This week at your centre"
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto bg-card rounded-t-2xl p-4"
        style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex justify-center pb-2">
          <span className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-heading font-semibold text-foreground">
            This week at your centre
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-lg text-muted min-h-11 min-w-11"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5">
          {days.map((d) => (
            <section key={d.day}>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                {DAY_LABELS[d.day] ?? d.day}
              </h3>

              {d.menu.length > 0 && (
                <div className="rounded-xl bg-surface p-3 mb-2 space-y-1.5">
                  {[...d.menu]
                    .sort(
                      (a, b) =>
                        SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
                    )
                    .map((item, i) => (
                      <p key={i} className="text-sm text-foreground">
                        <span className="text-2xs font-semibold text-muted uppercase tracking-wider mr-1.5">
                          {SLOT_LABELS[item.slot] ?? item.slot}
                        </span>
                        {item.description}
                      </p>
                    ))}
                </div>
              )}

              {d.program.map((a) => (
                <div key={a.id} className="border-l-2 border-brand/20 pl-3 mb-2">
                  <p className="text-2xs text-muted">
                    {a.startTime} – {a.endTime}
                    {a.location ? ` · ${a.location}` : ""}
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {a.title}
                  </p>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
