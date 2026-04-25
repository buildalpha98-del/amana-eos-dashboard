import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintActions } from "../../_components/PrintActions";

/**
 * Print view: weekly menu — 5-day rows × 3-slot columns.
 *
 * URL: /services/[id]/menu/print?weekStart=YYYY-MM-DD
 *
 * Renders a clean A4-portrait grid suitable for the kitchen noticeboard.
 * Allergens are listed inline under each meal in italic so anyone scanning
 * the board can spot a flag without rifling through colour codes.
 */

type Day = "monday" | "tuesday" | "wednesday" | "thursday" | "friday";
type Slot = "morning_tea" | "lunch" | "afternoon_tea";

const DAYS: Day[] = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const SLOTS: Slot[] = ["morning_tea", "lunch", "afternoon_tea"];

const DAY_LABELS: Record<Day, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

const SLOT_LABELS: Record<Slot, string> = {
  morning_tea: "Morning Tea",
  lunch: "Lunch",
  afternoon_tea: "Afternoon Tea",
};

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

export default async function MenuPrintPage({
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

  const [service, menuWeek] = await Promise.all([
    prisma.service.findUnique({
      where: { id },
      select: { id: true, name: true },
    }),
    prisma.menuWeek.findUnique({
      where: { serviceId_weekStart: { serviceId: id, weekStart } },
      include: {
        items: true,
      },
    }),
  ]);

  if (!service) notFound();

  // Build a quick lookup: items[day][slot] => MenuItem
  const itemMap: Record<Day, Record<Slot, { description: string; allergens: string[] } | null>> = {
    monday: { morning_tea: null, lunch: null, afternoon_tea: null },
    tuesday: { morning_tea: null, lunch: null, afternoon_tea: null },
    wednesday: { morning_tea: null, lunch: null, afternoon_tea: null },
    thursday: { morning_tea: null, lunch: null, afternoon_tea: null },
    friday: { morning_tea: null, lunch: null, afternoon_tea: null },
  };
  for (const item of menuWeek?.items ?? []) {
    if (DAYS.includes(item.day as Day) && SLOTS.includes(item.slot as Slot)) {
      itemMap[item.day as Day][item.slot as Slot] = {
        description: item.description,
        allergens: item.allergens,
      };
    }
  }

  const totalCount = (menuWeek?.items ?? []).filter(
    (i) => i.description.trim().length > 0,
  ).length;

  return (
    <div className="font-sans">
      {/* Screen-only toolbar */}
      <div className="no-print mb-6 flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Print preview
          </p>
          <h1 className="text-base font-semibold text-gray-800">
            Weekly menu — {service.name}
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
          Weekly Menu · {formatWeekLabel(weekStart)}
        </div>
        <div className="mt-1 text-xs text-gray-500">
          {totalCount} {totalCount === 1 ? "meal planned" : "meals planned"} ·
          Generated {new Date().toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </div>
      </header>

      {totalCount === 0 ? (
        <p className="text-center text-sm text-gray-500 py-8">
          No menu items for this week yet.
        </p>
      ) : (
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="w-[120px] border border-gray-300 bg-gray-100 p-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-700">
                Day
              </th>
              {SLOTS.map((slot) => (
                <th
                  key={slot}
                  className="border border-gray-300 bg-gray-100 p-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-700"
                >
                  {SLOT_LABELS[slot]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day) => (
              <tr key={day} className="even:bg-gray-50">
                <td className="border border-gray-300 p-2 align-top text-xs font-semibold text-[#004E64]">
                  {DAY_LABELS[day]}
                </td>
                {SLOTS.map((slot) => {
                  const cell = itemMap[day][slot];
                  return (
                    <td
                      key={slot}
                      className="border border-gray-300 p-2 align-top"
                    >
                      {cell && cell.description.trim().length > 0 ? (
                        <>
                          <div className="text-[11px] text-gray-900">
                            {cell.description}
                          </div>
                          {cell.allergens.length > 0 && (
                            <div className="mt-1 text-[9px] italic text-gray-500">
                              Allergens: {cell.allergens.join(", ")}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] italic text-gray-400">
                          —
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {menuWeek?.notes && menuWeek.notes.trim().length > 0 && (
        <section className="mt-6 rounded border border-gray-300 bg-gray-50 p-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-700">
            Notes
          </div>
          <div className="whitespace-pre-wrap text-xs text-gray-800">
            {menuWeek.notes}
          </div>
        </section>
      )}

      <footer className="mt-10 border-t border-gray-200 pt-3 text-center text-[10px] text-gray-500">
        Amana OSHC · Weekly menu for {service.name} ·{" "}
        {formatWeekLabel(weekStart)}
      </footer>
    </div>
  );
}
