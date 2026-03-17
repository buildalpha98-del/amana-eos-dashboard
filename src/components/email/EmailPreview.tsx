"use client";

import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";

interface Props {
  html: string;
}

export default function EmailPreview({ html }: Props) {
  const [width, setWidth] = useState<600 | 375>(600);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setWidth(600)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
            width === 600
              ? "bg-brand text-white"
              : "bg-surface text-muted hover:bg-hover"
          }`}
        >
          <Monitor className="h-4 w-4" />
          Desktop
        </button>
        <button
          type="button"
          onClick={() => setWidth(375)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
            width === 375
              ? "bg-brand text-white"
              : "bg-surface text-muted hover:bg-hover"
          }`}
        >
          <Smartphone className="h-4 w-4" />
          Mobile
        </button>
        <span className="text-xs text-muted">{width}px</span>
      </div>

      {/* Preview */}
      <div className="flex justify-center rounded-lg border border-border bg-gray-50 p-4">
        {html ? (
          <iframe
            srcDoc={html}
            sandbox="allow-same-origin"
            style={{ width: `${width}px`, minHeight: "400px", border: "none" }}
            className="rounded bg-white"
            title="Email preview"
          />
        ) : (
          <div className="flex min-h-[400px] items-center justify-center text-sm text-muted">
            No content to preview
          </div>
        )}
      </div>
    </div>
  );
}
