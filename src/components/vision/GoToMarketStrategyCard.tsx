"use client";

/**
 * Go to Market Strategy card — the EOS-canonical four-part marketing
 * strategy block (Target Market, Three Uniques, Proven Process,
 * Guarantee) that replaces the single freeform `marketingStrategy`
 * field on the V/TO.
 *
 * The legacy `marketingStrategy` column is preserved on the model and
 * rendered read-only below the card while it still has content — the
 * owner copies its bullets into the four sub-fields, then clears it
 * with the small "Dismiss legacy" button at the bottom.
 */

import { useState } from "react";
import { Pencil, Check, X, Trash2, Target, Sparkles, Workflow, ShieldCheck } from "lucide-react";
import { useUpdateVTO } from "@/hooks/useVTO";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { UnsavedBadge } from "@/components/ui/UnsavedBadge";

type GtmField =
  | "gtmTargetMarket"
  | "gtmThreeUniques"
  | "gtmProvenProcess"
  | "gtmGuarantee";

interface SubsectionMeta {
  field: GtmField;
  label: string;
  hint: string;
  icon: typeof Target;
}

const SUBSECTIONS: SubsectionMeta[] = [
  {
    field: "gtmTargetMarket",
    label: "Target Market",
    hint: "Who exactly are we for? (e.g. Muslim families in Western Sydney with primary-school-age children needing OSHC)",
    icon: Target,
  },
  {
    field: "gtmThreeUniques",
    label: "Three Uniques™",
    hint: "The three things that set Amana apart — what no other OSHC provider in the area offers.",
    icon: Sparkles,
  },
  {
    field: "gtmProvenProcess",
    label: "Proven Process",
    hint: "Our step-by-step playbook from first enquiry to ongoing care — the way Amana delivers every time.",
    icon: Workflow,
  },
  {
    field: "gtmGuarantee",
    label: "Guarantee",
    hint: "The promise we make to every family — what they get, or we make it right.",
    icon: ShieldCheck,
  },
];

interface Props {
  vto: {
    gtmTargetMarket: string | null;
    gtmThreeUniques: string | null;
    gtmProvenProcess: string | null;
    gtmGuarantee: string | null;
    marketingStrategy: string | null;
    sectionLabels: Record<string, string> | null;
  };
}

export function GoToMarketStrategyCard({ vto }: Props) {
  const updateVTO = useUpdateVTO();
  const cardTitle =
    vto.sectionLabels?.gtmStrategy ?? "Go to Market Strategy";
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(cardTitle);

  const handleSaveTitle = () => {
    const newLabel = titleDraft.trim();
    if (!newLabel) return;
    const updated = { ...(vto.sectionLabels || {}), gtmStrategy: newLabel };
    updateVTO.mutate({ sectionLabels: updated });
    setEditingTitle(false);
  };

  const handleClearLegacy = () => {
    if (
      !confirm(
        "Remove the legacy Marketing Strategy text? Make sure you've copied anything you need into the four sub-fields above first.",
      )
    )
      return;
    updateVTO.mutate({ marketingStrategy: "" });
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-surface/50">
        {editingTitle ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              className="flex-1 px-2 py-1 text-sm font-semibold border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTitle();
                if (e.key === "Escape") setEditingTitle(false);
              }}
            />
            <button
              onClick={handleSaveTitle}
              className="p-1 text-emerald-600 hover:text-emerald-700"
              title="Save title"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setEditingTitle(false)}
              className="p-1 text-muted hover:text-foreground"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <h3
            className="text-sm font-semibold text-foreground/80 cursor-pointer hover:text-brand transition-colors"
            onClick={() => {
              setTitleDraft(cardTitle);
              setEditingTitle(true);
            }}
            title="Click to rename"
          >
            {cardTitle}
          </h3>
        )}
      </div>

      <div className="divide-y divide-border/50">
        {SUBSECTIONS.map((s) => (
          <Subsection
            key={s.field}
            field={s.field}
            label={s.label}
            hint={s.hint}
            icon={s.icon}
            value={vto[s.field]}
          />
        ))}
      </div>

      {vto.marketingStrategy && vto.marketingStrategy.trim().length > 0 && (
        <div className="border-t border-amber-200 bg-amber-50/40 px-5 py-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
              Legacy Marketing Strategy text
            </p>
            <button
              onClick={handleClearLegacy}
              disabled={updateVTO.isPending}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 hover:text-amber-900 disabled:opacity-50"
              title="Once you've moved everything into the four sub-fields above, dismiss this block"
            >
              <Trash2 className="w-3 h-3" /> Dismiss
            </button>
          </div>
          <p className="text-xs text-amber-900 leading-relaxed whitespace-pre-wrap">
            {vto.marketingStrategy}
          </p>
          <p className="text-[11px] text-amber-700/80 italic">
            Copy what you need into the sub-sections above, then dismiss.
          </p>
        </div>
      )}
    </div>
  );
}

function Subsection({
  field,
  label,
  hint,
  icon: Icon,
  value,
}: {
  field: GtmField;
  label: string;
  hint: string;
  icon: typeof Target;
  value: string | null;
}) {
  const updateVTO = useUpdateVTO();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  const hasDirty = editing && draft !== (value || "");
  useUnsavedChanges(hasDirty);

  const handleSave = () => {
    updateVTO.mutate({ [field]: draft });
    setEditing(false);
  };

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-brand/10 flex items-center justify-center shrink-0">
            <Icon className="w-3.5 h-3.5 text-brand" />
          </div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasDirty && <UnsavedBadge />}
          {!editing && (
            <button
              onClick={() => {
                setDraft(value || "");
                setEditing(true);
              }}
              className="p-1 text-muted hover:text-brand transition-colors"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={field === "gtmThreeUniques" || field === "gtmProvenProcess" ? 4 : 3}
            placeholder={hint}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand resize-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={updateVTO.isPending}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-brand text-white rounded-md hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              <Check className="w-3 h-3" /> Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 text-muted hover:text-foreground"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      ) : value ? (
        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap pl-9">
          {value}
        </p>
      ) : (
        <p className="text-xs text-muted italic pl-9">{hint}</p>
      )}
    </div>
  );
}
