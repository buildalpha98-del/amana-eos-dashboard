"use client";

import { CalendarDays, Clock, MapPin, UtensilsCrossed } from "lucide-react";
import { useParentDailyInfo } from "@/hooks/useParentPortal";

const SLOT_LABELS: Record<string, string> = {
  morning_tea: "Morning Tea",
  lunch: "Lunch",
  afternoon_tea: "Afternoon Tea",
};

const SLOT_ORDER = ["morning_tea", "lunch", "afternoon_tea"];

export function DailyInfoWidgets() {
  const { data } = useParentDailyInfo();

  if (!data) return null;

  const { todayMenu, todayProgram } = data;
  const hasMenu = todayMenu && todayMenu.items.length > 0;
  const hasProgram = todayProgram.length > 0;

  if (!hasMenu && !hasProgram) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {hasMenu && (
        <section
          aria-label="Today's menu"
          className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
              <UtensilsCrossed className="w-4 h-4 text-orange-600" />
            </div>
            <h2 className="text-sm font-heading font-semibold text-[#1a1a2e]">
              Today&apos;s Menu
            </h2>
          </div>
          <div className="space-y-2.5">
            {[...todayMenu.items]
              .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
              .map((item, i) => (
                <div key={i}>
                  <p className="text-[10px] font-semibold text-[#7c7c8a] uppercase tracking-wider">
                    {SLOT_LABELS[item.slot] ?? item.slot}
                  </p>
                  <p className="text-sm text-[#1a1a2e] mt-0.5">{item.description}</p>
                  {item.allergens.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.allergens.map((a) => (
                        <span
                          key={a}
                          className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full"
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
          className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-[#004E64]/10 flex items-center justify-center">
              <CalendarDays className="w-4 h-4 text-[#004E64]" />
            </div>
            <h2 className="text-sm font-heading font-semibold text-[#1a1a2e]">
              Today&apos;s Program
            </h2>
          </div>
          <div className="space-y-3">
            {todayProgram.map((activity) => (
              <div key={activity.id} className="border-l-2 border-[#004E64]/20 pl-3">
                <div className="flex items-center gap-1.5 text-[10px] text-[#7c7c8a]">
                  <Clock className="w-3 h-3" />
                  <span>{activity.startTime} – {activity.endTime}</span>
                  {activity.location && (
                    <>
                      <MapPin className="w-3 h-3 ml-1" />
                      <span>{activity.location}</span>
                    </>
                  )}
                </div>
                <p className="text-sm font-medium text-[#1a1a2e] mt-0.5">
                  {activity.title}
                </p>
                {activity.description && (
                  <p className="text-xs text-[#7c7c8a] mt-0.5 line-clamp-2">
                    {activity.description}
                  </p>
                )}
                {activity.staffName && (
                  <p className="text-[10px] text-[#7c7c8a] mt-0.5">
                    Staff: {activity.staffName}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
