"use client";

/**
 * Per-centre behaviour toggles, laid out like OWNA's Settings (2026-10-08):
 * one white panel, tabs across the top, each setting a checkbox + bold
 * title + one plain sentence.
 *
 * OWNA's screen has around seventy switches, most for long day care
 * (nappies, bottles, sleep checks). This has five, on purpose: a toggle
 * is only here if it changes what the server does. A settings page full
 * of switches that do nothing teaches people to distrust all of them.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { cn } from "@/lib/utils";

interface Settings {
  parents: { canMarkAbsence: boolean };
  posts: { draftByDefault: boolean; onlyApproversPublish: boolean };
  signInOut: { requireSignature: boolean };
  staff: { phoneClockIn: boolean };
}

interface Row {
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

const TABS = [
  { key: "families", label: "Families & app" },
  { key: "posts", label: "Posts" },
  { key: "signInOut", label: "Sign in & out" },
  { key: "staff", label: "Staff" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

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
  const [tab, setTab] = useState<TabKey>("families");

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
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }

  const current = draft ?? data?.settings ?? null;
  if (!current) return null;
  const dirty = draft !== null;

  const set = <K extends keyof Settings>(k: K, patch: Partial<Settings[K]>) =>
    setDraft({ ...current, [k]: { ...current[k], ...patch } });

  const rows: Record<TabKey, Row[]> = {
    families: [
      {
        label: "Families can mark a child as not attending",
        help: "Off means absences are phoned through — worth it if you want someone to hear why, not just that.",
        checked: current.parents.canMarkAbsence,
        onChange: (v) => set("parents", { canMarkAbsence: v }),
      },
    ],
    posts: [
      {
        label: "New posts start as drafts",
        help: "Everything written here waits for someone to release it. Educators' posts already do this.",
        checked: current.posts.draftByDefault,
        onChange: (v) => set("posts", { draftByDefault: v }),
      },
      {
        label: "Only admins can publish posts",
        help: "Coordinators can still write; their posts wait as drafts. Only worth turning on if someone actually checks them.",
        checked: current.posts.onlyApproversPublish,
        onChange: (v) => set("posts", { onlyApproversPublish: v }),
      },
    ],
    signInOut: [
      {
        label: "Require a signature at sign in and sign out",
        help: "Whoever drops off or collects draws their signature on the Sign in/out screen, and it's kept on the attendance register.",
        checked: current.signInOut.requireSignature,
        onChange: (v) => set("signInOut", { requireSignature: v }),
      },
    ],
    staff: [
      {
        label: "Educators can clock in from their own phone",
        help: "Off means the centre's kiosk is the only way to clock in or out — nobody can clock out from the car park or from home.",
        checked: current.staff.phoneClockIn,
        onChange: (v) => set("staff", { phoneClockIn: v }),
      },
    ],
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 pt-3 overflow-x-auto">
        <nav className="flex gap-1 -mb-px" aria-label="Settings">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-t-lg border px-3.5 py-2 text-sm font-medium transition-colors",
                tab === t.key
                  ? "border-border border-b-card bg-card text-foreground"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-4 sm:p-6 space-y-5">
        {rows[tab].map((r) => (
          <label key={r.label} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={r.checked}
              disabled={!canEdit}
              onChange={(e) => r.onChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
            />
            <span>
              <span className="block text-sm font-semibold text-foreground">{r.label}</span>
              <span className="block text-xs text-muted mt-0.5">{r.help}</span>
            </span>
          </label>
        ))}

        {canEdit ? (
          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <span className="text-xs text-muted mr-auto">
              {dirty ? "Unsaved changes" : "Every switch here changes what the app actually does."}
            </span>
            {dirty && (
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={save.isPending}>
                Undo
              </Button>
            )}
            <Button size="sm" onClick={() => save.mutate(current)} disabled={!dirty || save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted border-t border-border pt-4">
            Only an admin or this centre&apos;s coordinator can change these.
          </p>
        )}
      </div>
    </div>
  );
}
