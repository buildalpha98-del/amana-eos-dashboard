"use client";

/**
 * Access & positions on the staff profile (2026-10-08, after OWNA's
 * "Access & Permissions" tab): the person's permission ticks, registered
 * positions and "don't count in ratio". The server decides who may edit
 * (`canEdit` on the GET) — the office, or the Director for an educator at
 * their centre — and the card hides itself for anyone who may not read.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { STAFF_PERMISSIONS, STAFF_POSITIONS } from "@/lib/staff-permissions";
import { cn } from "@/lib/utils";

interface Access {
  permissions: string[];
  positions: string[];
  excludeFromRatio: boolean;
  canEdit: boolean;
}

export function AccessPositionsCard({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const key = ["user-access", userId];
  const [draft, setDraft] = useState<Omit<Access, "canEdit"> | null>(null);

  const { data, isLoading, isError } = useQuery<Access>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/users/${userId}/access`),
    retry: false,
    meta: { suppressGlobalErrorToast: true },
  });

  const save = useMutation({
    mutationFn: (body: Omit<Access, "canEdit">) =>
      mutateApi(`/api/users/${userId}/access`, { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setDraft(null);
      toast({ description: "Access saved." });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl mb-6" />;
  if (isError || !data) return null;

  const current = draft ?? {
    permissions: data.permissions,
    positions: data.positions,
    excludeFromRatio: data.excludeFromRatio,
  };
  const canEdit = data.canEdit;
  const toggle = (list: "permissions" | "positions", k: string) =>
    setDraft({
      ...current,
      [list]: current[list].includes(k)
        ? current[list].filter((x) => x !== k)
        : [...current[list], k],
    });

  // Read-only and nothing set: nothing worth a card.
  if (!canEdit && current.positions.length === 0 && current.permissions.length === 0) return null;

  return (
    <section
      id="section-access"
      className="mb-6 rounded-xl border border-border bg-card p-5 space-y-5 scroll-mt-24"
    >
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <KeyRound className="h-4 w-4 text-brand" />
          Access &amp; positions
        </h2>
        <p className="text-xs text-muted mt-0.5">
          On top of their role. Every tick here changes what the app lets them do.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-brand">Permissions</h3>
        {STAFF_PERMISSIONS.map((p) => (
          <label key={p.key} className={cn("flex items-start gap-3", canEdit && "cursor-pointer")}>
            <input
              type="checkbox"
              checked={current.permissions.includes(p.key)}
              disabled={!canEdit}
              onChange={() => toggle("permissions", p.key)}
              className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
            />
            <span>
              <span className="block text-sm font-semibold text-foreground">{p.label}</span>
              <span className="block text-xs text-muted mt-0.5">{p.help}</span>
            </span>
          </label>
        ))}
        <label className={cn("flex items-start gap-3", canEdit && "cursor-pointer")}>
          <input
            type="checkbox"
            checked={current.excludeFromRatio}
            disabled={!canEdit}
            onChange={(e) => setDraft({ ...current, excludeFromRatio: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
          />
          <span>
            <span className="block text-sm font-semibold text-foreground">Don&apos;t count in ratio</span>
            <span className="block text-xs text-muted mt-0.5">
              For office staff or a cook on the floor — the live ratio leaves them out so it never looks safer than it is.
            </span>
          </span>
        </label>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-brand">Positions</h3>
        <div className="flex flex-wrap gap-2">
          {STAFF_POSITIONS.map((p) => {
            const on = current.positions.includes(p.key);
            if (!canEdit && !on) return null;
            return (
              <button
                key={p.key}
                type="button"
                disabled={!canEdit}
                aria-pressed={on}
                onClick={() => toggle("positions", p.key)}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-sm transition-colors",
                  on
                    ? "border-brand bg-brand/10 text-brand font-medium"
                    : "border-border bg-card text-muted hover:border-brand/40",
                  !canEdit && "cursor-default",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted">
          Responsible Person marks who can be the designated RP — they&apos;re listed first in the RP register.
        </p>
      </div>

      {canEdit && draft && (
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={save.isPending}>
            Undo
          </Button>
          <Button size="sm" onClick={() => save.mutate(current)} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}
    </section>
  );
}
