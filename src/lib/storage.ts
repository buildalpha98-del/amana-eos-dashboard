import { put, del } from "@vercel/blob";

/**
 * Upload a file to Vercel Blob storage.
 *
 * Defaults to `access: "public"` — the stored URL is opened directly by the
 * browser (e.g. via `<a href>` for document downloads, `<img src>` for avatars).
 * Private blobs return a 403 "Forbidden" page when navigated to without a
 * signed URL, which surfaced as the documents "FORBIDDEN" bug.
 *
 * Callers that store sensitive exports (e.g. CSV backups) can opt into
 * `access: "private"` explicitly.
 *
 * Returns the blob URL and file size.
 */
export async function uploadFile(
  file: Buffer,
  filename: string,
  options?: { contentType?: string; folder?: string; access?: "public" | "private" },
): Promise<{ url: string; size: number }> {
  const path = options?.folder ? `${options.folder}/${filename}` : filename;

  const blob = await put(path, file, {
    access: options?.access ?? "public",
    contentType: options?.contentType,
    addRandomSuffix: true,
  });

  return { url: blob.url, size: file.byteLength };
}

/**
 * Delete a file from Vercel Blob storage by its URL.
 */
export async function deleteFile(url: string): Promise<void> {
  await del(url);
}
