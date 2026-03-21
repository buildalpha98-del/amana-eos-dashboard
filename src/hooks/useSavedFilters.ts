import { useState, useCallback, useEffect } from "react";

export interface FilterPreset {
  id: string;
  name: string;
  filters: Record<string, string>;
}

interface SavedFiltersState {
  presets: FilterPreset[];
  activePresetId: string | null;
}

const MAX_PRESETS = 5;

function storageKey(pageKey: string) {
  return `amana-filters-${pageKey}`;
}

function loadState(pageKey: string): SavedFiltersState {
  if (typeof window === "undefined") return { presets: [], activePresetId: null };
  try {
    const raw = localStorage.getItem(storageKey(pageKey));
    if (!raw) return { presets: [], activePresetId: null };
    const parsed = JSON.parse(raw);
    return {
      presets: Array.isArray(parsed.presets) ? parsed.presets : [],
      activePresetId: parsed.activePresetId ?? null,
    };
  } catch {
    return { presets: [], activePresetId: null };
  }
}

function persistState(pageKey: string, state: SavedFiltersState) {
  try {
    localStorage.setItem(storageKey(pageKey), JSON.stringify(state));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function useSavedFilters(pageKey: string) {
  const [state, setState] = useState<SavedFiltersState>(() => loadState(pageKey));

  // Sync to localStorage on every change
  useEffect(() => {
    persistState(pageKey, state);
  }, [pageKey, state]);

  const presets = state.presets;
  const activePreset = presets.find((p) => p.id === state.activePresetId) ?? null;

  const savePreset = useCallback(
    (name: string, filters: Record<string, string>) => {
      setState((prev) => {
        if (prev.presets.length >= MAX_PRESETS) return prev;
        const id = `fp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const newPreset: FilterPreset = { id, name, filters };
        const next = {
          presets: [...prev.presets, newPreset],
          activePresetId: id,
        };
        return next;
      });
    },
    [],
  );

  const loadPreset = useCallback((id: string) => {
    setState((prev) => ({ ...prev, activePresetId: id }));
  }, []);

  const deletePreset = useCallback((id: string) => {
    setState((prev) => ({
      presets: prev.presets.filter((p) => p.id !== id),
      activePresetId: prev.activePresetId === id ? null : prev.activePresetId,
    }));
  }, []);

  const clearActive = useCallback(() => {
    setState((prev) => ({ ...prev, activePresetId: null }));
  }, []);

  return { presets, activePreset, savePreset, loadPreset, deletePreset, clearActive };
}
