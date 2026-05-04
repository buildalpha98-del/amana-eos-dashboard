import { useEffect, useRef, useState, useCallback } from "react";
import { useUpdateContractTemplate } from "./useContractTemplates";
import type { ManualField } from "@/lib/contract-templates/manual-fields-schema";

export type AutosaveValue = {
  name: string;
  description?: string;
  contentJson: unknown; // TipTap doc JSON
  manualFields: ManualField[];
  status: "active" | "disabled";
};

export type AutosaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function useTemplateAutosave(args: {
  templateId: string;
  value: AutosaveValue;
  enabled?: boolean; // pass false until initial value is loaded so we don't autosave the empty stub
  onError?: (e: Error) => void;
}): {
  state: AutosaveState;
  lastSavedAt: Date | null;
  triggerSaveNow: () => void;
} {
  const update = useUpdateContractTemplate();
  const [state, setState] = useState<AutosaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const lastSavedSerializedRef = useRef<string>(JSON.stringify(args.value));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSave = useCallback(async () => {
    setState("saving");
    try {
      await update.mutateAsync({ id: args.templateId, ...args.value });
      lastSavedSerializedRef.current = JSON.stringify(args.value);
      setLastSavedAt(new Date());
      setState("saved");
    } catch (e) {
      setState("error");
      args.onError?.(e as Error);
    }
  }, [update, args]);

  // Detect changes -> mark dirty + schedule save
  useEffect(() => {
    if (args.enabled === false) return;
    const serialized = JSON.stringify(args.value);
    if (serialized === lastSavedSerializedRef.current) return;
    setState("dirty");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSave();
    }, 5000);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [args.value, args.enabled, performSave]);

  const triggerSaveNow = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (JSON.stringify(args.value) !== lastSavedSerializedRef.current) {
      performSave();
    }
  }, [args.value, performSave]);

  return { state, lastSavedAt, triggerSaveNow };
}
