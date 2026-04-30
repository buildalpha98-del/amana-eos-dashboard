import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintActions } from "../../_components/PrintActions";

/**
 * Print view: weekly program, split into Before / After School Care.
 *
 * URL: /services/[id]/program/print?weekStart=YYYY-MM-DD
 *
 * Renders a clean A4-portrait layout for centre noticeboards. The same
 * BSC/ASC split logic as the live tab (startTime < 12:00 = BSC) so the
 * print matches what the coordinator just edited.
 */

type Session = "bsc" | "asc";
type Day = "monday" | "tuesday" | "wednesday" | "thursday" | "friday";

const DAYS: Day[] = ["monday", "tuesday", "wednesday", "thursday", "friday"];

const DAY_LABELS: Record<Day, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

const SESSION_LABELS: Record<Session, string> = {
  bsc: "Before School Care",
  asc: "After School Care",
};

const SESSION_HINTS: Record<Session, string> = {
  bsc: "Typically 6:30am – 9:00am",
  asc: "Typically 3:00pm – 6:30pm",
};

function sessionForTime(startTime: string): Session {
  const hour = parseInt(startTime.split(":")[0], 10);
  return hour < 12 ? "bsc" : "asc";
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekLabel(monday: Date): string {
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const startStr = monday.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
  const endStr = friday.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${startStr} – ${endStr}`;
}

export default async function ProgramPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ weekStart?: string }>;
}) {
  const { id } = await params;
  const { weekStart: weekStartParam } = await searchParams;

  const weekStart = weekStartParam
    ? new Date(weekStartParam)
    : getMondayOfWeek(new Date());
  weekStart.setHours(0, 0, 0, 0);

  const [service, activities] = await Promise.all([
    prisma.service.findUnique({
      where: { id },
      select: { id: true, name: true },
    }),
    prisma.programActivity.findMany({
      where: { serviceId: id, weekStart },
      orderBy: [{ day: "asc" }, { startTime: "asc" }],
    }),
  ]);

  if (!service) notFound();

  // Split into BSC / ASC by startTime
  const split: Record<Session, Record<Day, typeof activities>> = {
    bsc: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [] },
    asc: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [] },
  };
  for (const a of activities) {
    const session = sessionForTime(a.startTime);
    if (DAYS.includes(a.day as Day)) {
      split[session][a.day as Day].push(a);
    }
  }

  const totalCount = activities.length;

  return (
    <div className="font-sans">
      {/* Screen-only toolbar */}
      <div className="no-print mb-6 flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Print preview
          </p>
          <h1 className="text-base font-semibold text-gray-800">
            Weekly program — {service.name}
          </h1>
        </div>
        <PrintActions />
      </div>

      {/* Print header */}
      <header className="print-header mb-6 border-b-2 border-[#004E64] pb-3 text-center">
        <div className="text-2xl font-bold tracking-tight text-[#004E64]">
          {service.name}
        </div>
        <div className="mt-1 text-sm text-gray-700">
          Weekly Program · {formatWeekLabel(weekStart)}
        </div>
        <div className="mt-1 text-xs text-gray-500">
          {totalCount} {totalCount === 1 ? "activity" : "activities"} ·
          Generated {new Date().toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </div>
      </header>

      {totalCount === 0 ? (
        <p className="text-center text-sm text-gray-500 py-8">
          No activities planned for this week yet.
        </p>
      ) : (
        <div className="space-y-8">
          {(["bsc", "asc"] as const).map((session) => {
            const sessionTotal = DAYS.reduce(
              (acc, d) => acc + split[session][d].length,
              0,
            );
            return (
              <section
                key={session}
                className="print-page-avoid-break"
                style={{ pageBreakInside: "avoid" }}
              >
                <h2 className="mb-3 border-b border-gray-300 pb-1 text-base font-semibold text-[#004E64]">
                  {SESSION_LABELS[session]}{" "}
                  <span className="text-xs font-normal text-gray-500">
                    · {SESSION_HINTS[session]} · {sessionTotal}{" "}
                    {sessionTotal === 1 ? "activity" : "activities"}
                  </span>
                </h2>
                {sessionTotal === 0 ? (
                  <p className="py-4 text-center text-xs italic text-gray-400">
                    No {SESSION_LABELS[session]} activities planned this week.
                  </p>
                ) : (
                  <div className="grid grid-cols-5 gap-3">
                    {DAYS.map((day) => (
                      <div
                        key={day}
                        className="rounded border border-gray-300 p-2"
                      >
                        <div className="mb-2 border-b border-gray-200 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-700">
                          {DAY_LABELS[day]}
                        </div>
                        {split[session][day].length === 0 ? (
                          <div className="py-3 text-center text-[10px] italic text-gray-400">
                            —
                          </div>
                        ) : (
                          <ul className="space-y-2">
                            {split[session][day].map((a) => (
                              <li
                                key={a.id}
                                className="border-l-2 border-[#004E64] pl-2 text-[11px] leading-snug"
                              >
                                <div className="font-mono text-[10px] text-gray-600">
                                  {a.startTime}–{a.endTime}
                                </div>
                                <div className="font-semibold text-gray-900">
                                  {a.title}
                                </div>
                                {a.staffName && (
                                  <div className="text-[10px] text-gray-600">
                                    {a.staffName}
                                  </div>
                                )}
                                {a.location && (
                                  <div className="text-[10px] italic text-gray-500">
                                    {a.location}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <footer className="mt-10 border-t border-gray-200 pt-3 text-center text-[10px] text-gray-500">
        Amana OSHC · Weekly program for {service.name} ·{" "}
        {formatWeekLabel(weekStart)}
      </footer>
    </div>
  );
}
