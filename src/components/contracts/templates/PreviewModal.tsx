"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { usePreviewContractTemplate } from "@/hooks/useContractTemplates";

export function PreviewModal({
  templateId,
  onClose,
}: {
  templateId: string;
  onClose: () => void;
}) {
  const preview = usePreviewContractTemplate();
  const [html, setHtml] = useState<string>("");
  const [missingTags, setMissingTags] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    preview.mutateAsync({ id: templateId }).then((res) => {
      if (cancelled) return;
      setHtml(res.html);
      setMissingTags(res.missingTags ?? []);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl w-full max-w-4xl h-[90vh] flex flex-col shadow-xl">
        <header className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold">Preview (sample data)</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="p-1 rounded hover:bg-surface"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {missingTags.length > 0 && (
          <div className="bg-amber-50 border-b border-amber-200 p-3 text-sm text-amber-800 shrink-0">
            ⚠ Template references {missingTags.length} unknown tag
            {missingTags.length === 1 ? "" : "s"}: {missingTags.join(", ")}
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {preview.isPending ? (
            <div className="p-8 text-center text-muted-foreground">
              Rendering preview…
            </div>
          ) : (
            <iframe
              title="Contract preview"
              sandbox="allow-same-origin"
              srcDoc={html}
              className="w-full h-full bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}
