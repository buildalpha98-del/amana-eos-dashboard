"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/useToast";

export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_ATTACHMENTS = 6;

const ALLOWED_MIME_PREFIX = "image/";

export type AttachmentStatus = "uploading" | "done" | "failed";

export interface MessageAttachment {
  id: string;
  previewUrl: string; // local object URL (for display)
  file: File;
  status: AttachmentStatus;
  url?: string; // remote URL after successful upload
  error?: string;
}

export interface UseMessageAttachmentsOptions {
  /** Absolute path to upload endpoint returning `{ url }`. */
  endpoint: string;
  /** Called when the final file limit would be exceeded. */
  onOverLimit?: (attempted: number, max: number) => void;
}

export interface UseMessageAttachmentsResult {
  attachments: MessageAttachment[];
  addFiles: (files: FileList | File[]) => void;
  remove: (id: string) => void;
  reset: () => void;
  /** URLs of successfully uploaded attachments, in order. */
  uploadedUrls: string[];
  isUploading: boolean;
  canAddMore: boolean;
}

function newId() {
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Manage a list of in-flight + completed image attachments for a message
 * composer. Uploads sequentially so we don't blast the server, revokes object
 * URLs on unmount, and caps at `MAX_ATTACHMENTS` files / `MAX_ATTACHMENT_SIZE`
 * per file.
 */
export function useMessageAttachments(
  options: UseMessageAttachmentsOptions,
): UseMessageAttachmentsResult {
  const { endpoint, onOverLimit } = options;

  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  // Keep a ref mirror of the previews we created so we can revoke them on
  // unmount even if React has already cleared state for a fast navigation.
  const createdUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      for (const url of createdUrls.current) URL.revokeObjectURL(url);
      createdUrls.current.clear();
    };
  }, []);

  const uploadOne = useCallback(
    async (att: MessageAttachment) => {
      const formData = new FormData();
      formData.append("file", att.file);

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!res.ok) {
          let message = `Upload failed (${res.status})`;
          try {
            const json = await res.json();
            if (json?.error) message = json.error;
          } catch {
            /* ignore */
          }
          throw new Error(message);
        }

        const json: unknown = await res.json();
        const url =
          json && typeof json === "object" && "url" in json
            ? ((json as { url: unknown }).url as string | undefined)
            : undefined;

        if (!url || typeof url !== "string") {
          throw new Error("Upload response missing url");
        }

        setAttachments((prev) =>
          prev.map((a) =>
            a.id === att.id ? { ...a, status: "done", url } : a,
          ),
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to upload image";
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === att.id ? { ...a, status: "failed", error: message } : a,
          ),
        );
        toast({ variant: "destructive", description: message });
      }
    },
    [endpoint],
  );

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const arr = Array.from(incoming);
      if (arr.length === 0) return;

      setAttachments((prev) => {
        const spaceLeft = MAX_ATTACHMENTS - prev.length;
        if (spaceLeft <= 0) {
          onOverLimit?.(prev.length + arr.length, MAX_ATTACHMENTS);
          toast({
            variant: "destructive",
            description: `You can attach up to ${MAX_ATTACHMENTS} images per message`,
          });
          return prev;
        }

        const accepted: MessageAttachment[] = [];
        const rejected: string[] = [];

        for (const file of arr.slice(0, spaceLeft)) {
          if (!file.type.startsWith(ALLOWED_MIME_PREFIX)) {
            rejected.push(`${file.name}: not an image`);
            continue;
          }
          if (file.size > MAX_ATTACHMENT_SIZE) {
            rejected.push(`${file.name}: over 5MB`);
            continue;
          }
          const previewUrl = URL.createObjectURL(file);
          createdUrls.current.add(previewUrl);
          accepted.push({
            id: newId(),
            previewUrl,
            file,
            status: "uploading",
          });
        }

        if (arr.length > spaceLeft) {
          toast({
            variant: "destructive",
            description: `Only ${spaceLeft} more image${spaceLeft === 1 ? "" : "s"} will fit (${MAX_ATTACHMENTS} max)`,
          });
          onOverLimit?.(prev.length + arr.length, MAX_ATTACHMENTS);
        }

        if (rejected.length > 0) {
          toast({
            variant: "destructive",
            description: rejected.slice(0, 3).join("; "),
          });
        }

        // Kick off uploads sequentially after state commit.
        if (accepted.length > 0) {
          queueMicrotask(async () => {
            for (const att of accepted) {
              // eslint-disable-next-line no-await-in-loop
              await uploadOne(att);
            }
          });
        }

        return [...prev, ...accepted];
      });
    },
    [onOverLimit, uploadOne],
  );

  const remove = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        createdUrls.current.delete(target.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const reset = useCallback(() => {
    setAttachments((prev) => {
      for (const att of prev) {
        URL.revokeObjectURL(att.previewUrl);
        createdUrls.current.delete(att.previewUrl);
      }
      return [];
    });
  }, []);

  const uploadedUrls = attachments
    .filter((a) => a.status === "done" && a.url)
    .map((a) => a.url!) as string[];
  const isUploading = attachments.some((a) => a.status === "uploading");
  const canAddMore = attachments.length < MAX_ATTACHMENTS;

  return {
    attachments,
    addFiles,
    remove,
    reset,
    uploadedUrls,
    isUploading,
    canAddMore,
  };
}
