"use client";

/**
 * Service → Documents (2026-10-08, Daniel). Everything a coordinator needs
 * to hand for a regulator spot check at THIS centre:
 *   - Policies & procedures — the whole library (synced from SharePoint),
 *     minus the other state's state-only documents;
 *   - Staff files — every staff member here, their certificates and
 *     documents, and what's missing for their role
 *     (GET /api/services/[id]/staff-files; Directors of this centre + admins).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Award, CheckCircle2, ChevronDown, ChevronRight, FileText, Search } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { PolicyStaffPanel } from "@/components/policies/PolicyStaffPanel";
import { cn } from "@/lib/utils";

interface StaffFile {
  kind: "certificate" | "document";
  id: string;
  title: string;
  expiryDate: string | null;
  expired: boolean;
  href: string;
}

interface StaffRow {
  userId: string;
  name: string;
  role: string;
  missing: string[];
  files: StaffFile[];
}

export function ServiceDocumentsTab({
  serviceId,
  serviceState,
  sub,
}: {
  serviceId: string;
  serviceState: string | null;
  sub: string;
}) {
  if (sub === "staff-files") return <ServiceStaffFiles serviceId={serviceId} />;
  return <PolicyStaffPanel stateFilter={serviceState} />;
}

function ServiceStaffFiles({ serviceId }: { serviceId: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<{ staff: StaffRow[] }>({
    queryKey: ["service-staff-files", serviceId],
    queryFn: () => fetchApi(`/api/services/${serviceId}/staff-files`),
    staleTime: 60_000,
    retry: 1,
  });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const staff = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.staff ?? []).filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [data, query]);

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (isError) {
    return <ErrorState title="Couldn't load staff files" error={error as Error} onRetry={() => refetch()} />;
  }

  const all = data?.staff ?? [];
  const complete = all.filter((s) => s.missing.length === 0).length;
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4" data-testid="service-staff-files">
      <div className="flex flex-wrap items-center gap-3">
        <p
          className={cn(
            "text-sm font-medium",
            complete === all.length ? "text-success" : "text-amber-700 dark:text-amber-300",
          )}
        >
          {complete} of {all.length} staff have every required certificate on file
        </p>
        <label className="relative ml-auto w-full sm:w-64">
          <span className="sr-only">Find a staff member</span>
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a staff member"
            className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm"
          />
        </label>
      </div>

      {staff.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No staff at this centre yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {staff.map((s) => {
            const isOpen = open.has(s.userId);
            return (
              <li key={s.userId}>
                <button
                  type="button"
                  onClick={() => toggle(s.userId)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-surface transition-colors"
                >
                  {s.missing.length === 0 ? (
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-success" aria-hidden />
                  ) : (
                    <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{s.name}</span>
                    <span className="block text-xs text-muted">
                      {s.files.length} file{s.files.length === 1 ? "" : "s"}
                      {s.missing.length > 0 && (
                        <span className="text-amber-700 dark:text-amber-300"> · missing {s.missing.join(", ")}</span>
                      )}
                    </span>
                  </span>
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-muted shrink-0" aria-hidden />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden />
                  )}
                </button>
                {isOpen && (
                  <ul className="border-t border-border bg-surface/40">
                    {s.files.length === 0 && (
                      <li className="px-4 py-3 text-sm text-muted">Nothing uploaded yet.</li>
                    )}
                    {s.files.map((f) => {
                      const Icon = f.kind === "certificate" ? Award : FileText;
                      return (
                        <li key={`${f.kind}-${f.id}`}>
                          <a
                            href={f.href}
                            target="_blank"
                            rel="noopener"
                            className="flex items-center gap-3 px-4 py-2.5 pl-12 hover:bg-surface"
                          >
                            <Icon className="w-4 h-4 text-brand shrink-0" aria-hidden />
                            <span className="flex-1 min-w-0 text-sm text-foreground truncate">{f.title}</span>
                            {f.expiryDate && (
                              <span
                                className={cn(
                                  "text-xs shrink-0",
                                  f.expired ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted",
                                )}
                              >
                                {f.expired ? "Expired " : "Expires "}
                                {new Date(f.expiryDate).toLocaleDateString("en-AU", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </span>
                            )}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
