import { z } from "zod";

/** Must match Prisma `ParentPostType` enum values exactly. */
const parentPostTypes = ["observation", "announcement", "reminder"] as const;

/**
 * Allowed hostnames for media URLs.
 * Only accept URLs from our own storage — no arbitrary external URLs.
 */
const ALLOWED_MEDIA_HOSTS = new Set([
  // Vercel Blob — URLs match *.public.blob.vercel-storage.com
  "public.blob.vercel-storage.com",
]);

/** Vercel Blob URLs use random subdomains, so we check if the hostname ends with the allowed domain. */
function isAllowedMediaHost(hostname: string): boolean {
  return ALLOWED_MEDIA_HOSTS.has(hostname) || hostname.endsWith(".public.blob.vercel-storage.com");
}

const safeMediaUrl = z
  .string()
  .url("Invalid media URL")
  .refine(
    (url) => {
      try {
        const { hostname } = new URL(url);
        return isAllowedMediaHost(hostname);
      } catch {
        return false;
      }
    },
    { message: "Media URL must be from an approved storage domain" },
  );

export const createParentPostSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  content: z.string().min(1, "Content is required").max(5000, "Content too long"),
  type: z.enum(parentPostTypes).default("observation"),
  mediaUrls: z.array(safeMediaUrl).max(6, "Maximum 6 media files").default([]),
  isCommunity: z.boolean().default(false),
  childIds: z.array(z.string().min(1)).max(200, "Too many children tagged").default([]),
});

export type CreateParentPostInput = z.input<typeof createParentPostSchema>;

export const updateParentPostSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long").optional(),
  content: z.string().min(1, "Content is required").max(5000, "Content too long").optional(),
  type: z.enum(parentPostTypes).optional(),
  mediaUrls: z.array(safeMediaUrl).max(6, "Maximum 6 media files").optional(),
  isCommunity: z.boolean().optional(),
  childIds: z.array(z.string().min(1)).max(200, "Too many children tagged").optional(),
});

export type UpdateParentPostInput = z.input<typeof updateParentPostSchema>;
