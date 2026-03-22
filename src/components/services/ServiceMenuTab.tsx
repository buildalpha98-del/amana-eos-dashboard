"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { getWeekStart } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Upload,
  FileText,
  Download,
  X,
  Loader2,
  ImageIcon,
  Copy,
  ShieldAlert,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { AiButton } from "@/components/ui/AiButton";
import {
  useMenuWeek,
  useSaveMenu,
  useUploadMenuFile,
  type MenuItemData,
} from "@/hooks/useMenu";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const SLOTS = ["morning_tea", "lunch", "afternoon_tea"] as const;

const DAY_LABELS: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};

const SLOT_LABELS: Record<string, string> = {
  morning_tea: "Morning Tea",
  lunch: "Lunch",
  afternoon_tea: "Afternoon Tea",
};

const ALLERGEN_OPTIONS = [
  "gluten",
  "dairy",
  "nuts",
  "eggs",
  "soy",
  "shellfish",
  "vegan",
  "halal",
];

const ALLERGEN_COLORS: Record<string, string> = {
  gluten: "bg-amber-100 text-amber-700",
  dairy: "bg-blue-100 text-blue-700",
  nuts: "bg-orange-100 text-orange-700",
  eggs: "bg-yellow-100 text-yellow-700",
  soy: "bg-green-100 text-green-700",
  shellfish: "bg-red-100 text-red-700",
  vegan: "bg-emerald-100 text-emerald-700",
  halal: "bg-purple-100 text-purple-700",
};

type CellKey = string;

interface CellData {
  description: string;
  allergens: string[];
}

function formatWeekLabel(date: Date): string {
  return `Week of ${date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

function cellKey(day: string, slot: string): CellKey {
  return `${day}_${slot}` as CellKey;
}

export function ServiceMenuTab({ serviceId }: { serviceId: string }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentWeek = getWeekStart();
  const selectedWeek = new Date(currentWeek);
  selectedWeek.setDate(selectedWeek.getDate() - weekOffset * 7);
  const weekKey = selectedWeek.toISOString().split("T")[0];

  const prevWeek = new Date(selectedWeek);
  prevWeek.setDate(prevWeek.getDate() - 7);
  const prevWeekKey = prevWeek.toISOString().split("T")[0];

  const { data: menuWeek, isLoading } = useMenuWeek(serviceId, weekKey);
  const { data: prevMenuWeek } = useMenuWeek(serviceId, prevWeekKey);
  const saveMutation = useSaveMenu(serviceId);
  const uploadMutation = useUploadMenuFile(serviceId);

  // Cell state — keyed by "day_slot"
  const [cells, setCells] = useState<Record<CellKey, CellData>>({});
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [allergenCheckResult, setAllergenCheckResult] = useState<string | null>(null);

  // Sync from server data
  useEffect(() => {
    const newCells: Record<CellKey, CellData> = {};
    DAYS.forEach((day) => {
      SLOTS.forEach((slot) => {
        const key = cellKey(day, slot);
        const item = menuWeek?.items?.find(
          (i: MenuItemData) => i.day === day && i.slot === slot
        );
        newCells[key] = {
          description: item?.description || "",
          allergens: item?.allergens || [],
        };
      });
    });
    setCells(newCells);
    setNotes(menuWeek?.notes || "");
    setDirty(false);
  }, [menuWeek]);

  const updateCell = useCallback(
    (key: CellKey, field: "description" | "allergens", value: string | string[]) => {
      setCells((prev) => ({
        ...prev,
        [key]: { ...prev[key], [field]: value },
      }));
      setDirty(true);
    },
    []
  );

  const toggleAllergen = useCallback(
    (key: CellKey, allergen: string) => {
      setCells((prev) => {
        const cell = prev[key];
        const has = cell.allergens.includes(allergen);
        return {
          ...prev,
          [key]: {
            ...cell,
            allergens: has
              ? cell.allergens.filter((a) => a !== allergen)
              : [...cell.allergens, allergen],
          },
        };
      });
      setDirty(true);
    },
    []
  );

  const handleSave = async () => {
    const items = DAYS.flatMap((day) =>
      SLOTS.map((slot) => {
        const key = cellKey(day, slot);
        const cell = cells[key];
        return {
          day,
          slot,
          description: cell?.description || "",
          allergens: cell?.allergens || [],
        };
      })
    );

    try {
      await saveMutation.mutateAsync({
        weekStart: weekKey,
        notes: notes || undefined,
        fileUrl: menuWeek?.fileUrl,
        fileName: menuWeek?.fileName,
        items,
      });
      setDirty(false);
      toast({ description: "Menu saved" });
    } catch {
      toast({ description: "Failed to save menu", variant: "destructive" });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadMutation.mutateAsync({ file, weekStart: weekKey });
      toast({ description: "Menu file uploaded" });
    } catch {
      toast({ description: "Failed to upload file", variant: "destructive" });
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCopyPrevWeek = useCallback(() => {
    if (!prevMenuWeek?.items?.length) {
      toast({ description: "No menu data found for the previous week" });
      return;
    }
    const newCells: Record<CellKey, CellData> = {};
    DAYS.forEach((day) => {
      SLOTS.forEach((slot) => {
        const key = cellKey(day, slot);
        const item = prevMenuWeek.items.find(
          (i: MenuItemData) => i.day === day && i.slot === slot
        );
        newCells[key] = {
          description: item?.description || "",
          allergens: item?.allergens || [],
        };
      });
    });
    setCells(newCells);
    setDirty(true);
    toast({ description: "Menu copied from previous week" });
  }, [prevMenuWeek]);

  // Mobile day selector
  const [mobileDay, setMobileDay] = useState<(typeof DAYS)[number]>("monday");

  // Active cell for allergen editor
  const [activeCell, setActiveCell] = useState<CellKey | null>(null);

  return (
    <div className="space-y-6">
      {/* Week Navigation */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset((o) => o + 1)}
              className="p-2 rounded-lg border border-border hover:bg-surface/50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-foreground min-w-[140px] sm:min-w-[220px] text-center">
              {formatWeekLabel(selectedWeek)}
            </span>
            <button
              onClick={() => setWeekOffset((o) => o - 1)}
              className="p-2 rounded-lg border border-border hover:bg-surface/50 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-xs text-brand hover:underline ml-2"
              >
                Today
              </button>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={!dirty || saveMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={handleCopyPrevWeek}
            disabled={!prevMenuWeek?.items?.length}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground/80 bg-card border border-border rounded-lg hover:bg-surface/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Copy menu from previous week"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy Last Week
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground/80 bg-card border border-border rounded-lg hover:bg-surface/50 transition-colors disabled:opacity-50"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Upload Menu
          </button>
          <AiButton
            templateSlug="services/menu-planner"
            variables={{
              serviceName: "this centre",
              existingMenus: Object.entries(cells)
                .filter(([, v]) => v.description)
                .map(([k, v]) => `${k}: ${v.description}`)
                .join("; ") || "None planned yet",
              dietaryNotes: "All food must be halal. Check for common allergens.",
              budget: "Standard OSHC budget",
            }}
            onResult={(text) => setAiSuggestion(text)}
            label="AI Menu"
            size="sm"
            section="services"
          />
          <AiButton
            templateSlug="services/allergen-check"
            variables={{
              menuItems: Object.entries(cells)
                .filter(([, v]) => v.description)
                .map(([k, v]) => `${k}: ${v.description} [allergens: ${v.allergens.length > 0 ? v.allergens.join(", ") : "none tagged"}]`)
                .join("\n") || "No menu items",
              allergenOptions: ALLERGEN_OPTIONS.join(", "),
            }}
            onResult={(text) => setAllergenCheckResult(text)}
            label="Check Allergens"
            size="sm"
            section="services"
            disabled={!Object.values(cells).some((c) => c.description)}
          />
        </div>
      </div>

      {/* AI Suggestion Panel */}
      {aiSuggestion && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-purple-800">AI Menu Suggestion</h4>
            <button
              onClick={() => setAiSuggestion(null)}
              className="text-purple-400 hover:text-purple-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="text-sm text-purple-900 whitespace-pre-wrap prose prose-sm max-w-none">
            {aiSuggestion}
          </div>
          <p className="text-xs text-purple-500 mt-2">
            Copy the suggestions above into the menu grid below. You can edit them as needed.
          </p>
        </div>
      )}

      {/* Allergen Check Results */}
      {allergenCheckResult && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-amber-800 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" />
              Allergen &amp; Dietary Check
            </h4>
            <button
              onClick={() => setAllergenCheckResult(null)}
              className="text-amber-400 hover:text-amber-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="text-sm text-amber-900 whitespace-pre-wrap prose prose-sm max-w-none">
            {allergenCheckResult}
          </div>
        </div>
      )}

      {/* Uploaded file preview */}
      {menuWeek?.fileUrl && (
        <div className="flex items-center gap-3 p-3 bg-surface/50 rounded-lg border border-border">
          {menuWeek.fileUrl.match(/\.(png|jpg|jpeg|webp)$/i) ? (
            <ImageIcon className="w-5 h-5 text-muted" />
          ) : (
            <FileText className="w-5 h-5 text-muted" />
          )}
          <span className="text-sm text-foreground/80 flex-1 truncate">
            {menuWeek.fileName || "Menu file"}
          </span>
          <a
            href={menuWeek.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
          >
            <Download className="w-3.5 h-3.5" />
            View
          </a>
        </div>
      )}

      {/* Menu Grid */}
      {isLoading ? (
        <div className="space-y-3">
          <div className="flex gap-2 sm:hidden">
            {DAYS.map((_, i) => <Skeleton key={i} className="h-8 flex-1 rounded-lg" />)}
          </div>
          <div className="hidden sm:block space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-2">
                <Skeleton className="h-20 w-24" />
                {DAYS.map((_, j) => <Skeleton key={j} className="h-20 flex-1 rounded-lg" />)}
              </div>
            ))}
          </div>
          <div className="sm:hidden space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Mobile: Day selector + vertical meal cards */}
          <div className="sm:hidden space-y-4">
            <div className="flex gap-1 bg-surface rounded-lg p-1">
              {DAYS.map((day) => (
                <button
                  key={day}
                  onClick={() => setMobileDay(day)}
                  className={cn(
                    "flex-1 text-xs font-medium py-2 rounded-md transition-colors",
                    mobileDay === day
                      ? "bg-card text-brand shadow-sm"
                      : "text-muted hover:text-foreground/80"
                  )}
                >
                  {DAY_LABELS[day]}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {SLOTS.map((slot) => {
                const key = cellKey(mobileDay, slot);
                const cell = cells[key] || { description: "", allergens: [] };
                const isActive = activeCell === key;

                return (
                  <div key={slot} className="space-y-1">
                    <label className="text-xs font-semibold text-foreground/80">
                      {SLOT_LABELS[slot]}
                    </label>
                    <div
                      className={cn(
                        "relative rounded-lg border p-3 transition-colors",
                        isActive
                          ? "border-brand ring-1 ring-brand/20"
                          : "border-border"
                      )}
                    >
                      <textarea
                        value={cell.description}
                        onChange={(e) =>
                          updateCell(key, "description", e.target.value)
                        }
                        onFocus={() => setActiveCell(key)}
                        onBlur={() =>
                          setTimeout(() => setActiveCell(null), 200)
                        }
                        placeholder="Enter menu items..."
                        rows={3}
                        className="w-full text-sm text-foreground/80 resize-none bg-transparent border-0 p-0 focus:outline-none focus:ring-0 placeholder:text-muted"
                      />
                      <div className="flex flex-wrap gap-1 mt-1">
                        {cell.allergens.map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => toggleAllergen(key, a)}
                            className={cn(
                              "px-1.5 py-0.5 text-[10px] font-medium rounded-full",
                              ALLERGEN_COLORS[a] || "bg-gray-100 text-gray-600"
                            )}
                          >
                            {a}
                            <X className="w-2 h-2 inline ml-0.5" />
                          </button>
                        ))}
                      </div>
                      {isActive && (
                        <div className="flex flex-wrap gap-1 mt-1 pt-1 border-t border-border/50">
                          {ALLERGEN_OPTIONS.filter(
                            (a) => !cell.allergens.includes(a)
                          ).map((a) => (
                            <button
                              key={a}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                toggleAllergen(key, a);
                              }}
                              className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-surface/50 text-muted hover:bg-surface hover:text-muted"
                            >
                              + {a}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Desktop: Full table grid */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider p-2 w-28">
                    Meal
                  </th>
                  {DAYS.map((day) => (
                    <th
                      key={day}
                      className="text-left text-xs font-medium text-muted uppercase tracking-wider p-2"
                    >
                      {DAY_LABELS[day]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SLOTS.map((slot) => (
                  <tr key={slot} className="border-t border-border/50">
                    <td className="p-2 align-top">
                      <span className="text-xs font-medium text-foreground/80 whitespace-nowrap">
                        {SLOT_LABELS[slot]}
                      </span>
                    </td>
                    {DAYS.map((day) => {
                      const key = cellKey(day, slot);
                      const cell = cells[key] || { description: "", allergens: [] };
                      const isActive = activeCell === key;

                      return (
                        <td key={day} className="p-1 align-top">
                          <div
                            className={cn(
                              "relative rounded-lg border p-2 min-h-[80px] transition-colors",
                              isActive
                                ? "border-brand ring-1 ring-brand/20"
                                : "border-border hover:border-border"
                            )}
                          >
                            <textarea
                              value={cell.description}
                              onChange={(e) =>
                                updateCell(key, "description", e.target.value)
                              }
                              onFocus={() => setActiveCell(key)}
                              onBlur={() =>
                                setTimeout(() => setActiveCell(null), 200)
                              }
                              placeholder="Enter menu items..."
                              rows={2}
                              className="w-full text-xs text-foreground/80 resize-none bg-transparent border-0 p-0 focus:outline-none focus:ring-0 placeholder:text-muted"
                            />
                            {/* Allergen chips */}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {cell.allergens.map((a) => (
                                <button
                                  key={a}
                                  type="button"
                                  onClick={() => toggleAllergen(key, a)}
                                  className={cn(
                                    "px-1.5 py-0.5 text-[10px] font-medium rounded-full",
                                    ALLERGEN_COLORS[a] || "bg-gray-100 text-gray-600"
                                  )}
                                >
                                  {a}
                                  <X className="w-2 h-2 inline ml-0.5" />
                                </button>
                              ))}
                            </div>
                            {/* Allergen picker on focus */}
                            {isActive && (
                              <div className="flex flex-wrap gap-1 mt-1 pt-1 border-t border-border/50">
                                {ALLERGEN_OPTIONS.filter(
                                  (a) => !cell.allergens.includes(a)
                                ).map((a) => (
                                  <button
                                    key={a}
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      toggleAllergen(key, a);
                                    }}
                                    className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-surface/50 text-muted hover:bg-surface hover:text-muted"
                                  >
                                    + {a}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-foreground/80 mb-1">
          Weekly Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setDirty(true);
          }}
          rows={2}
          placeholder="General notes for this week's menu..."
          className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
        />
      </div>

      {/* Allergen Legend */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted font-medium">Allergens:</span>
        {ALLERGEN_OPTIONS.map((a) => (
          <span
            key={a}
            className={cn(
              "px-2 py-0.5 text-[10px] font-medium rounded-full capitalize",
              ALLERGEN_COLORS[a] || "bg-gray-100 text-gray-600"
            )}
          >
            {a}
          </span>
        ))}
      </div>

      {/* Dirty indicator */}
      {dirty && (
        <p className="text-xs text-amber-600 text-center">
          You have unsaved changes. Click &quot;Save Menu&quot; to save.
        </p>
      )}
    </div>
  );
}
