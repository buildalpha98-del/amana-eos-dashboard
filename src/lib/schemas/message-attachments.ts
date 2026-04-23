import { z } from "zod";

/**
 * Allowed hostnames for message attachment URLs.
 * Only accept URLs from our own storage — no arbitrary external URLs.
 */
const ALLOWED_ATTACHMENT_HOSTS = new Set([
  // Vercel Blob — URLs match *.public.blob.vercel-storage.com
  "public.blob.vercel-storage.com",
]);

/** Vercel Blob URLs use random subdomains, so we check if the hostname ends with the allowed domain. */
function isAllowedAttachmentHost(hostname: string): boolean {
  return (
    ALLOWED_ATTACHMENT_HOSTS.has(hostname) ||
    hostname.endsWith(".public.blob.vercel-storage.com")
  );
}

export const safeAttachmentUrl = z
  .string()
  .url("Invalid attachment URL")
  .refine(
    (url) => {
      try {
        const { hostname } = new URL(url);
        return isAllowedAttachmentHost(hostname);
      } catch {
        return false;
      }
    },
    { message: "Attachment URL must be from an approved storage domain" },
  );

/** Max attachments per message (both parent- and staff-side). */
export const MAX_ATTACHMENTS_PER_MESSAGE = 6;

export const attachmentUrlsField = z
  .array(safeAttachmentUrl)
  .max(MAX_ATTACHMENTS_PER_MESSAGE, `Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments`)
  .default([]);

export const optionalAttachmentUrlsField = z
  .array(safeAttachmentUrl)
  .max(MAX_ATTACHMENTS_PER_MESSAGE, `Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments`)
  .optional();
