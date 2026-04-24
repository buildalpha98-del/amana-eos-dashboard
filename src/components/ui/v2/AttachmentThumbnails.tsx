"use client";

import { Loader2, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageAttachment } from "./useMessageAttachments";

export interface AttachmentThumbnailsProps {
  attachments: MessageAttachment[];
  onRemove: (id: string) => void;
  className?: string;
}

/**
 * Row of thumbnails shown inside a composer while a user is staging
 * attachments. Shows per-thumb upload state (spinner / error icon) and a close
 * button to remove.
 */
export function AttachmentThumbnails({
  attachments,
  onRemove,
  className,
}: AttachmentThumbnailsProps) {
  if (attachments.length === 0) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-2 overflow-x-auto pb-1",
        className,
      )}
    >
      {attachments.map((att) => (
        <div
          key={att.id}
          className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-[#e8e4df] bg-[#f8f5f2]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={att.previewUrl}
            alt={att.file.name}
            className="w-full h-full object-cover"
          />

          {/* Upload-in-progress overlay */}
          {att.status === "uploading" && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/35"
              aria-label="Uploading"
              role="status"
            >
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            </div>
          )}

          {/* Failure indicator */}
          {att.status === "failed" && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-red-500/60"
              aria-label={att.error ?? "Upload failed"}
              title={att.error ?? "Upload failed"}
            >
              <AlertCircle className="w-4 h-4 text-white" />
            </div>
          )}

          {/* Remove button */}
          <button
            type="button"
            onClick={() => onRemove(att.id)}
            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center"
            aria-label={`Remove ${att.file.name}`}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
