/**
 * Trusted upload URL validation.
 *
 * When a parent-reported absence attaches a medical certificate URL, we must
 * verify the URL was issued by our own upload endpoint — never trust an
 * arbitrary URL pasted by a client. This guards against abuse (linking to
 * a malicious page that we would later embed in a PDF or staff UI).
 */

const BLOB_HOSTNAME_SUFFIX = ".public.blob.vercel-storage.com";

export function isTrustedBlobUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.hostname.endsWith(BLOB_HOSTNAME_SUFFIX)) return true;
    const extra = (process.env.TRUSTED_UPLOAD_HOST ?? "").trim();
    if (extra && u.hostname === extra) return true;
    return false;
  } catch {
    return false;
  }
}
