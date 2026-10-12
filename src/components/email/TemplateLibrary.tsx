"use client";

/**
 * The shared email template library (Daniel, 12 Oct 2026) — Mailchimp-style
 * designed emails, one list for both sides: staff emails pick from Staff +
 * Both, parent sends from Parents + Both. Mounted in Communication → Staff
 * emails → Templates and Marketing → Toolkit → Email templates.
 *
 * Exports:
 *   TemplateLibrary      — browse, filter, edit, duplicate, delete, load starters
 *   TemplateGallery      — the card grid on its own (used inline by composers)
 *   SaveAsTemplateDialog — "Save as template" from any composer
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Download, LayoutTemplate, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { mutateApi } from "@/lib/fetch-api";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import {
  useCreateEmailTemplate,
  useDeleteEmailTemplate,
  useDuplicateEmailTemplate,
  useEmailTemplates,
  useUpdateEmailTemplate,
  type EmailTemplateAudience,
  type EmailTemplateData,
} from "@/hooks/useEmailTemplates";
import { renderBlocksToHtml, type EmailBlock } from "@/lib/email-marketing-layout";
import { staffDesignedHtml } from "@/lib/staff-email-design";
import EmailBlockEditor from "./EmailBlockEditor";
import EmailPreview from "./EmailPreview";

export const AUDIENCES: { value: EmailTemplateAudience; label: string; hint: string }[] = [
  { value: "staff", label: "Staff", hint: "Shows in Staff emails" },
  { value: "parents", label: "Parents", hint: "Shows in the parent email composer" },
  { value: "both", label: "Staff & parents", hint: "Shows in both" },
];
const audienceLabel = (a?: EmailTemplateAudience) => AUDIENCES.find((x) => x.value === (a ?? "parents"))!.label;

const chipClass = (on: boolean) =>
  cn(
    "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors",
    on ? "border-brand bg-brand/10 text-brand" : "border-border text-muted hover:text-foreground",
  );
const field =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

const blocksOf = (t: Pick<EmailTemplateData, "blocks">) => (Array.isArray(t.blocks) ? (t.blocks as EmailBlock[]) : []);

/** Live preview HTML for a template, as its audience would receive it. */
export function templatePreviewHtml(blocks: EmailBlock[], audience: EmailTemplateAudience | undefined) {
  if (audience === "staff") {
    return staffDesignedHtml(blocks, { name: "Sam Example" }, typeof window === "undefined" ? undefined : window.location.origin);
  }
  return renderBlocksToHtml(blocks, { firstName: "Sam", parentName: "Sam", centreName: "Amana OSHC", childNames: "Ali" });
}

// ── Gallery ─────────────────────────────────────────────────

/** First heading + a line of text: what a card shows instead of a thumbnail render. */
function cardTeaser(blocks: EmailBlock[]) {
  const heading = blocks.find((b) => b.type === "heading")?.text ?? "";
  const text = blocks.find((b) => b.type === "text" && b.content && !/^(hi|assalamu)/i.test(b.content))?.content ?? "";
  return { heading, text };
}

export function TemplateGallery({
  templates,
  onPick,
  actions,
  blank,
}: {
  templates: EmailTemplateData[];
  onPick?: (t: EmailTemplateData) => void;
  actions?: (t: EmailTemplateData) => React.ReactNode;
  /** Optional "Start blank" card at the front. */
  blank?: () => void;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {blank && (
        <li>
          <button
            type="button"
            onClick={blank}
            className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm font-medium text-muted hover:border-brand hover:text-brand"
          >
            <Plus className="h-5 w-5" aria-hidden />
            Start blank
          </button>
        </li>
      )}
      {templates.map((t) => {
        const { heading, text } = cardTeaser(blocksOf(t));
        const Body = (
          <>
            {/* Mini "email" — brand header bar, heading, two lines of copy. */}
            <div className="overflow-hidden rounded-lg border border-border bg-background">
              <div className="h-2.5 bg-brand" />
              <div className="space-y-1.5 p-3">
                <p className="line-clamp-1 text-sm font-semibold text-foreground">{heading || t.subject}</p>
                <p className="line-clamp-2 text-xs text-muted">{text || " "}</p>
              </div>
            </div>
            <div className="mt-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{t.name}</p>
                <p className="truncate text-xs text-muted">{t.subject}</p>
              </div>
              <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-2xs font-medium text-brand">
                {audienceLabel(t.audience)}
              </span>
            </div>
          </>
        );
        return (
          <li key={t.id} className="flex flex-col rounded-xl border border-border bg-card p-3">
            {onPick ? (
              <button type="button" onClick={() => onPick(t)} className="text-left hover:opacity-90" aria-label={`Use template ${t.name}`}>
                {Body}
              </button>
            ) : (
              Body
            )}
            {actions && <div className="mt-3 flex flex-wrap gap-1.5">{actions(t)}</div>}
          </li>
        );
      })}
    </ul>
  );
}

// ── Library ─────────────────────────────────────────────────

type Filter = "all" | EmailTemplateAudience;

export function TemplateLibrary({ defaultFilter = "all" }: { defaultFilter?: Filter }) {
  const qc = useQueryClient();
  const { data: templates, isLoading } = useEmailTemplates();
  const duplicate = useDuplicateEmailTemplate();
  const remove = useDeleteEmailTemplate();
  const [filter, setFilter] = useState<Filter>(defaultFilter);
  const [editing, setEditing] = useState<EmailTemplateData | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const shown = useMemo(
    () => (templates ?? []).filter((t) => filter === "all" || (t.audience ?? "parents") === filter),
    [templates, filter],
  );

  async function loadStarters() {
    setSeeding(true);
    try {
      const r = await mutateApi<{ created: number }>("/api/email-templates/seed", { method: "POST" });
      toast({ description: r.created ? `Added ${r.created} starter templates.` : "All the starter templates are already here." });
      qc.invalidateQueries({ queryKey: ["email-templates"] });
    } catch (e) {
      toast({ variant: "destructive", description: e instanceof Error ? e.message : "Couldn't load the starters." });
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-lg font-heading font-semibold text-foreground">Email templates</h2>
          <p className="mt-1 text-sm text-muted">
            Designed emails you can reuse. Staff templates show up in Staff emails, parent templates in the parent email
            composer, and &ldquo;Staff &amp; parents&rdquo; in both. Words in [square brackets] are blanks to fill in.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadStarters} loading={seeding}>
            <Download className="h-4 w-4" aria-hidden /> Load starter templates
          </Button>
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden /> New template
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Show templates for">
        {([{ value: "all", label: "All" }, ...AUDIENCES] as { value: Filter; label: string }[]).map((f) => (
          <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)} className={chipClass(filter === f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="No templates here yet"
          description="Load the starter templates, or build your own."
        />
      ) : (
        <TemplateGallery
          templates={shown}
          onPick={(t) => setEditing(t)}
          actions={(t) =>
            confirmDelete === t.id ? (
              <>
                <span className="self-center text-xs text-muted">Delete for everyone?</span>
                <Button size="sm" variant="destructive" loading={remove.isPending} onClick={() => remove.mutate(t.id, { onSettled: () => setConfirmDelete(null) })}>
                  Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                  Keep
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={() => setEditing(t)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => duplicate.mutate(t.id)} loading={duplicate.isPending && duplicate.variables === t.id}>
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Duplicate
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(t.id)} aria-label={`Delete ${t.name}`}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </>
            )
          }
        />
      )}

      {editing && (
        <TemplateEditor
          initial={editing === "new" ? null : editing}
          defaultAudience={filter === "all" ? "parents" : filter}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────

function TemplateEditor({
  initial,
  defaultAudience,
  onClose,
}: {
  initial: EmailTemplateData | null;
  defaultAudience: EmailTemplateAudience;
  onClose: () => void;
}) {
  const create = useCreateEmailTemplate();
  const update = useUpdateEmailTemplate();
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [audience, setAudience] = useState<EmailTemplateAudience>(initial?.audience ?? defaultAudience);
  const [blocks, setBlocks] = useState<EmailBlock[]>(() =>
    initial ? blocksOf(initial) : [{ type: "heading", level: "h1", text: "" }, { type: "text", content: "Assalamu Alaikum {{firstName}}," }],
  );
  const [view, setView] = useState<"edit" | "preview">("edit");
  const html = useMemo(() => (view === "preview" ? templatePreviewHtml(blocks, audience) : ""), [view, blocks, audience]);
  const pending = create.isPending || update.isPending;
  // A template saved from the raw-HTML composer has no blocks to edit here.
  const htmlOnly = !!initial?.htmlContent && blocksOf(initial).length === 0;

  function save() {
    const data = { name: name.trim(), subject: subject.trim(), audience, blocks: blocks as unknown[] };
    if (initial) update.mutate({ id: initial.id, ...data }, { onSuccess: onClose });
    else create.mutate({ ...data, category: "custom" }, { onSuccess: onClose });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="full">
        <DialogTitle className="text-lg font-heading font-semibold">{initial ? "Edit template" : "New template"}</DialogTitle>
        <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-foreground/80">
              Template name
              <input className={cn(field, "mt-1")} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="e.g. Wellbeing check-in" />
            </label>
            <label className="block text-sm font-medium text-foreground/80">
              Email subject
              <input className={cn(field, "mt-1")} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={500} placeholder="e.g. A moment for you, {{firstName}}" />
            </label>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-foreground/80">Who is it for?</legend>
            <div className="flex flex-wrap gap-2">
              {AUDIENCES.map((a) => (
                <button key={a.value} type="button" aria-pressed={audience === a.value} onClick={() => setAudience(a.value)} className={chipClass(audience === a.value)} title={a.hint}>
                  {a.label}
                </button>
              ))}
            </div>
          </fieldset>
          {htmlOnly ? (
            <p className="rounded-lg bg-surface p-3 text-sm text-muted">
              This template was written in raw HTML. Edit it in the parent email composer&rsquo;s HTML mode.
            </p>
          ) : (
            <>
              <div className="flex gap-2" role="tablist">
                {(["edit", "preview"] as const).map((v) => (
                  <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={chipClass(view === v)}>
                    {v === "edit" ? "Build" : "Preview"}
                  </button>
                ))}
              </div>
              {view === "edit" ? <EmailBlockEditor blocks={blocks} onChange={setBlocks} /> : <EmailPreview html={html} />}
              <p className="text-xs text-muted">
                <code>{"{{firstName}}"}</code> is replaced with each person&rsquo;s first name when it sends.
              </p>
            </>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={save} loading={pending} disabled={!name.trim() || !subject.trim() || htmlOnly}>
            Save template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Save as template ────────────────────────────────────────

export function SaveAsTemplateDialog({
  open,
  onClose,
  subject,
  blocks,
  defaultAudience,
}: {
  open: boolean;
  onClose: () => void;
  subject: string;
  blocks: EmailBlock[];
  defaultAudience: EmailTemplateAudience;
}) {
  const create = useCreateEmailTemplate();
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<EmailTemplateAudience>(defaultAudience);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogTitle className="text-lg font-heading font-semibold">Save as a template</DialogTitle>
        <div className="mt-4 space-y-4">
          <label className="block text-sm font-medium text-foreground/80">
            Template name
            <input className={cn(field, "mt-1")} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="e.g. Term kick-off" autoFocus />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-foreground/80">Who can use it?</legend>
            <div className="flex flex-wrap gap-2">
              {AUDIENCES.map((a) => (
                <button key={a.value} type="button" aria-pressed={audience === a.value} onClick={() => setAudience(a.value)} className={chipClass(audience === a.value)} title={a.hint}>
                  {a.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={create.isPending}
            disabled={!name.trim() || !subject.trim() || blocks.length === 0}
            onClick={() =>
              create.mutate(
                { name: name.trim(), subject: subject.trim(), audience, category: "custom", blocks: blocks as unknown[] },
                {
                  onSuccess: () => {
                    setName("");
                    onClose();
                  },
                },
              )
            }
          >
            Save template
          </Button>
        </div>
        {!subject.trim() && <p className="mt-2 text-right text-xs text-muted">Add a subject first.</p>}
      </DialogContent>
    </Dialog>
  );
}
