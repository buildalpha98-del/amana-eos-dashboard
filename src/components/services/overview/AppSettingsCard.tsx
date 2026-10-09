"use client";

/**
 * Per-centre behaviour toggles, laid out like OWNA's Settings (2026-10-08):
 * one white panel, tabs across the top, each setting a checkbox + bold
 * title + one plain sentence. Rows are full-width switches since
 * 2026-10-09: most staff are on a phone or the centre iPad.
 *
 * OWNA's screen has around seventy switches, most for long day care
 * (nappies, bottles, sleep checks). This has five, on purpose: a toggle
 * is only here if it changes what the server does. A settings page full
 * of switches that do nothing teaches people to distrust all of them.
 */

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { isAdminRole } from "@/lib/role-permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { cn } from "@/lib/utils";

interface Settings {
  parents: { canMarkAbsence: boolean; attendanceNotifications: boolean; attendanceEmails: boolean };
  posts: { draftByDefault: boolean; onlyApproversPublish: boolean };
  signInOut: { requireSignature: boolean };
  staff: { phoneClockIn: boolean; instantClaim: boolean };
  checklists: { dueTimes: Partial<Record<"bsc" | "asc" | "vc", Record<string, string>>> };
}

interface Row {
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Only the office may change it (it restrains the Coordinator). */
  adminOnly?: boolean;
  /** Greyed out because another switch makes it moot. */
  disabledBecause?: string;
}

const TABS = [
  { key: "families", label: "Families & app" },
  { key: "posts", label: "Posts" },
  { key: "signInOut", label: "Sign in & out" },
  { key: "staff", label: "Staff" },
  { key: "checklists", label: "Checklists" },
] as const;

const DUE_SESSIONS = [
  { key: "bsc", label: "Before school" },
  { key: "asc", label: "After school" },
  { key: "vc", label: "Vacation care" },
] as const;
const DUE_SECTIONS = [
  { key: "opening", label: "Opening" },
  { key: "closing", label: "Closing" },
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
  const { data: session } = useSession();
  const isAdmin = isAdminRole(session?.user?.role);

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

  const setDue = (session: string, section: string, value: string) => {
    const next = { ...current.checklists.dueTimes } as Record<string, Record<string, string>>;
    const forSession = { ...(next[session] ?? {}) };
    if (value) forSession[section] = value;
    else delete forSession[section];
    if (Object.keys(forSession).length) next[session] = forSession;
    else delete next[session];
    setDraft({ ...current, checklists: { dueTimes: next } });
  };

  const rows: Record<Exclude<TabKey, "checklists">, Row[]> = {
    families: [
      {
        label: "Families can mark a child as not attending",
        help: "Off means absences are phoned through — worth it if you want someone to hear why, not just that.",
        checked: current.parents.canMarkAbsence,
        onChange: (v) => set("parents", { canMarkAbsence: v }),
      },
      {
        label: "Tell families when their child is signed in and out",
        help: "A notification in the family app as each child arrives and leaves.",
        checked: current.parents.attendanceNotifications,
        onChange: (v) => set("parents", { attendanceNotifications: v }),
      },
      {
        label: "Also email them each time",
        help: "Off unless you turn it on. Two emails a day per child adds up — the app notification is usually enough.",
        checked: current.parents.attendanceEmails,
        onChange: (v) => set("parents", { attendanceEmails: v }),
        disabledBecause: current.parents.attendanceNotifications
          ? undefined
          : "Turn on sign in and out notifications first.",
      },
    ],
    posts: [
      {
        label: "New posts start as drafts",
        help: "Everything written here waits for someone to release it. Educators' posts always wait for the Coordinator, whatever this says.",
        checked: current.posts.draftByDefault,
        onChange: (v) => set("posts", { draftByDefault: v }),
      },
      {
        label: "Only admins can publish posts",
        help: "The Coordinator can still write; their posts wait for head office to release. Only an admin can change this.",
        checked: current.posts.onlyApproversPublish,
        onChange: (v) => set("posts", { onlyApproversPublish: v }),
        adminOnly: true,
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
      {
        label: "Open shifts go to whoever taps first",
        help: "Off means educators tap \u201cI\u2019m interested\u201d and you choose who gets the shift.",
        checked: current.staff.instantClaim,
        onChange: (v) => set("staff", { instantClaim: v }),
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
                "min-h-11 whitespace-nowrap rounded-t-lg border px-3.5 text-sm font-medium transition-colors",
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
        {tab === "checklists" && (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              <span className="font-semibold">When each part of the day&apos;s checklist should be done.</span>{" "}
              <span className="text-muted">
                Past that time, anything still unticked sends a reminder to the educators on shift and
                the Coordinator, and shows as overdue on the Today page. Leave a time blank for no reminder.
              </span>
            </p>
            {/* A card per programme, two times side by side — a table
                needed sideways scrolling on a phone. */}
            <div className="grid gap-3 sm:grid-cols-3">
              {DUE_SESSIONS.map((ses) => (
                <fieldset key={ses.key} className="rounded-lg border border-border p-3">
                  <legend className="px-1 text-sm font-semibold text-foreground">{ses.label}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {DUE_SECTIONS.map((sec) => (
                      <label key={sec.key} className="text-xs text-muted">
                        {sec.label} by
                        <input
                          type="time"
                          aria-label={`${ses.label} ${sec.label} due time`}
                          value={current.checklists.dueTimes[ses.key]?.[sec.key] ?? ""}
                          disabled={!canEdit}
                          onChange={(e) => setDue(ses.key, sec.key, e.target.value)}
                          className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-card px-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>
        )}
        {tab !== "checklists" && (
          <ul className="-mx-4 divide-y divide-border sm:-mx-6">
            {rows[tab].map((r) => {
              const locked = !canEdit || (r.adminOnly && !isAdmin) || Boolean(r.disabledBecause);
              return (
                <li key={r.label}>
                  {/* The whole row is the switch — a thumb, not a 16px box. */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={r.checked}
                    disabled={locked}
                    onClick={() => r.onChange(!r.checked)}
                    className={cn(
                      "flex w-full min-h-14 items-center gap-4 px-4 py-3 text-left sm:px-6",
                      locked ? "cursor-not-allowed opacity-60" : "hover:bg-surface active:bg-surface",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{r.label}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {r.disabledBecause ?? r.help}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors",
                        r.checked ? "bg-brand" : "bg-border",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-6 w-6 rounded-full bg-card shadow transition-transform",
                          r.checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
                        )}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Settings that live on their own Configure tab — where people
            look for them in OWNA's Settings. */}
        {tab === "families" && (
          <p className="text-xs text-muted">
            Casual bookings are set in{" "}
            <Link href={`/services/${serviceId}?tab=daily&sub=casual-bookings`} className="font-medium text-brand underline underline-offset-2">
              Casual settings
            </Link>
            ; days you&rsquo;re closed in{" "}
            <Link href={`/services/${serviceId}?tab=overview&sub=closures`} className="font-medium text-brand underline underline-offset-2">
              Closures
            </Link>
            .
          </p>
        )}

        {canEdit ? (
          <div
            className={cn(
              "flex items-center justify-end gap-3 border-t border-border pt-4",
              // On a phone, unsaved changes keep Save in reach, above the
              // bottom tab bar (2026-10-09).
              dirty &&
                "sticky bottom-16 z-10 -mx-4 bg-card px-4 pb-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:-mx-6 sm:px-6 md:bottom-0",
            )}
          >
            <span className="text-xs text-muted mr-auto">
              {dirty ? "Unsaved changes" : "Every switch here changes what the app actually does."}
            </span>
            {dirty && (
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={save.isPending}>
                Undo
              </Button>
            )}
            <Button onClick={() => save.mutate(current)} disabled={!dirty || save.isPending}>
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
