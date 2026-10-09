"use client";

/**
 * Daily Ops → Attendances (2026-10-09, Daniel). One place, a tab strip at
 * the top:
 *   - Children: sign in & out for the day, with Day / Week / Month (OWNA's
 *     daily, weekly and monthly attendances)
 * Staff sign in & out lives in the Staff section.
 *   - Occupancy: the weekly occupancy figures (left as they were) — for the
 *     centre's account and the office
 * The tab rides its own `att` URL param — never `sub`, which is the page's
 * section key (that mix-up once sent Weekly Roster's Shifts to Daily Ops).
 */
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { isAdminRole } from "@/lib/role-permissions";
import { ServiceRollCallTab } from "../ServiceRollCallTab";
import { ServiceAttendanceTab } from "../ServiceAttendanceTab";

type Att = "children" | "occupancy";

export function AttendancesHub({ serviceId, serviceName }: { serviceId: string; serviceName?: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const runsCentre = isAdminRole(role) || (role === "member" && session?.user?.serviceId === serviceId);
  const tabs: { key: Att; label: string }[] = [
    { key: "children", label: "Children" },
    ...(runsCentre ? [{ key: "occupancy" as const, label: "Occupancy" }] : []),
  ];
  const raw = sp?.get("att");
  const att: Att = tabs.some((t) => t.key === raw) ? (raw as Att) : "children";
  const go = (next: Att) => {
    const params = new URLSearchParams(sp?.toString() ?? "");
    params.set("att", next);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border" role="tablist" aria-label="Attendances">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={att === t.key}
            onClick={() => go(t.key)}
            className={cn(
              "-mb-px min-h-11 border-b-2 px-4 text-sm font-semibold transition-colors",
              att === t.key ? "border-brand text-brand" : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {t.label === "Children" ? "Children attendances" : t.label}
          </button>
        ))}
      </div>
      {att === "children" && <ServiceRollCallTab serviceId={serviceId} serviceName={serviceName} />}
      {att === "occupancy" && runsCentre && <ServiceAttendanceTab serviceId={serviceId} serviceName={serviceName} />}
    </div>
  );
}
