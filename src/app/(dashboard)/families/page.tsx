"use client";

/**
 * /families — staff view of parent accounts and their children.
 *
 * 2026-07-30, per Daniel. Shows where each family has got to in the new
 * account → enrolment flow, and lets an owner delete a test account to
 * re-run signup.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2, Users, Loader2, Send } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { useSession } from "next-auth/react";
import type { ParentEnrolmentState } from "@/lib/parent-enrolment-state";

interface Family {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  enrolmentState: ParentEnrolmentState;
  draftStep: number | null;
  draftUpdatedAt: string | null;
  enrolmentCount: number;
  reminderSentAt: string | null;
  children: { id: string; name: string; status: string }[];
}

const STATE_META: Record<
  ParentEnrolmentState,
  { label: string; className: string }
> = {
  needs_enrolment: {
    label: "Enrolment not started",
    className:
      "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800",
  },
  pending_review: {
    label: "Awaiting review",
    className:
      "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800",
  },
  active: {
    label: "Approved",
    className:
      "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800",
  },
};

/** "3 days ago" / "5h ago" — short enough for a table cell. */
function timeAgo(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function FamiliesPage() {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isOwner = session?.user?.role === "owner";

  const { data, isLoading, error, refetch } = useQuery<{ families: Family[] }>({
    queryKey: ["families", search],
    queryFn: () =>
      fetchApi(`/api/families${search ? `?search=${encodeURIComponent(search)}` : ""}`),
    staleTime: 30_000,
  });

  const del = useMutation({
    mutationFn: (id: string) =>
      mutateApi<{ ok: true; email: string }>(`/api/families/${id}`, {
        method: "DELETE",
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["families"] });
      toast({
        description: `Account removed. ${res.email} can now sign up again.`,
      });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const remind = useMutation({
    mutationFn: (id: string) =>
      mutateApi<{ ok: true; email: string }>(`/api/families/${id}/remind`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["families"] });
      toast({ description: `Reminder sent to ${res.email}.` });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const families = data?.families ?? [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Families"
        description="Parent accounts, their enrolment progress, and their children."
      />

      {error && (
        <ErrorState title="Couldn't load families" error={error as Error} onRetry={refetch} />
      )}

      {!error && (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : families.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No family accounts yet"
              description="Parent accounts appear here once families sign up through the family portal."
            />
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface/60 border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide">Family</th>
                      <th className="text-left px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide">Children</th>
                      <th className="text-left px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide">Email</th>
                      <th className="text-left px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide">Last login</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {families.map((f) => {
                      const meta = STATE_META[f.enrolmentState];
                      return (
                        <tr key={f.id} className="hover:bg-surface/40">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{f.name ?? "—"}</p>
                            <p className="text-xs text-muted">{f.email}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-2xs font-medium ${meta.className}`}>
                              {meta.label}
                            </span>
                            {f.enrolmentState === "needs_enrolment" && f.draftStep !== null && (
                              <p className="text-2xs text-muted mt-1">
                                In progress · step {f.draftStep + 1}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted">
                            {f.children.length === 0 ? (
                              <span className="text-muted/50">—</span>
                            ) : (
                              <span className="text-foreground/80">
                                {f.children.map((c) => c.name).join(", ")}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {f.emailVerified ? (
                              <span className="text-emerald-600 dark:text-emerald-400 text-xs">Confirmed</span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 text-xs">Unconfirmed</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted whitespace-nowrap">
                            {formatDate(f.lastLoginAt)}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {f.enrolmentState === "needs_enrolment" && (
                              <span className="inline-flex items-center gap-1.5 mr-1">
                                {f.reminderSentAt && (
                                  <span className="text-2xs text-muted">
                                    Reminded {timeAgo(f.reminderSentAt)}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => remind.mutate(f.id)}
                                  disabled={remind.isPending}
                                  title="Email this family a link to finish their enrolment"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-brand/30 text-brand text-xs font-medium hover:bg-brand/5 disabled:opacity-40"
                                >
                                  {remind.isPending ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Send className="w-3 h-3" />
                                  )}
                                  {f.reminderSentAt ? "Remind again" : "Send reminder"}
                                </button>
                              </span>
                            )}
                            {isOwner && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Delete the login account for ${f.email}?\n\nThis removes their account and any half-finished enrolment form, so the email can sign up again. Submitted enrolments and child records are NOT deleted.`,
                                    )
                                  ) {
                                    del.mutate(f.id);
                                  }
                                }}
                                disabled={del.isPending}
                                aria-label={`Delete account for ${f.email}`}
                                title="Delete login account (keeps enrolment records)"
                                className="p-1.5 rounded-md text-muted hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40"
                              >
                                {del.isPending ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
