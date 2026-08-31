"use client";

/**
 * ServiceObservationsTab — staff tab listing learning observations for a service.
 *
 * - Filters: MTOP outcome, author
 * - Create modal: child picker (from service's enrolled children), MTOP multi-select,
 *   interests tags (freeform), media URL list (commit 12 uses URL input; media-upload
 *   integration lands in a later pass)
 * - "visible to parent" toggle per observation
 */

import { useMemo, useState } from "react";
import { Plus, Sparkles, Image as ImageIcon, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterBar } from "@/components/ui/v2/FilterBar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { AiButton } from "@/components/ui/AiButton";
import { fetchApi } from "@/lib/fetch-api";
import { useQuery } from "@tanstack/react-query";
import {
  useObservations,
  useCreateObservation,
  useUpdateObservation,
  useDeleteObservation,
  type MtopOutcome,
  type ObservationItem,
} from "@/hooks/useObservations";
import { useSession } from "next-auth/react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const MTOP_FILTER_OPTIONS = [
  { value: "all", label: "All outcomes" },
  { value: "Identity", label: "Identity" },
  { value: "Community", label: "Community" },
  { value: "Wellbeing", label: "Wellbeing" },
  { value: "Learners", label: "Learners" },
  { value: "Communicators", label: "Communicators" },
];

const MTOP_OUTCOMES: MtopOutcome[] = [
  "Identity",
  "Community",
  "Wellbeing",
  "Learners",
  "Communicators",
];

export function ServiceObservationsTab({ serviceId }: { serviceId: string }) {
  const [mtop, setMtop] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const filters = useMemo(
    () => ({ mtop: mtop !== "all" ? (mtop as MtopOutcome) : undefined }),
    [mtop],
  );

  const { data, isLoading } = useObservations(serviceId, filters);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xs font-heading font-semibold text-[color:var(--color-muted)] uppercase tracking-[0.08em]">
          Learning observations
        </h2>
        <BrandButton onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          New observation
        </BrandButton>
      </div>

      <FilterBar
        filters={[
          { key: "mtop", label: "MTOP", options: MTOP_FILTER_OPTIONS },
        ]}
        values={{ mtop }}
        onChange={(k, v) => {
          if (k === "mtop") setMtop(v);
        }}
        onReset={() => setMtop("all")}
      />

      {isLoading ? (
        <div className="text-sm text-[color:var(--color-muted)] py-6">
          Loading observations…
        </div>
      ) : !data?.items || data.items.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <ul className="space-y-3">
          {data.items.map((o) => (
            <ObservationCard
              key={o.id}
              observation={o}
              serviceId={serviceId}
            />
          ))}
        </ul>
      )}

      {createOpen && (
        <CreateObservationDialog
          serviceId={serviceId}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] bg-[color:var(--color-cream-soft)]",
        "border border-dashed border-[color:var(--color-border)] p-8 text-center",
      )}
    >
      <Sparkles className="w-8 h-8 mx-auto text-[color:var(--color-brand)]/60 mb-2" />
      <p className="text-sm font-medium text-[color:var(--color-foreground)]">
        No observations yet
      </p>
      <p className="text-xs text-[color:var(--color-muted)] mt-1 mb-4">
        Capture what a child is learning — MTOP outcomes, interests, or a photo.
      </p>
      <BrandButton onClick={onCreate}>Log your first observation</BrandButton>
    </div>
  );
}

function ObservationCard({
  observation,
  serviceId,
}: {
  observation: ObservationItem;
  serviceId: string;
}) {
  const date = new Date(observation.createdAt);
  const { data: session } = useSession();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const del = useDeleteObservation(serviceId);

  /**
   * The route allows the AUTHOR or an admin. Mirroring that here isn't
   * duplicated security — the server still enforces it — it's so we don't
   * show an educator a pencil that only ever returns 403.
   */
  const role = session?.user?.role as string | undefined;
  const canEdit =
    observation.authorId === session?.user?.id ||
    role === "owner" ||
    role === "head_office" ||
    role === "admin";
  return (
    <li
      className={cn(
        "warm-card-dense p-3",
        "border border-[color:var(--color-border)]",
      )}
    >
      {editing && (
        <EditObservationDialog
          serviceId={serviceId}
          observation={observation}
          onClose={() => setEditing(false)}
        />
      )}
      <header className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="font-semibold text-[color:var(--color-brand)]">
              {observation.child.firstName} {observation.child.surname}
            </span>
            <span className="text-[color:var(--color-muted)]">
              · {observation.author.name} ·{" "}
              {date.toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
              })}
            </span>
            {observation.visibleToParent && (
              <span className="text-2xs font-medium bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)] px-1.5 py-0.5 rounded-[var(--radius-xs)]">
                Parent-visible
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-[color:var(--color-foreground)] mt-0.5">
            {observation.title}
          </h3>
        </div>

        {canEdit && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Edit observation: ${observation.title}`}
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[color:var(--color-muted)] hover:text-[color:var(--color-brand)] hover:bg-[color:var(--color-surface)]"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label={`Delete observation: ${observation.title}`}
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[color:var(--color-muted)] hover:text-red-600 hover:bg-[color:var(--color-surface)]"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </header>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete observation"
        // An observation is a learning record and may already be visible
        // to the family, so say so rather than asking "are you sure?".
        description={
          observation.visibleToParent
            ? "This observation is visible to the family and will disappear from their portal. This can't be undone."
            : "This observation will be permanently deleted. This can't be undone."
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          del.mutate(observation.id);
          setConfirmDelete(false);
        }}
      />
      <p className="text-sm text-[color:var(--color-foreground)]/80 whitespace-pre-wrap">
        {observation.narrative}
      </p>
      {(observation.mtopOutcomes.length > 0 ||
        observation.interests.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {observation.mtopOutcomes.map((m) => (
            <span
              key={m}
              className="text-2xs font-medium px-1.5 py-0.5 rounded-[var(--radius-xs)] bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)]"
            >
              {m}
            </span>
          ))}
          {observation.interests.map((i) => (
            <span
              key={i}
              className="text-2xs px-1.5 py-0.5 rounded-[var(--radius-xs)] bg-[color:var(--color-cream-deep)] text-[color:var(--color-muted)]"
            >
              {i}
            </span>
          ))}
        </div>
      )}
      {observation.mediaUrls.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-1">
          {observation.mediaUrls.slice(0, 3).map((u) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={u}
              src={u}
              alt=""
              className="aspect-square w-full rounded-[var(--radius-xs)] object-cover border border-[color:var(--color-border)]"
            />
          ))}
        </div>
      )}
    </li>
  );
}

function CreateObservationDialog({
  serviceId,
  onClose,
}: {
  serviceId: string;
  onClose: () => void;
}) {
  const create = useCreateObservation(serviceId);

  // Children list for this service. Includes `dob` so we can compute age
  // for the AI observation drafter.
  // /api/children returns { children, total } — was assumed to return an
  // array, causing "?.map is not a function" below. Also: the query param is
  // `serviceId`, not `service`.
  const { data: childrenData } = useQuery<{
    id: string;
    firstName: string;
    surname: string;
    dob: string | null;
  }[]>({
    queryKey: ["service-children", serviceId],
    queryFn: () =>
      fetchApi<{
        children: {
          id: string;
          firstName: string;
          surname: string;
          dob: string | null;
        }[];
        total: number;
      }>(`/api/children?serviceId=${serviceId}&status=current`).then(
        (r) => r.children,
      ),
    retry: 2,
    staleTime: 60_000,
  });

  /** Years since dob, or empty string if dob is missing/unparseable. */
  function ageFromDob(dob: string | null | undefined): string {
    if (!dob) return "";
    const birth = new Date(dob);
    if (Number.isNaN(birth.getTime())) return "";
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    const beforeBirthday =
      now.getMonth() < birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
    if (beforeBirthday) years -= 1;
    return years > 0 ? `${years}` : "";
  }

  const [childId, setChildId] = useState("");
  const [title, setTitle] = useState("");
  const [narrative, setNarrative] = useState("");
  const [outcomes, setOutcomes] = useState<MtopOutcome[]>([]);
  const [interests, setInterests] = useState("");
  const [mediaUrls, setMediaUrls] = useState("");
  const [visibleToParent, setVisibleToParent] = useState(false);

  const valid = childId && title.trim() && narrative.trim();

  async function submit() {
    if (!valid) return;
    const interestsList = interests
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const urls = mediaUrls
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await create.mutateAsync({
      childId,
      title: title.trim(),
      narrative: narrative.trim(),
      mtopOutcomes: outcomes,
      interests: interestsList,
      mediaUrls: urls,
      visibleToParent,
    });
    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle className="text-base font-semibold mb-4">
          New learning observation
        </DialogTitle>
        <div className="space-y-3">
          <Field label="Child">
            <select
              value={childId}
              onChange={(e) => setChildId(e.target.value)}
              className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] min-h-[44px]"
            >
              <option value="">Select a child…</option>
              {childrenData?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.surname}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short headline (e.g. Block play and sharing)"
              className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] min-h-[44px]"
            />
          </Field>

          <Field label="Narrative">
            <div className="space-y-1.5">
              <textarea
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                rows={5}
                placeholder="What happened, what did the child do, what were they learning?"
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] resize-y"
              />
              <div className="flex justify-end">
                <AiButton
                  size="sm"
                  templateSlug="nqs/observation-draft"
                  section="observations"
                  metadata={{ serviceId, childId }}
                  variables={{
                    childFirstName:
                      childrenData?.find((c) => c.id === childId)?.firstName ?? "the child",
                    childAge: ageFromDob(
                      childrenData?.find((c) => c.id === childId)?.dob,
                    ),
                    shortNotes: title || "(short note from educator)",
                    interests:
                      interests.split(",").map((s) => s.trim()).filter(Boolean).join(", ") ||
                      "(none recorded yet)",
                    photoSummary:
                      mediaUrls.split(",").filter((s) => s.trim()).length > 0
                        ? `${mediaUrls.split(",").filter((s) => s.trim()).length} photo(s)`
                        : "no photos",
                  }}
                  onResult={(text) => setNarrative(text)}
                  label="Draft with AI"
                  disabled={!childId || !title.trim()}
                />
              </div>
            </div>
          </Field>

          <Field label="MTOP outcomes">
            <div className="flex flex-wrap gap-1">
              {MTOP_OUTCOMES.map((o) => {
                const active = outcomes.includes(o);
                return (
                  <button
                    type="button"
                    key={o}
                    onClick={() =>
                      setOutcomes((prev) =>
                        prev.includes(o)
                          ? prev.filter((x) => x !== o)
                          : [...prev, o],
                      )
                    }
                    className={cn(
                      "px-2 py-1 rounded-[var(--radius-sm)] text-xs font-medium border transition-colors",
                      active
                        ? "bg-[color:var(--color-brand)] text-white border-[color:var(--color-brand)]"
                        : "bg-[color:var(--color-cream-deep)] text-[color:var(--color-muted)] border-[color:var(--color-border)]",
                    )}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Interests (comma-separated)">
            <input
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="e.g. Lego, animals, drawing"
              className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] min-h-[44px]"
            />
          </Field>

          <Field label="Media URLs (comma-separated)">
            <div className="relative">
              <ImageIcon className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[color:var(--color-muted)]" />
              <input
                value={mediaUrls}
                onChange={(e) => setMediaUrls(e.target.value)}
                placeholder="Paste Vercel Blob URLs separated by commas"
                className="w-full pl-7 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-2 py-1.5 text-sm bg-[color:var(--color-cream-deep)]"
              />
            </div>
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={visibleToParent}
              onChange={(e) => setVisibleToParent(e.target.checked)}
              className="w-4 h-4 rounded border-[color:var(--color-border)]"
            />
            <span>Share this observation with the parent</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 text-sm font-medium text-[color:var(--color-muted)]"
            >
              Cancel
            </button>
            <BrandButton
              onClick={submit}
              disabled={!valid || create.isPending}
            >
              {create.isPending ? "Saving…" : "Save observation"}
            </BrandButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-2xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)] mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function BrandButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-sm)]",
        // Tablet tap target — 44px min height
        "min-h-[44px]",
        "bg-[color:var(--color-brand)] text-white text-sm font-medium",
        "hover:bg-[color:var(--color-brand-hover)] transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Edit an existing observation.
 *
 * Deliberately narrower than the create dialog: title, narrative and
 * parent visibility are what people actually come back to fix — a typo,
 * a clumsy sentence, or realising it shouldn't have gone to the family.
 * Re-tagging is rare enough that offering it here isn't worth
 * restructuring the create dialog to share.
 */
function EditObservationDialog({
  serviceId,
  observation,
  onClose,
}: {
  serviceId: string;
  observation: ObservationItem;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(observation.title);
  const [narrative, setNarrative] = useState(observation.narrative);
  const [visibleToParent, setVisibleToParent] = useState(
    observation.visibleToParent,
  );
  const update = useUpdateObservation(serviceId);

  const dirty =
    title !== observation.title ||
    narrative !== observation.narrative ||
    visibleToParent !== observation.visibleToParent;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Edit observation</DialogTitle>

        <div className="space-y-3 mt-3">
          <div>
            <label htmlFor="obs-title" className="block text-sm font-medium mb-1">
              Title
            </label>
            <input
              id="obs-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 border border-[color:var(--color-border)] rounded-lg text-base sm:text-sm bg-[color:var(--color-card)]"
            />
          </div>

          <div>
            <label htmlFor="obs-narrative" className="block text-sm font-medium mb-1">
              Learning story
            </label>
            <textarea
              id="obs-narrative"
              rows={7}
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              className="w-full px-3 py-2.5 border border-[color:var(--color-border)] rounded-lg text-base sm:text-sm bg-[color:var(--color-card)]"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={visibleToParent}
              onChange={(e) => setVisibleToParent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[color:var(--color-border)]"
            />
            <span className="text-sm">
              Visible to the family
              <span className="block text-xs text-[color:var(--color-muted)]">
                {observation.visibleToParent && !visibleToParent
                  ? "Unticking removes it from their portal."
                  : "Shows in the family's portal."}
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 min-h-11 text-sm text-[color:var(--color-muted)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!dirty || !title.trim() || !narrative.trim() || update.isPending}
              onClick={() =>
                update.mutate(
                  {
                    id: observation.id,
                    title: title.trim(),
                    narrative: narrative.trim(),
                    visibleToParent,
                  },
                  { onSuccess: onClose },
                )
              }
              className="px-5 min-h-11 rounded-lg bg-[color:var(--color-brand)] text-white text-sm font-medium disabled:opacity-40"
            >
              {update.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
