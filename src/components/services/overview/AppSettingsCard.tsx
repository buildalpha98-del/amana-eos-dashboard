"use client";

/**
 * Per-centre behaviour toggles.
 *
 * OWNA's equivalent screen has around eighty switches. This has three,
 * on purpose: a toggle is only here if it changes what the server does.
 * A settings page full of switches that do nothing teaches people to
 * distrust all of them — which is how their "50%+ Diploma: NaN" ends up
 * being scrolled past.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

interface Settings {
  parents: { canMarkAbsence: boolean };
  posts: { draftByDefault: boolean; onlyApproversPublish: boolean };
}

export function AppSettingsCard({
  serviceId,
  canEdit,
}: {
  serviceId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const key = ["service", serviceId, "app-settings"];
  const [draft, setDraft] = useState<Settings | null>(null);

  const { data, isLoading } = useQuery<{ settings: Settings }>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/services/${serviceId}/app-settings`),
    retry: 1,
  });

  const save = useMutation({
    mutationFn: (body: Settings) =>
      mutateApi(`/api/services/${serviceId}/app-settings`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setDraft(null);
      toast({ description: "Settings saved." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-lg" />;
  }

  const current = draft ?? data?.settings ?? null;
  if (!current) return null;
  const dirty = draft !== null;

  const set = (patch: Partial<Settings>) =>
    setDraft({ ...current, ...patch } as Settings);

  const rows: Array<{
    label: string;
    help: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  }> = [
    {
      label: "Families can mark a child as not attending",
      help: "Off means absences are phoned through — worth it if you want someone to hear why, not just that.",
      checked: current.parents.canMarkAbsence,
      onChange: (v) => set({ parents: { canMarkAbsence: v } }),
    },
    {
      label: "New posts start as drafts",
      help: "Everything written here waits for someone to release it. Educators' posts already do this.",
      checked: current.posts.draftByDefault,
      onChange: (v) =>
        set({ posts: { ...current.posts, draftByDefault: v } }),
    },
    {
      label: "Only admins can publish posts",
      help: "Coordinators can still write; their posts wait as drafts. Only worth turning on if someone actually checks them.",
      checked: current.posts.onlyApproversPublish,
      onChange: (v) =>
        set({ posts: { ...current.posts, onlyApproversPublish: v } }),
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <SlidersHorizontal className="h-4 w-4 text-brand" />
          Settings
        </h3>
        <p className="text-xs text-muted mt-0.5">
          How this centre behaves for families and for posting. Every switch
          here changes what the app actually does.
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <label
            key={r.label}
            className="flex items-start gap-3 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={r.checked}
              disabled={!canEdit}
              onChange={(e) => r.onChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
            />
            <span className="text-sm text-foreground">
              {r.label}
              <span className="block text-xs text-muted">{r.help}</span>
            </span>
          </label>
        ))}
      </div>

      {canEdit && dirty && (
        <div className="flex gap-2">
          <Button onClick={() => save.mutate(current)} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save settings"}
          </Button>
          <Button variant="secondary" onClick={() => setDraft(null)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
