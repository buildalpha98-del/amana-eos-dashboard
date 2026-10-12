"use client";

/**
 * Communication → Staff emails (Daniel, 12 Oct 2026). Office writes or
 * approves staff emails — policy updates, reminders, things to read,
 * professional development, wellbeing. Approved ones go out in the Monday
 * round-up; urgent ones straight away. Cowork pushes drafts in for approval.
 * See src/lib/staff-updates.ts.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Plus, Send, Bot } from "lucide-react";
import type { Role, StaffUpdate, StaffUpdateType } from "@prisma/client";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { useServices } from "@/hooks/useServices";
import { ROLE_DISPLAY_NAMES } from "@/lib/role-permissions";

type Update = Omit<StaffUpdate, "createdAt" | "updatedAt" | "approvedAt" | "sentAt"> & {
  createdAt: string;
  approvedAt: string | null;
  sentAt: string | null;
};

const TYPES: { value: StaffUpdateType; label: string; hint: string; chip: string }[] = [
  { value: "policy_update", label: "Policy update", hint: "A new or changed policy", chip: "bg-brand/10 text-brand" },
  { value: "reminder", label: "Reminder", hint: "Something to do or remember", chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200" },
  { value: "please_read", label: "Please read", hint: "A document or resource", chip: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200" },
  { value: "professional_development", label: "Professional development", hint: "Learning and growth", chip: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200" },
  { value: "wellbeing", label: "Wellbeing", hint: "Mental health and self-care", chip: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200" },
];
const typeMeta = (t: StaffUpdateType) => TYPES.find((x) => x.value === t)!;

const AUDIENCE_ROLES: Role[] = ["staff", "member", "head_office", "admin", "owner", "marketing"];

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }) : "";

export function StaffEmailsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ updates: Update[]; coworkAutoApprove: boolean }>({
    queryKey: ["staff-updates"],
    queryFn: () => fetchApi("/api/staff-updates"),
    retry: 2,
  });
  const [editing, setEditing] = useState<Update | "new" | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["staff-updates"] });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "cancel" }) =>
      mutateApi<{ sent: { sent: number } | null }>(`/api/staff-updates/${id}`, { method: "PATCH", body: { action } }),
    onSuccess: (r, v) => {
      toast({
        description:
          v.action === "cancel"
            ? "Cancelled — it won't be sent."
            : r.sent
              ? `Sent to ${r.sent.sent} staff.`
              : "Approved — it goes out in Monday's round-up.",
      });
      refresh();
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });
  const test = useMutation({
    mutationFn: (id: string) => mutateApi<{ sentTo: string }>(`/api/staff-updates/${id}/test`, { method: "POST" }),
    onSuccess: (r) => toast({ description: `Test sent to ${r.sentTo}.` }),
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });
  const setting = useMutation({
    mutationFn: (coworkAutoApprove: boolean) =>
      mutateApi(`/api/staff-updates/settings`, { method: "PATCH", body: { coworkAutoApprove } }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const updates = data?.updates ?? [];
  const drafts = updates.filter((u) => u.status === "draft");
  const monday = updates.filter((u) => u.status === "approved" && !u.urgent);
  const sent = updates.filter((u) => u.status === "sent").slice(0, 20);

  const Card = ({ u }: { u: Update }) => {
    const meta = typeMeta(u.type);
    const open = u.status === "draft" || u.status === "approved";
    return (
      <li className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-0.5 text-2xs font-semibold", meta.chip)}>{meta.label}</span>
          {u.urgent && <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-2xs font-semibold text-red-800 dark:bg-red-950/50 dark:text-red-200">Urgent</span>}
          {u.source === "cowork" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-0.5 text-2xs font-medium text-muted">
              <Bot className="h-3 w-3" aria-hidden /> From Cowork
            </span>
          )}
          <span className="ml-auto text-xs text-muted">
            {u.status === "sent" ? `Sent ${when(u.sentAt)} · ${u.recipientCount ?? 0} staff` : `Added ${when(u.createdAt)}${u.createdByName ? ` by ${u.createdByName}` : ""}`}
          </span>
        </div>
        <h3 className="mt-2 font-semibold text-foreground">{u.title}</h3>
        <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted">{u.body}</p>
        <p className="mt-2 text-xs text-muted">
          To: {u.audienceRoles.length ? u.audienceRoles.map((r) => ROLE_DISPLAY_NAMES[r]).join(", ") : "all staff"}
          {u.audienceServiceIds.length ? ` · ${u.audienceServiceIds.length} centre${u.audienceServiceIds.length === 1 ? "" : "s"}` : ""}
        </p>
        {open && (
          <div className="mt-3 flex flex-wrap gap-2">
            {u.status === "draft" && (
              <Button size="sm" onClick={() => act.mutate({ id: u.id, action: "approve" })} loading={act.isPending && act.variables?.id === u.id}>
                {u.urgent ? "Approve and send now" : "Approve"}
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setEditing(u)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => test.mutate(u.id)} loading={test.isPending && test.variables === u.id}>
              <Send className="h-3.5 w-3.5" aria-hidden /> Send me a test
            </Button>
            <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: u.id, action: "cancel" })}>
              Cancel
            </Button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-lg font-heading font-semibold text-foreground">Staff emails</h2>
          <p className="mt-1 text-sm text-muted">
            Policy updates, reminders, things to read, professional development and wellbeing. Approved emails go
            out together in <strong>Monday&rsquo;s round-up at 7am</strong>; urgent ones go straight away. Shared
            centre mailboxes never receive them.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden /> New staff email
        </Button>
      </div>

      <label className="flex max-w-2xl items-start gap-3 rounded-xl border border-border bg-surface/50 p-4 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
          checked={data?.coworkAutoApprove ?? false}
          disabled={!data || setting.isPending}
          onChange={(e) => setting.mutate(e.target.checked)}
        />
        <span>
          <span className="font-medium text-foreground">Send Cowork&rsquo;s emails without approval</span>
          <span className="block text-muted">
            Off: emails Cowork prepares wait below for an admin to check and approve. On: they go straight into the
            round-up (or out now, if urgent).
          </span>
        </span>
      </label>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : updates.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No staff emails yet"
          description="Write one, or connect Cowork to prepare them each week."
        />
      ) : (
        <>
          <Section title="Waiting for approval" empty="Nothing to approve." items={drafts} render={(u) => <Card key={u.id} u={u} />} />
          <Section title="Going out in Monday’s round-up" empty="Nothing approved for Monday yet." items={monday} render={(u) => <Card key={u.id} u={u} />} />
          <Section title="Sent" empty="Nothing sent yet." items={sent} render={(u) => <Card key={u.id} u={u} />} />
        </>
      )}

      {editing && (
        <Composer
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function Section({ title, empty, items, render }: { title: string; empty: string; items: Update[]; render: (u: Update) => React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
        {title} {items.length > 0 && <span className="text-foreground">· {items.length}</span>}
      </h3>
      {items.length === 0 ? <p className="text-sm text-muted">{empty}</p> : <ul className="space-y-2">{items.map(render)}</ul>}
    </section>
  );
}

function Composer({ initial, onClose, onSaved }: { initial: Update | null; onClose: () => void; onSaved: () => void }) {
  const { data: services } = useServices("active");
  const [type, setType] = useState<StaffUpdateType>(initial?.type ?? "reminder");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [linkUrl, setLinkUrl] = useState(initial?.linkUrl ?? "");
  const [linkLabel, setLinkLabel] = useState(initial?.linkLabel ?? "");
  const [roles, setRoles] = useState<Role[]>(initial?.audienceRoles ?? []);
  const [centres, setCentres] = useState<string[]>(initial?.audienceServiceIds ?? []);
  const [urgent, setUrgent] = useState(initial?.urgent ?? false);
  const [reach, setReach] = useState<number | null>(null);

  const audience = useMemo(() => ({ audienceRoles: roles, audienceServiceIds: centres }), [roles, centres]);
  useEffect(() => {
    let live = true;
    mutateApi<{ count: number }>("/api/staff-updates/audience-count", { method: "POST", body: audience })
      .then((r) => live && setReach(r.count))
      .catch(() => live && setReach(null));
    return () => {
      live = false;
    };
  }, [audience]);

  const save = useMutation({
    mutationFn: (approve: boolean) => {
      const fields = { type, title, body, linkUrl: linkUrl || null, linkLabel: linkLabel || null, ...audience, urgent };
      return initial
        ? mutateApi(`/api/staff-updates/${initial.id}`, { method: "PATCH", body: { action: approve ? "approve" : "edit", ...fields } })
        : mutateApi(`/api/staff-updates`, { method: "POST", body: { ...fields, approve } });
    },
    onSuccess: (_r, approve) => {
      toast({
        description: !approve ? "Saved as a draft." : urgent ? "Sent to staff now." : "Approved — it goes out in Monday's round-up.",
      });
      onSaved();
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const field = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
  const chip = (on: boolean) =>
    cn("min-h-9 rounded-full border px-3 text-xs font-medium", on ? "border-brand bg-brand/10 text-brand" : "border-border text-muted hover:text-foreground");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogTitle className="text-lg font-heading font-semibold">{initial ? "Edit staff email" : "New staff email"}</DialogTitle>
        <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-foreground/80">What kind of email?</legend>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button key={t.value} type="button" aria-pressed={type === t.value} onClick={() => setType(t.value)} className={chip(type === t.value)} title={t.hint}>
                  {t.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-medium text-foreground/80">
            Title
            <input className={cn(field, "mt-1")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="e.g. Updated Sun Protection Policy" />
          </label>
          <label className="block text-sm font-medium text-foreground/80">
            Message
            <textarea className={cn(field, "mt-1 min-h-36")} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} placeholder="What staff need to know, in a few short paragraphs." />
          </label>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <label className="block text-sm font-medium text-foreground/80">
              Link (optional)
              <input className={cn(field, "mt-1")} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://… or /policies" />
            </label>
            <label className="block text-sm font-medium text-foreground/80">
              Button text
              <input className={cn(field, "mt-1")} value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} maxLength={60} placeholder="Read the policy" />
            </label>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-foreground/80">Who gets it? <span className="font-normal text-muted">(none ticked = everyone)</span></legend>
            <div className="flex flex-wrap gap-2">
              {AUDIENCE_ROLES.map((r) => (
                <button key={r} type="button" aria-pressed={roles.includes(r)} onClick={() => setRoles(toggle(roles, r))} className={chip(roles.includes(r))}>
                  {ROLE_DISPLAY_NAMES[r]}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(services ?? []).map((s) => (
                <button key={s.id} type="button" aria-pressed={centres.includes(s.id)} onClick={() => setCentres(toggle(centres, s.id))} className={chip(centres.includes(s.id))}>
                  {s.name.replace(/^Amana OSHC\s*/i, "")}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{reach === null ? "Counting…" : `Reaches ${reach} ${reach === 1 ? "person" : "people"}.`}</p>
          </fieldset>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            <span>
              <span className="font-medium text-foreground">Urgent — send on its own as soon as it&rsquo;s approved</span>
              <span className="block text-muted">Otherwise it goes in Monday&rsquo;s round-up with everything else.</span>
            </span>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" onClick={() => save.mutate(false)} loading={save.isPending && save.variables === false} disabled={!title.trim() || !body.trim()}>
            Save draft
          </Button>
          <Button onClick={() => save.mutate(true)} loading={save.isPending && save.variables === true} disabled={!title.trim() || !body.trim()}>
            {urgent ? "Approve and send now" : "Approve for Monday"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
