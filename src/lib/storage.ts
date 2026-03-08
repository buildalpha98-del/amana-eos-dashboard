import { put, del } from "@vercel/blob";

/**
 * Upload a file to Vercel Blob storage.
 *
 * Returns the public blob URL and file size.
 */
export async function uploadFile(
  file: Buffer,
  filename: string,
  options?: { contentType?: string; folder?: string },
): Promise<{ url: string; size: number }> {
  const path = options?.folder ? `${options.folder}/${filename}` : filename;

  const blob = await put(path, file, {
    access: "public",
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
