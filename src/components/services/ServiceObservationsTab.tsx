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
import { Plus, Sparkles, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterBar } from "@/components/ui/v2/FilterBar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { AiButton } from "@/components/ui/AiButton";
import { fetchApi } from "@/lib/fetch-api";
import { useQuery } from "@tanstack/react-query";
import {
  useObservations,
  useCreateObservation,
  type MtopOutcome,
  type ObservationItem,
} from "@/hooks/useObservations";

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
        <h2 className="text-[11px] font-heading font-semibold text-[color:var(--color-muted)] uppercase tracking-[0.08em]">
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
            <ObservationCard key={o.id} observation={o} />
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

function ObservationCard({ observation }: { observation: ObservationItem }) {
  const date = new Date(observation.createdAt);
  return (
    <li
      className={cn(
        "warm-card-dense p-3",
        "border border-[color:var(--color-border)]",
      )}
    >
      <header className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
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
              <span className="text-[10px] font-medium bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)] px-1.5 py-0.5 rounded-[var(--radius-xs)]">
                Parent-visible
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-[color:var(--color-foreground)] mt-0.5">
            {observation.title}
          </h3>
        </div>
      </header>
      <p className="text-[13px] text-[color:var(--color-foreground)]/80 whitespace-pre-wrap">
        {observation.narrative}
      </p>
      {(observation.mtopOutcomes.length > 0 ||
        observation.interests.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {observation.mtopOutcomes.map((m) => (
            <span
              key={m}
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-[var(--radius-xs)] bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)]"
            >
              {m}
            </span>
          ))}
          {observation.interests.map((i) => (
            <span
              key={i}
              className="text-[10px] px-1.5 py-0.5 rounded-[var(--radius-xs)] bg-[color:var(--color-cream-deep)] text-[color:var(--color-muted)]"
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

  // Children list for this service
  const { data: childrenData } = useQuery<{
    id: string;
    firstName: string;
    surname: string;
  }[]>({
    queryKey: ["service-children", serviceId],
    queryFn: () =>
      fetchApi<{ id: string; firstName: string; surname: string }[]>(
        `/api/children?service=${serviceId}`,
      ),
    retry: 2,
    staleTime: 60_000,
  });

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
              className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-2 py-1.5 text-sm bg-[color:var(--color-cream-deep)]"
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
              className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-2 py-1.5 text-sm bg-[color:var(--color-cream-deep)]"
            />
          </Field>

          <Field label="Narrative">
            <div className="space-y-1.5">
              <textarea
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                rows={5}
                placeholder="What happened, what did the child do, what were they learning?"
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-2 py-1.5 text-sm bg-[color:var(--color-cream-deep)] resize-y"
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
                    childAge: "",
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
                      "px-2 py-1 rounded-[var(--radius-sm)] text-[12px] font-medium border transition-colors",
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
              className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-2 py-1.5 text-sm bg-[color:var(--color-cream-deep)]"
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
              className="px-3 py-1.5 text-sm font-medium text-[color:var(--color-muted)]"
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
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-muted)] mb-1">
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
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)]",
        "bg-[color:var(--color-brand)] text-white text-[13px] font-medium",
        "hover:bg-[color:var(--color-brand-hover)] transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}
