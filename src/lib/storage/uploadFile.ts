import { put, del } from "@vercel/blob";

/**
 * Upload a file to Vercel Blob storage.
 *
 * @param file - File or Buffer to upload
 * @param path - Storage path (e.g. "documents/{childId}/{type}/{filename}")
 * @param contentType - MIME type (e.g. "application/pdf", "image/jpeg")
 * @returns Public URL of the uploaded file
 */
export async function uploadFile(
  file: File | Buffer,
  path: string,
  contentType: string,
): Promise<string> {
  const blob = await put(path, file, {
    access: "public",
    contentType,
    addRandomSuffix: true,
  });
  return blob.url;
}

/**
 * Delete a file from Vercel Blob storage by its URL.
 */
export async function deleteFile(url: string): Promise<void> {
  try {
    await del(url);
  } catch {
    // Swallow errors — file may already be deleted or URL invalid
  }
}
