/**
 * Shrink a photo in the browser before it's uploaded.
 *
 * WHY IN THE BROWSER: a phone camera produces 3–8 MB images, and a post
 * with four of them is a 20 MB upload over a school's wifi followed by a
 * 20 MB download for every family who scrolls past it. Doing it here
 * means the big file never leaves the device.
 *
 * Deliberately conservative:
 *  - Only downscales. An image already under the cap is returned as-is
 *    rather than re-encoded, which would lose quality for nothing.
 *  - Falls back to the ORIGINAL file on any failure. A photo that
 *    uploads slightly too large beats a photo that doesn't upload.
 *  - Leaves non-raster types alone entirely.
 */

/** Long edge, in pixels. 1600 fills a retina phone with room to zoom. */
const MAX_EDGE = 1600;
const QUALITY = 0.82;

const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function downscaleImage(file: File): Promise<File> {
  if (!RESIZABLE.has(file.type)) return file;
  if (typeof createImageBitmap !== "function") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);

    if (longest <= MAX_EDGE) {
      bitmap.close?.();
      return file;
    }

    const scale = MAX_EDGE / longest;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    // PNGs of photos balloon; re-encode everything as JPEG. A PNG that
    // was a screenshot loses nothing a parent will notice on a phone.
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], renameToJpg(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    // Any failure — an unsupported codec, a memory limit on an old
    // phone — and the original goes up untouched.
    return file;
  }
}

function renameToJpg(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "photo"}.jpg`;
}
