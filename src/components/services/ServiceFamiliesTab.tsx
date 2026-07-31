"use client";

/**
 * Families with a child at THIS service.
 *
 * The Growth → Families page is the org-wide view; this is the same data
 * scoped to one centre, so a coordinator answering the phone doesn't have
 * to filter a list of every family Amana has.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronRight, Users } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

interface FamilyRow {
  id: string;
  email: string;
  name: string | null;
  familyName: string | null;
  enrolmentState: string;
  emailVerified: boolean;
  children: {
    id: string;
    name: string;
    status: string;
    serviceName: string | null;
  }[];
}

const STATE_LABEL: Record<string, { label: string; className: string }> = {
  active: {
    label: "Active",
    className:
      "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200",
  },
  pending_review: {
    label: "Awaiting review",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  },
  needs_enrolment: {
    label: "Not enrolled",
    className:
      "bg-surface text-muted border border-border",
  },
};

export function ServiceFamiliesTab({
  serviceId,
  serviceName,
}: {
  serviceId: string;
  serviceName?: string;
}) {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<{ families: FamilyRow[] }>({
    queryKey: ["families", { serviceId, search }],
    queryFn: () =>
      fetchApi(
        `/api/families?serviceId=${encodeURIComponent(serviceId)}` +
          (search ? `&search=${encodeURIComponent(search)}` : ""),
      ),
    retry: 2,
  });

  const families = data?.families ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search families…"
            aria-label="Search families"
            className="w-full pl-9 pr-3 py-2 text-base sm:text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <p className="text-sm text-muted">
          {families.length} {families.length === 1 ? "family" : "families"}
          {serviceName ? ` at ${serviceName}` : ""}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : families.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No families yet"
          description={
            search
              ? "No families match your search."
              : "Families appear here once a child is enrolled at this service."
          }
        />
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <ul className="divide-y divide-border">
            {families.map((f) => {
              const meta =
                STATE_LABEL[f.enrolmentState] ?? STATE_LABEL.needs_enrolment;
              // Only the children at THIS service — a family with a child
              // at another centre shouldn't have them listed here.
              const here = f.children.filter(
                (c) => !c.serviceName || c.serviceName === serviceName,
              );
              return (
                <li key={f.id}>
                  <Link
                    href={`/families/${f.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {f.familyName ?? f.name ?? f.email}
                      </p>
                      <p className="text-xs text-muted truncate">
                        {here.length > 0
                          ? here.map((c) => c.name).join(", ")
                          : "No children listed"}
                        {" · "}
                        {f.email}
                      </p>
                    </div>
                    <span
                      className={`text-2xs px-2 py-0.5 rounded-full shrink-0 ${meta.className}`}
                    >
                      {meta.label}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
