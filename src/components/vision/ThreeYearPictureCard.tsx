"use client";

/**
 * 3-Year Picture card — EOS-canonical structure.
 *
 *   Future Date · Revenue · Profit
 *   Measurables (bullet list)
 *   What Does It Look Like? (bullet list)
 *
 * Replaces the single freeform `threeYearPicture` text field. The
 * legacy text is preserved on the model and rendered read-only
 * below the card while it still has content — owner copies what
 * they need into the new sub-fields, then clears it with the
 * Dismiss button (same pattern as GoToMarketStrategyCard).
 */

import { useState } from "react";
import {
  Pencil,
  Check,
  X,
  Trash2,
  Calendar,
  TrendingUp,
  DollarSign,
  BarChart3,
  Eye,
} from "lucide-react";
import { useUpdateVTO } from "@/hooks/useVTO";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { UnsavedBadge } from "@/components/ui/UnsavedBadge";

interface Props {
  vto: {
    threeYearFutureDate: string | null;
    threeYearRevenue: string | null;
    threeYearProfit: string | null;
    threeYearMeasurables: string | null;
    threeYearLooksLike: string | null;
    threeYearPicture: string | null;
    sectionLabels: Record<string, string> | null;
  };
}

function formatDateForInput(iso: string | null): string {
  if (!iso) return "";
  // Date input expects YYYY-MM-DD
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function formatDateForDisplay(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function ThreeYearPictureCard({ vto }: Props) {
  const updateVTO = useUpdateVTO();
  const cardTitle = vto.sectionLabels?.threeYearPicture ?? "3-Year Picture";
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(cardTitle);

  const handleSaveTitle = () => {
    const next = titleDraft.trim();
    if (!next) return;
    updateVTO.mutate({
      sectionLabels: { ...(vto.sectionLabels || {}), threeYearPicture: next },
    });
    setEditingTitle(false);
  };

  const handleClearLegacy = () => {
    if (
      !confirm(
        "Remove the legacy 3-Year Picture text? Make sure you've copied anything you need into the structured fields above first.",
      )
    )
      return;
    updateVTO.mutate({ threeYearPicture: "" });
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
        <DateRow
          label="Future Date"
          icon={Calendar}
          value={vto.threeYearFutureDate}
          formattedDisplay={formatDateForDisplay(vto.threeYearFutureDate)}
          formattedInput={formatDateForInput(vto.threeYearFutureDate)}
        />
        <SingleLineRow
          label="Revenue"
          icon={TrendingUp}
          field="threeYearRevenue"
          value={vto.threeYearRevenue}
          placeholder="e.g. $10.8m"
        />
        <SingleLineRow
          label="Profit"
          icon={DollarSign}
          field="threeYearProfit"
          value={vto.threeYearProfit}
          placeholder="e.g. $3.3m"
        />
        <BulletListRow
          label="Measurables"
          icon={BarChart3}
          field="threeYearMeasurables"
          value={vto.threeYearMeasurables}
          placeholder={"Explorers: 2,500\nAnnual Attendances: 300,000"}
        />
        <BulletListRow
          label="What Does It Look Like?"
          icon={Eye}
          field="threeYearLooksLike"
          value={vto.threeYearLooksLike}
          placeholder={
            "180 RPRS\nCore Process Documented & FBA\n30 Centres\nMarketing/CRM\nInvestor"
          }
        />
      </div>

      {vto.threeYearPicture && vto.threeYearPicture.trim().length > 0 && (
        <div className="border-t border-amber-200 dark:border-amber-800 bg-amber-50/40 px-5 py-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-2xs font-semibold uppercase tracking-wider text-amber-800">
              Legacy 3-Year Picture text
            </p>
            <button
              onClick={handleClearLegacy}
              disabled={updateVTO.isPending}
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:text-amber-900 disabled:opacity-50"
              title="Once you've moved everything into the fields above, dismiss this block"
            >
              <Trash2 className="w-3 h-3" /> Dismiss
            </button>
          </div>
          <p className="text-xs text-amber-900 leading-relaxed whitespace-pre-wrap">
            {vto.threeYearPicture}
          </p>
        </div>
      )}
    </div>
  );
}

function DateRow({
  label,
  icon: Icon,
  value,
  formattedDisplay,
  formattedInput,
}: {
  label: string;
  icon: typeof Calendar;
  value: string | null;
  formattedDisplay: string;
  formattedInput: string;
}) {
  const updateVTO = useUpdateVTO();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formattedInput);

  const hasDirty = editing && draft !== formattedInput;
  useUnsavedChanges(hasDirty);

  const handleSave = () => {
    updateVTO.mutate({
      threeYearFutureDate: draft ? new Date(draft).toISOString() : null,
    });
    setEditing(false);
  };

  return (
    <div className="px-5 py-3">
      <div className="flex items-start justify-between gap-3">
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
                setDraft(formattedInput);
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
        <div className="space-y-2 mt-2 pl-9">
          <input
            type="date"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
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
        <p className="text-sm text-foreground/80 pl-9">{formattedDisplay}</p>
      ) : (
        <p className="text-xs text-muted italic pl-9">
          Click edit to set the target date
        </p>
      )}
    </div>
  );
}

function SingleLineRow({
  label,
  icon: Icon,
  field,
  value,
  placeholder,
}: {
  label: string;
  icon: typeof Calendar;
  field: "threeYearRevenue" | "threeYearProfit";
  value: string | null;
  placeholder: string;
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
    <div className="px-5 py-3">
      <div className="flex items-start justify-between gap-3">
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
        <div className="space-y-2 mt-2 pl-9">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
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
        <p className="text-sm text-foreground/80 pl-9">{value}</p>
      ) : (
        <p className="text-xs text-muted italic pl-9">{placeholder}</p>
      )}
    </div>
  );
}

function BulletListRow({
  label,
  icon: Icon,
  field,
  value,
  placeholder,
}: {
  label: string;
  icon: typeof Calendar;
  field: "threeYearMeasurables" | "threeYearLooksLike";
  value: string | null;
  placeholder: string;
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

  const lines = (value || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return (
    <div className="px-5 py-3">
      <div className="flex items-start justify-between gap-3">
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
        <div className="space-y-2 mt-2 pl-9">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            placeholder={`One per line:\n${placeholder}`}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand resize-none font-mono"
          />
          <p className="text-xs text-muted">
            One bullet per line. Blank lines are ignored.
          </p>
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
      ) : lines.length > 0 ? (
        <ul className="text-sm text-foreground/80 pl-9 space-y-1 mt-1 list-disc list-inside marker:text-brand">
          {lines.map((line, idx) => (
            <li key={idx}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted italic pl-9 whitespace-pre-line">
          {placeholder}
        </p>
      )}
    </div>
  );
}
