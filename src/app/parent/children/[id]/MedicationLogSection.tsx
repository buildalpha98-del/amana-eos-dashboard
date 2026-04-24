"use client";

/**
 * MedicationLogSection — parent-side read-only log of doses administered at
 * the centre. Renders up to 10 most-recent doses with timestamp, medication,
 * dose, route, and who administered.
 *
 * Only renders when there's history — silent when empty.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { SectionLabel } from "@/components/parent/ui";
import { Pill } from "lucide-react";
import { cn } from "@/lib/utils";

interface ParentDose {
  id: string;
  medicationName: string;
  dose: string;
  route: "oral" | "topical" | "inhaled" | "injection" | "other";
  administeredAt: string;
  notes: string | null;
  administeredBy: { name: string };
  witnessedBy: { name: string } | null;
}

export function MedicationLogSection({ childId }: { childId: string }) {
  const { data, isLoading } = useQuery<{ items: ParentDose[] }>({
    queryKey: ["parent-child-medications", childId],
    queryFn: () =>
      fetchApi<{ items: ParentDose[] }>(
        `/api/parent/children/${childId}/medications`,
      ),
    retry: 2,
    staleTime: 30_000,
  });

  const items = data?.items ?? [];
  if (isLoading || items.length === 0) return null;

  return (
    <section aria-label="Medication log" className="space-y-2">
      <SectionLabel label="Medication log" />
      <ul className="space-y-1.5">
        {items.slice(0, 10).map((d) => {
          const t = new Date(d.administeredAt);
          return (
            <li key={d.id} className="warm-card flex items-start gap-3">
              <div
                className={cn(
                  "w-8 h-8 rounded-full shrink-0 flex items-center justify-center",
                  "bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)]",
                )}
              >
                <Pill className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[color:var(--color-foreground)]">
                  <span className="font-semibold">{d.medicationName}</span>{" "}
                  <span className="text-[color:var(--color-muted)]">— {d.dose}</span>
                  <span className="text-[color:var(--color-muted)] capitalize">
                    {" "}({d.route})
                  </span>
                </p>
                <p className="text-[11px] text-[color:var(--color-muted)]">
                  {t.toLocaleString(undefined, {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  · {d.administeredBy.name}
                  {d.witnessedBy ? ` · witnessed by ${d.witnessedBy.name}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
