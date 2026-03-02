"use client";

import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

function formatWeekLabel(date: Date): string {
  const end = new Date(date);
  end.setDate(end.getDate() + 6);

  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const startStr = date.toLocaleDateString("en-AU", opts);
  const endStr = end.toLocaleDateString("en-AU", {
    ...opts,
    year: "numeric",
  });

  return `${startStr} – ${endStr}`;
}

function isCurrentWeek(date: Date): boolean {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const currentWeekStart = new Date(now);
  currentWeekStart.setDate(diff);
  currentWeekStart.setHours(0, 0, 0, 0);

  return date.getTime() === currentWeekStart.getTime();
}

export function WeekSelector({
  value,
  onChange,
}: {
  value: Date;
  onChange: (date: Date) => void;
}) {
  const goBack = () => {
    const prev = new Date(value);
    prev.setDate(prev.getDate() - 7);
    onChange(prev);
  };

  const goForward = () => {
    const next = new Date(value);
    next.setDate(next.getDate() + 7);
    onChange(next);
  };

  const goToday = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(now);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    onChange(start);
  };

  const current = isCurrentWeek(value);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center bg-white border border-gray-200 rounded-lg">
        <button
          onClick={goBack}
          className="p-2 hover:bg-gray-50 rounded-l-lg transition-colors border-r border-gray-200"
          title="Previous week"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="px-4 py-2 flex items-center gap-2 min-w-[220px] justify-center">
          <Calendar className="w-4 h-4 text-[#1B4D3E]" />
          <span className="text-sm font-medium text-gray-900">
            {formatWeekLabel(value)}
          </span>
        </div>
        <button
          onClick={goForward}
          className="p-2 hover:bg-gray-50 rounded-r-lg transition-colors border-l border-gray-200"
          title="Next week"
        >
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {!current && (
        <button
          onClick={goToday}
          className="px-3 py-2 text-sm font-medium text-[#1B4D3E] bg-[#1B4D3E]/5 hover:bg-[#1B4D3E]/10 rounded-lg transition-colors"
        >
          This Week
        </button>
      )}
    </div>
  );
}
