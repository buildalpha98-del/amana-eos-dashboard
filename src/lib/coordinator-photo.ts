/**
 * Coordinator photos in parent emails go through /api/public/coordinator-photo,
 * which crops them square so the round frame always fits (20 Oct 2026).
 */
import { isTrustedBlobUrl } from "@/lib/trusted-urls";

const WEBSITE_HOSTS = new Set(["amanaoshc.com.au", "www.amanaoshc.com.au"]);
/** Bump when the crop changes, so cached copies of the old crop are skipped. */
const CROP_VERSION = 2;
const BASE = () => process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";

/** Only our website or our Vercel Blob storage — never an arbitrary URL. */
export function isAllowedPhotoSource(src: string): boolean {
  try {
    const u = new URL(src);
    if (u.protocol !== "https:") return false;
    return WEBSITE_HOSTS.has(u.hostname) || isTrustedBlobUrl(src);
  } catch {
    return false;
  }
}

/** The square-cropped version of a coordinator photo, or the original if it isn't one we can crop. */
/** `base` "" gives a same-origin path (dashboard previews); emails need the full URL. */
export function croppedCoordinatorPhoto(src: string, base: string = BASE()): string {
  return isAllowedPhotoSource(src)
    ? `${base}/api/public/coordinator-photo?v=${CROP_VERSION}&src=${encodeURIComponent(src)}`
    : src;
}
