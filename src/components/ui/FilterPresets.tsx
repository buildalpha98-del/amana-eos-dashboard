"use client";

import { useState, useRef, useEffect } from "react";
import { X, Save, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSavedFilters } from "@/hooks/useSavedFilters";
import { toast } from "@/hooks/useToast";

interface FilterPresetsProps {
  pageKey: string;
  currentFilters: Record<string, string>;
  onLoadPreset: (filters: Record<string, string>) => void;
}

export function FilterPresets({ pageKey, currentFilters, onLoadPreset }: FilterPresetsProps) {
  const { presets, activePreset, savePreset, loadPreset, deletePreset, clearActive } =
    useSavedFilters(pageKey);

  const [showSavePopover, setShowSavePopover] = useState(false);
  const [presetName, setPresetName] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!showSavePopover) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowSavePopover(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSavePopover]);

  // Focus input when popover opens
  useEffect(() => {
    if (showSavePopover) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showSavePopover]);

  const handleSave = () => {
    const name = presetName.trim();
    if (!name) return;
    if (presets.length >= 5) {
      toast({ description: "Maximum 5 presets per page. Delete one first." });
      return;
    }
    // Only save non-empty filter values
    const nonEmpty: Record<string, string> = {};
    for (const [k, v] of Object.entries(currentFilters)) {
      if (v) nonEmpty[k] = v;
    }
    if (Object.keys(nonEmpty).length === 0) {
      toast({ description: "Set some filters before saving a preset." });
      return;
    }
    savePreset(name, nonEmpty);
    setPresetName("");
    setShowSavePopover(false);
    toast({ description: `Preset "${name}" saved.` });
  };

  const handleLoad = (id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    loadPreset(id);
    onLoadPreset(preset.filters);
  };

  const handleClear = () => {
    clearActive();
  };

  // Don't render anything if no presets and no active filters to save
  const hasAnyFilter = Object.values(currentFilters).some((v) => !!v);
  if (presets.length === 0 && !hasAnyFilter) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-0.5 -mb-0.5 scrollbar-hide">
      <Bookmark className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />

      {/* Preset pills */}
      {presets.map((preset) => {
        const isActive = activePreset?.id === preset.id;
        return (
          <button
            key={preset.id}
            onClick={() => handleLoad(preset.id)}
            className={cn(
              "group relative inline-flex items-center gap-1 bg-surface border rounded-full px-3 py-1 text-sm cursor-pointer transition-colors whitespace-nowrap flex-shrink-0",
              isActive
                ? "border-brand bg-brand/10 text-brand"
                : "border-border hover:border-brand text-foreground"
            )}
          >
            {preset.name}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                deletePreset(preset.id);
                toast({ description: `Preset "${preset.name}" deleted.` });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  deletePreset(preset.id);
                  toast({ description: `Preset "${preset.name}" deleted.` });
                }
              }}
              className="md:opacity-0 md:group-hover:opacity-100 opacity-60 transition-opacity ml-0.5"
              aria-label={`Delete preset ${preset.name}`}
            >
              <X className="w-3 h-3" />
            </span>
          </button>
        );
      })}

      {/* Clear active */}
      {activePreset && (
        <button
          onClick={handleClear}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap flex-shrink-0"
        >
          Clear
        </button>
      )}

      {/* Save Current button + popover */}
      {hasAnyFilter && presets.length < 5 && (
        <div className="relative flex-shrink-0" ref={popoverRef}>
          <button
            onClick={() => setShowSavePopover(!showSavePopover)}
            className="inline-flex items-center gap-1 bg-surface border border-border rounded-full px-3 py-1 text-sm text-muted-foreground hover:text-foreground hover:border-brand transition-colors whitespace-nowrap"
          >
            <Save className="w-3 h-3" />
            Save Current
          </button>

          {showSavePopover && (
            <div className="absolute top-full mt-2 left-0 z-50 bg-card border border-border rounded-lg shadow-lg p-3 w-56">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Preset name
              </label>
              <input
                ref={inputRef}
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") setShowSavePopover(false);
                }}
                placeholder="e.g. My open items"
                maxLength={30}
                className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              />
              <button
                onClick={handleSave}
                disabled={!presetName.trim()}
                className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand-hover transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                Save
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
