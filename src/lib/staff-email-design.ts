/**
 * Designed staff emails (Daniel, 12 Oct 2026): a StaffUpdate with `blocks`
 * is built in the same block builder as parent marketing emails, from the
 * shared template library, and goes out as its OWN email rather than inside
 * the Monday round-up.
 *
 * Pure (no prisma) so the composer's live preview renders the SAME HTML the
 * server sends.
 */
import { renderBlocksToHtml, type EmailBlock, type EmailLayoutOptions } from "@/lib/email-marketing-layout";

/** Staff mail has no unsubscribe link — it's work communication, not marketing. */
export const STAFF_EMAIL_LAYOUT: EmailLayoutOptions = {
  headerColor: "#004E64",
  headerText: "Amana OSHC",
  footerText: "Amana OSHC · Staff update",
  footerUrl: "https://amanaoshc.com.au",
  footerUrlLabel: "amanaoshc.com.au",
  showUnsubscribe: false,
};

export function isDesigned(u: { blocks: unknown }): boolean {
  return Array.isArray(u.blocks) && u.blocks.length > 0;
}

/** Root-relative links ("/policies") need the dashboard origin in an email. */
function absolutise(blocks: EmailBlock[], origin: string): EmailBlock[] {
  const fix = (v?: string) => (v && /^\/(?!\/)/.test(v) ? `${origin}${v}` : v);
  return blocks.map((b) => ({ ...b, url: fix(b.url), linkUrl: fix(b.linkUrl) }));
}

export function staffDesignedHtml(
  blocks: EmailBlock[],
  person: { name: string },
  origin = "https://amanaoshc.company",
): string {
  // interpolateVariables inserts values RAW into HTML — escape them here.
  const esc = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const first = esc(person.name.trim().split(/\s+/)[0] || "there");
  return renderBlocksToHtml(
    absolutise(blocks, origin.replace(/\/$/, "")),
    { firstName: first, name: esc(person.name.trim()) || first },
    STAFF_EMAIL_LAYOUT,
  );
}

/** Plain-text summary of a designed email — the card preview + notification body. */
export function blocksSummary(blocks: EmailBlock[], max = 600): string {
  return blocks
    .map((b) => (b.type === "heading" ? b.text : b.type === "text" ? b.content : ""))
    .filter(Boolean)
    .join("\n\n")
    .slice(0, max);
}
